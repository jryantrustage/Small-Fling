package com.matrixcapture.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.matrixcapture.app.MatrixCaptureApp
import com.matrixcapture.app.capture.DisplayCaptureManager
import com.matrixcapture.app.capture.GutterOcrTracker
import com.matrixcapture.app.gemini.GeminiApiService
import com.matrixcapture.app.splicer.MarkdownAssembler
import com.matrixcapture.app.ui.MainActivity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

/**
 * Module C: Foreground Recording & Video Segment Management Service.
 *
 * Runs with foregroundServiceType="mediaProjection".
 * Orchestrates display capture, real-time gutter OCR tracking, video rotation,
 * and background Gemini extraction & assembly.
 */
class SegmentRecorderService : Service() {

    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private var captureManager: DisplayCaptureManager? = null
    private var gutterTracker: GutterOcrTracker? = null
    private var mediaProjection: MediaProjection? = null
    private lateinit var geminiApiService: GeminiApiService
    private lateinit var markdownAssembler: MarkdownAssembler

    private val segmentCounter = AtomicInteger(0)
    private val extractedSegments = mutableListOf<MarkdownAssembler.SegmentPayload>()
    private var wakeLock: PowerManager.WakeLock? = null

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "MatrixCapture:RecorderWakeLock"
                )
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(90 * 60 * 1000L) // 90 min max
                Log.i(TAG, "Screen WakeLock acquired in SegmentRecorderService.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock in SegmentRecorderService", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i(TAG, "Screen WakeLock released in SegmentRecorderService.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release wake lock in SegmentRecorderService", e)
        }
    }

    fun rotateSegment(handoverLine: Int, overlapLine: Int) {
        onRotateSegment(handoverLine, overlapLine)
    }

    private val _serviceState = MutableStateFlow(RecorderState())
    val serviceState = _serviceState.asStateFlow()

    inner class LocalBinder : Binder() {
        fun getService(): SegmentRecorderService = this@SegmentRecorderService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        instance = this
        val prefs = applicationContext.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        val saved = prefs.getString("gemini_api_key", "") ?: ""
        if (saved.isNotEmpty() && apiKey.isEmpty()) {
            apiKey = saved
        }
        markdownAssembler = MarkdownAssembler(applicationContext)
        geminiApiService = GeminiApiService { apiKey }
        Log.i(TAG, "SegmentRecorderService created with API key present: ${apiKey.isNotEmpty()}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        when (action) {
            ACTION_START -> {
                acquireWakeLock()
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val resultData = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
                startForegroundWithNotification()
                if (resultData != null) {
                    initCapture(resultCode, resultData)
                }
            }
            ACTION_STOP -> {
                stopWorkflow()
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, MatrixCaptureApp.CHANNEL_ID_RECORDER)
            .setContentTitle("MatrixCapture Active")
            .setContentText("Recording Desktop Mode on Display 1 & running gutter OCR")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            }
            startForeground(MatrixCaptureApp.NOTIFICATION_ID_RECORDER, notification, type)
        } else {
            startForeground(MatrixCaptureApp.NOTIFICATION_ID_RECORDER, notification)
        }
    }

    private fun initCapture(resultCode: Int, resultData: Intent) {
        serviceScope.launch {
            try {
                val mpManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                mediaProjection = mpManager.getMediaProjection(resultCode, resultData)

                // CRITICAL FOR ANDROID 14+: Register MediaProjection.Callback before creating any VirtualDisplay
                mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        super.onStop()
                        Log.i(TAG, "MediaProjection session terminated by system or user.")
                        _serviceState.value = _serviceState.value.copy(
                            isRecording = false,
                            isReady = false
                        )
                    }
                }, Handler(Looper.getMainLooper()))

                val recordingsDir = File(cacheDir, "segments")
                if (!recordingsDir.exists()) recordingsDir.mkdirs()

                captureManager = DisplayCaptureManager(
                    context = applicationContext,
                    mediaProjection = mediaProjection!!,
                    outputDirectory = recordingsDir
                )

                val displayInfo = captureManager!!.detectExternalDisplay()
                val width = displayInfo?.width ?: 1920
                val height = displayInfo?.height ?: 1080
                val densityDpi = displayInfo?.densityDpi ?: 320

                gutterTracker = GutterOcrTracker(serviceScope) { handoverLine, overlapLine ->
                    onRotateSegment(handoverLine, overlapLine)
                }

                captureManager!!.setupOcrVirtualDisplay(
                    width = width,
                    height = height,
                    densityDpi = densityDpi,
                    frameListener = gutterTracker!!.createFrameListener()
                )

                _serviceState.value = _serviceState.value.copy(
                    isReady = true,
                    targetDisplayInfo = displayInfo
                )
                Log.i(TAG, "Capture manager initialized successfully for Display ${displayInfo?.displayId}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize capture manager", e)
                _serviceState.value = _serviceState.value.copy(errorMessage = e.message)
            }
        }
    }

    /**
     * Begins recording the first video chunk and arms the gutter tracker.
     */
    fun startCaptureSession(startLine: Int = 1) {
        val cm = captureManager ?: run {
            Log.e(TAG, "Cannot start capture session: captureManager is null")
            return
        }
        try {
            acquireWakeLock()
            val currentIdx = segmentCounter.incrementAndGet()
            cm.startNewSegment(currentIdx, startLine)
            _serviceState.value = _serviceState.value.copy(
                isRecording = true,
                currentSegmentIndex = currentIdx,
                currentStartLine = startLine
            )
            Log.i(TAG, "Started capture session segment $currentIdx starting at line $startLine")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start capture session", e)
            _serviceState.value = _serviceState.value.copy(
                errorMessage = "Failed to start recording: ${e.message}"
            )
        }
    }

    /**
     * Invoked when GutterOcrTracker indicates ~1,200 lines have been reached.
     */
    private fun onRotateSegment(handoverLine: Int, overlapLine: Int) {
        serviceScope.launch {
            val cm = captureManager ?: return@launch
            Log.i(TAG, "Rotating segment at line $handoverLine; next segment starts at $overlapLine.")

            // 1. Finalize current segment
            val completed = cm.finalizeSegment(handoverLine)

            // 2. Immediately start next segment with overlap
            val nextIdx = segmentCounter.incrementAndGet()
            cm.startNewSegment(nextIdx, overlapLine)

            _serviceState.value = _serviceState.value.copy(
                currentSegmentIndex = nextIdx,
                currentStartLine = overlapLine,
                completedSegmentsCount = _serviceState.value.completedSegmentsCount + 1
            )

            // 3. Dispatch completed segment to Gemini File API pipeline
            if (completed != null) {
                processSegmentWithGemini(completed)
            }
        }
    }

    /**
     * Uploads completed MP4 segment, polls for ACTIVE status, runs OCR inference, and removes remote video.
     */
    private fun processSegmentWithGemini(segment: DisplayCaptureManager.CompletedSegment) {
        serviceScope.launch(Dispatchers.IO) {
            _serviceState.value = _serviceState.value.copy(
                processingStatus = "Uploading segment ${segment.segmentIndex} to Gemini..."
            )

            var remoteFileName: String? = null
            try {
                // Track segment status
                updateSegmentDetail(segment.segmentIndex, segment.startLine, segment.endLine, SegmentStatus.UPLOADING, 0, "Uploading to Gemini File API...")

                // Step 1: Upload
                val uploaded = geminiApiService.uploadVideo(segment.videoFile)
                remoteFileName = uploaded.name

                // Step 2: Poll status until ACTIVE
                updateSegmentDetail(segment.segmentIndex, segment.startLine, segment.endLine, SegmentStatus.PROCESSING, 0, "Gemini processing video...")
                _serviceState.value = _serviceState.value.copy(
                    processingStatus = "Awaiting Gemini processing for segment ${segment.segmentIndex}..."
                )
                val activeFile = geminiApiService.pollUntilActive(remoteFileName)

                // Step 3: Inference
                updateSegmentDetail(segment.segmentIndex, segment.startLine, segment.endLine, SegmentStatus.EXTRACTING, 0, "Gemini extracting OCR code...")
                _serviceState.value = _serviceState.value.copy(
                    processingStatus = "Extracting code for segment ${segment.segmentIndex} (Lines ${segment.startLine}-${segment.endLine})..."
                )
                val extractedMarkdown = geminiApiService.extractCodeFromSegment(
                    fileUri = activeFile.uri ?: "",
                    segmentIndex = segment.segmentIndex,
                    startLine = segment.startLine,
                    endLine = segment.endLine
                )

                val lineCount = extractedMarkdown.lines().size
                updateSegmentDetail(segment.segmentIndex, segment.startLine, segment.endLine, SegmentStatus.EXTRACTED, lineCount, "Extracted $lineCount lines")

                synchronized(extractedSegments) {
                    extractedSegments.add(
                        MarkdownAssembler.SegmentPayload(
                            segmentIndex = segment.segmentIndex,
                            startLine = segment.startLine,
                            endLine = segment.endLine,
                            rawContent = extractedMarkdown
                        )
                    )
                }

                _serviceState.value = _serviceState.value.copy(
                    processedSegmentsCount = extractedSegments.size,
                    processingStatus = "Segment ${segment.segmentIndex} extracted successfully ($lineCount lines)."
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error processing segment ${segment.segmentIndex} with Gemini", e)
                updateSegmentDetail(segment.segmentIndex, segment.startLine, segment.endLine, SegmentStatus.FAILED, 0, "Failed: ${e.message}")
                _serviceState.value = _serviceState.value.copy(
                    errorMessage = "Gemini Segment ${segment.segmentIndex} Failed: ${e.message}"
                )
            } finally {
                // Step 4: Cleanup remote file
                if (remoteFileName != null) {
                    geminiApiService.deleteRemoteFile(remoteFileName)
                }
            }
        }
    }

    /**
     * Concludes the session: finalizes any recording in flight, processes the last segment,
     * and triggers markdown assembly.
     */
    fun finishSessionAndAssemble(finalEndLine: Int, onComplete: (MarkdownAssembler.AssemblyResult) -> Unit) {
        serviceScope.launch {
            _serviceState.value = _serviceState.value.copy(processingStatus = "Finalizing last segment...")

            val lastSegment = captureManager?.finalizeSegment(finalEndLine)
            if (lastSegment != null) {
                processSegmentWithGemini(lastSegment)
            }

            // Wait for in-flight Gemini extractions to complete
            val expectedTotal = segmentCounter.get()
            var waitedMs = 0L
            while (synchronized(extractedSegments) { extractedSegments.size } < expectedTotal && waitedMs < 300_000L) {
                delay(1500)
                waitedMs += 1500
                _serviceState.value = _serviceState.value.copy(
                    processingStatus = "Waiting for all segments to extract (${extractedSegments.size}/$expectedTotal)..."
                )
            }

            _serviceState.value = _serviceState.value.copy(processingStatus = "Stitching markdown segments...")
            val result = markdownAssembler.assembleAndSave(extractedSegments.toList())
            if (result.isSuccessful) {
                _totalFinalLines.value = result.totalLines
            }

            _serviceState.value = _serviceState.value.copy(
                processingStatus = if (result.isSuccessful) "Assembly Complete (${result.totalLines} lines)" else "Assembly Failed",
                assemblyResult = result
            )
            onComplete(result)
        }
    }

    fun stopWorkflow() {
        releaseWakeLock()
        DesktopPaginationService.instance?.stopPagination()
        captureManager?.release()
        mediaProjection?.stop()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    fun getGutterTracker(): GutterOcrTracker? = gutterTracker
    fun getCaptureManager(): DisplayCaptureManager? = captureManager

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        serviceScope.cancel()
        captureManager?.release()
        mediaProjection?.stop()
        instance = null
        Log.i(TAG, "SegmentRecorderService destroyed.")
    }

    private fun updateSegmentDetail(
        segmentIndex: Int,
        startLine: Int,
        endLine: Int,
        status: SegmentStatus,
        lineCount: Int,
        message: String
    ) {
        val currentList = _segmentDetails.value.toMutableList()
        val existingIdx = currentList.indexOfFirst { it.segmentIndex == segmentIndex }
        val updatedItem = SegmentDetail(
            segmentIndex = segmentIndex,
            startLine = startLine,
            endLine = endLine,
            status = status,
            markdownLineCount = if (lineCount > 0) lineCount else (currentList.getOrNull(existingIdx)?.markdownLineCount ?: 0),
            statusMessage = message
        )
        if (existingIdx >= 0) {
            currentList[existingIdx] = updatedItem
        } else {
            currentList.add(updatedItem)
        }
        _segmentDetails.value = currentList
    }

    enum class SegmentStatus {
        RECORDING,
        UPLOADING,
        PROCESSING,
        EXTRACTING,
        EXTRACTED,
        FAILED
    }

    data class SegmentDetail(
        val segmentIndex: Int,
        val startLine: Int,
        val endLine: Int,
        val status: SegmentStatus,
        val markdownLineCount: Int = 0,
        val statusMessage: String = ""
    )

    data class RecorderState(
        val isReady: Boolean = false,
        val isRecording: Boolean = false,
        val currentSegmentIndex: Int = 0,
        val currentStartLine: Int = 1,
        val completedSegmentsCount: Int = 0,
        val processedSegmentsCount: Int = 0,
        val processingStatus: String = "Idle",
        val errorMessage: String? = null,
        val targetDisplayInfo: DisplayCaptureManager.ExternalDisplayInfo? = null,
        val assemblyResult: MarkdownAssembler.AssemblyResult? = null
    )

    companion object {
        private const val TAG = "SegmentRecorderService"

        const val ACTION_START = "com.matrixcapture.app.action.START"
        const val ACTION_STOP = "com.matrixcapture.app.action.STOP"
        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"

        @Volatile
        var instance: SegmentRecorderService? = null
            private set

        val _segmentDetails = MutableStateFlow<List<SegmentDetail>>(emptyList())
        val segmentDetails = _segmentDetails.asStateFlow()

        val _totalFinalLines = MutableStateFlow<Int?>(null)
        val totalFinalLines = _totalFinalLines.asStateFlow()

        var apiKey: String = ""
    }
}

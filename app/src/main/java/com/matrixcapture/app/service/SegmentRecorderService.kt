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
import com.matrixcapture.app.ui.MainActivity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class SegmentRecorderService : Service() {
    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var captureManager: DisplayCaptureManager? = null
    private var gutterTracker: GutterOcrTracker? = null
    private var mediaProjection: MediaProjection? = null
    private var geminiApiService: GeminiApiService? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP, "MatrixCapture:CaptureWakeLock")
            if (wakeLock?.isHeld == false) wakeLock?.acquire(90 * 60 * 1000L)
        } catch (e: Exception) { Log.e(TAG, "WakeLock error", e) }
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
    }

    private val _serviceState = MutableStateFlow(RecorderState())
    val serviceState = _serviceState.asStateFlow()

    inner class LocalBinder : Binder() { fun getService(): SegmentRecorderService = this@SegmentRecorderService }
    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate(); instance = this
        val saved = applicationContext.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).getString("gemini_api_key", "") ?: ""
        if (saved.isNotEmpty() && apiKey.isEmpty()) apiKey = saved
        geminiApiService = GeminiApiService { apiKey }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                acquireWakeLock(); startForegroundWithNotification()
                intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)?.let { initCapture(intent.getIntExtra(EXTRA_RESULT_CODE, 0), it) }
            }
            ACTION_STOP -> stopWorkflow()
        }
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, MatrixCaptureApp.CHANNEL_ID_RECORDER)
            .setContentTitle("MatrixCapture Active").setContentText("Capturing settled frames & streaming to Studio")
            .setSmallIcon(android.R.drawable.presence_video_online).setContentIntent(pi).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(MatrixCaptureApp.NOTIFICATION_ID_RECORDER, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(MatrixCaptureApp.NOTIFICATION_ID_RECORDER, n)
    }

    private fun initCapture(resultCode: Int, resultData: Intent) {
        serviceScope.launch {
            try {
                mediaProjection = (getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager).getMediaProjection(resultCode, resultData).apply {
                    registerCallback(object : MediaProjection.Callback() {
                        override fun onStop() { _serviceState.value = _serviceState.value.copy(isRecording = false, isReady = false) }
                    }, Handler(Looper.getMainLooper()))
                }
                captureManager = DisplayCaptureManager(applicationContext, mediaProjection!!)
                val dInfo = captureManager!!.detectExternalDisplay()
                gutterTracker = GutterOcrTracker(serviceScope); captureManager!!.gutterTracker = gutterTracker
                captureManager!!.setupOcrVirtualDisplay(dInfo?.width ?: 1920, dInfo?.height ?: 1080, dInfo?.densityDpi ?: 320)
                _serviceState.value = _serviceState.value.copy(isReady = true, isRecording = true, targetDisplayInfo = dInfo, processingStatus = "Ready for settled capture")
            } catch (e: Exception) { _serviceState.value = _serviceState.value.copy(errorMessage = e.message) }
        }
    }

    fun reportFrameUploaded(pageIndex: Int, topLine: Int, bottomLine: Int, success: Boolean) {
        val list = _segmentDetails.value.toMutableList()
        list.add(0, SegmentDetail(pageIndex, topLine, bottomLine, if (success) SegmentStatus.EXTRACTED else SegmentStatus.FAILED, if (bottomLine >= topLine) bottomLine - topLine + 1 else 0, if (success) "Uploaded to Studio ✔" else "Upload Failed"))
        _segmentDetails.value = list
        _serviceState.value = _serviceState.value.copy(completedSegmentsCount = list.count { it.status == SegmentStatus.EXTRACTED }, processingStatus = "Page $pageIndex (Lines $topLine-$bottomLine) Uploaded ✔")
    }

    fun stopWorkflow() {
        releaseWakeLock(); DesktopPaginationService.instance?.stopPagination(); captureManager?.release(); mediaProjection?.stop()
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }

    fun getGutterTracker(): GutterOcrTracker? = gutterTracker
    fun getCaptureManager(): DisplayCaptureManager? = captureManager
    fun getGeminiApiService(): GeminiApiService? = geminiApiService

    override fun onDestroy() {
        super.onDestroy(); releaseWakeLock(); serviceScope.cancel(); captureManager?.release(); mediaProjection?.stop(); instance = null
    }

    enum class SegmentStatus { RECORDING, UPLOADING, PROCESSING, EXTRACTING, EXTRACTED, FAILED }
    data class SegmentDetail(val segmentIndex: Int, val startLine: Int, val endLine: Int, val status: SegmentStatus, val markdownLineCount: Int = 0, val statusMessage: String = "")
    data class RecorderState(val isReady: Boolean = false, val isRecording: Boolean = false, val currentSegmentIndex: Int = 0, val currentStartLine: Int = 1, val completedSegmentsCount: Int = 0, val processedSegmentsCount: Int = 0, val processingStatus: String = "Idle", val errorMessage: String? = null, val targetDisplayInfo: DisplayCaptureManager.ExternalDisplayInfo? = null)

    companion object {
        private const val TAG = "SegmentRecorderService"
        const val ACTION_START = "com.matrixcapture.app.action.START"
        const val ACTION_STOP = "com.matrixcapture.app.action.STOP"
        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"

        @Volatile var instance: SegmentRecorderService? = null; private set
        val _segmentDetails = MutableStateFlow<List<SegmentDetail>>(emptyList())
        val segmentDetails = _segmentDetails.asStateFlow()
        val _totalFinalLines = MutableStateFlow<Int?>(null)
        val totalFinalLines = _totalFinalLines.asStateFlow()
        var apiKey: String = ""
    }
}

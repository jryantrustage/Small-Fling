package com.matrixcapture.app.ui

import android.app.Application
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.matrixcapture.app.capture.GutterOcrTracker
import com.matrixcapture.app.network.FrameUploadClient
import com.matrixcapture.app.service.DesktopPaginationService
import com.matrixcapture.app.service.SegmentRecorderService
import com.matrixcapture.app.splicer.MarkdownAssembler
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class CaptureViewModel(application: Application) : AndroidViewModel(application) {

    private val context: Context get() = getApplication<Application>().applicationContext

    val uploadClient = FrameUploadClient()

    // UI State Flow
    private val _uiState = MutableStateFlow(UiState())
    val uiState = _uiState.asStateFlow()

    init {
        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        // Load persisted Gemini API Key
        val savedKey = prefs.getString("gemini_api_key", "") ?: ""
        if (savedKey.isNotEmpty()) {
            SegmentRecorderService.apiKey = savedKey
            _uiState.update { it.copy(geminiApiKey = savedKey) }
        }

        // Load persisted Server Host
        val savedHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
        uploadClient.serverHost = savedHost
        _uiState.update { it.copy(serverHost = savedHost) }
        viewModelScope.launch {
            val ok = uploadClient.testConnection()
            _uiState.update { it.copy(isBackendConnected = ok) }
        }

        // Collect Accessibility Service state
        viewModelScope.launch {
            DesktopPaginationService.isServiceActive.collect { active ->
                _uiState.update { it.copy(isAccessibilityActive = active) }
            }
        }

        // Collect Pagination state & dwell countdown
        viewModelScope.launch {
            DesktopPaginationService.dwellCountdownMs.collect { countdown ->
                _uiState.update { it.copy(dwellCountdownMs = countdown) }
            }
        }

        viewModelScope.launch {
            DesktopPaginationService.currentPage.collect { page ->
                _uiState.update { it.copy(currentPage = page) }
            }
        }

        viewModelScope.launch {
            DesktopPaginationService.calibrationState.collect { calibState ->
                _uiState.update { it.copy(calibrationStatus = calibState) }
            }
        }

        viewModelScope.launch {
            DesktopPaginationService.calculatedTotalLines.collect { total ->
                _uiState.update { it.copy(calculatedTotalLines = total) }
            }
        }

        // Real-time Display 1 / Desktop Mode Detection
        initDisplayDetection()
    }

    private fun initDisplayDetection() {
        val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager
        val updateDisplays = {
            val displays = displayManager.displays
            val external = displays.firstOrNull { it.displayId != android.view.Display.DEFAULT_DISPLAY }
            if (external != null) {
                val metrics = android.util.DisplayMetrics()
                @Suppress("DEPRECATION")
                external.getRealMetrics(metrics)
                _uiState.update {
                    it.copy(
                        targetDisplay = com.matrixcapture.app.capture.DisplayCaptureManager.ExternalDisplayInfo(
                            displayId = external.displayId,
                            name = external.name,
                            width = metrics.widthPixels,
                            height = metrics.heightPixels,
                            densityDpi = metrics.densityDpi,
                            refreshRate = external.refreshRate,
                            isExternal = true
                        )
                    )
                }
            } else {
                _uiState.update { it.copy(targetDisplay = null) }
            }
        }
        updateDisplays()
        displayManager.registerDisplayListener(object : android.hardware.display.DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) = updateDisplays()
            override fun onDisplayRemoved(displayId: Int) = updateDisplays()
            override fun onDisplayChanged(displayId: Int) = updateDisplays()
        }, null)
    }

    fun setApiKey(key: String) {
        val trimmed = key.trim()
        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("gemini_api_key", trimmed).apply()
        SegmentRecorderService.apiKey = trimmed
        _uiState.update { it.copy(geminiApiKey = trimmed) }
    }

    /**
     * One-click complete automated workflow orchestrator.
     */
    fun startFullWorkflow(resultCode: Int, resultData: Intent) {
        if (_uiState.value.isWorkflowRunning) return

        viewModelScope.launch {
            try {
                _uiState.update {
                    it.copy(
                        isWorkflowRunning = true,
                        workflowStatus = "Initializing MediaProjection capture...",
                        errorMessage = null
                    )
                }

            // 1. Start Foreground Capture Service
            val serviceIntent = Intent(context, SegmentRecorderService::class.java).apply {
                action = SegmentRecorderService.ACTION_START
                putExtra(SegmentRecorderService.EXTRA_RESULT_CODE, resultCode)
                putExtra(SegmentRecorderService.EXTRA_RESULT_DATA, resultData)
            }
            context.startForegroundService(serviceIntent)

            // Wait for service to initialize capture manager
            var recorderService = SegmentRecorderService.instance
            var waited = 0
            while ((recorderService == null || !recorderService.serviceState.value.isReady) && waited < 40) {
                delay(200)
                recorderService = SegmentRecorderService.instance
                waited++
            }

            if (recorderService == null) {
                _uiState.update {
                    it.copy(
                        isWorkflowRunning = false,
                        errorMessage = "Failed to bind to SegmentRecorderService."
                    )
                }
                return@launch
            }

            val activeService: SegmentRecorderService = recorderService

            // Bind to recorder service state updates
            launch {
                activeService.serviceState.collect { recState ->
                    _uiState.update {
                        it.copy(
                            recorderState = recState,
                            targetDisplay = recState.targetDisplayInfo
                        )
                    }
                }
            }

            // Bind to Gutter OCR state updates
            val gutterTracker = activeService.getGutterTracker()
            if (gutterTracker != null) {
                launch {
                    gutterTracker.gutterState.collect { gState ->
                        _uiState.update {
                            it.copy(
                                currentTopLine = gState.currentTopLine,
                                currentBottomLine = gState.currentBottomLine,
                                linePitchPx = gState.linePitchPx
                            )
                        }
                    }
                }
            }

            // 2. Resolve Target External Display (Display 59 / HDMI TO USB)
            val paginationService = DesktopPaginationService.instance
            if (paginationService == null) {
                _uiState.update {
                    it.copy(
                        isWorkflowRunning = false,
                        errorMessage = "Accessibility Service is not enabled. Please enable it in Settings."
                    )
                }
                return@launch
            }

            val externalDisplay = activeService.serviceState.value.targetDisplayInfo
            val targetDisplayId = externalDisplay?.displayId 
                ?: paginationService.resolveTargetDisplayId()
            Log.i(TAG, "Targeting Display $targetDisplayId (${externalDisplay?.name ?: "Dynamic"}) for capture and automation")

            val totalLines = _uiState.value.targetTotalLines
            _uiState.update {
                it.copy(
                    workflowStatus = "Starting discrete screenshot capture & upload for $totalLines lines on Display $targetDisplayId...",
                    calculatedTotalLines = totalLines,
                    uploadedFramesCount = 0
                )
            }

            // Run Pacing Engine with discrete settled snapshot capture on each settled page
            paginationService.startPacingEngine(
                targetDisplayId = targetDisplayId,
                totalLines = totalLines,
                dwellTimeMs = 1200L,
                phase = "SETTLED_CAPTURE_AND_UPLOAD",
                onFrameCaptureNeeded = { pageIndex, topLine, bottomLine ->
                    val cm = activeService.getCaptureManager()
                    val snapshot = cm?.captureSettledSnapshot()
                    if (snapshot != null) {
                        val ok = uploadClient.uploadFrame(snapshot, topLine, bottomLine, pageIndex)
                        if (ok) {
                            _uiState.update { it.copy(uploadedFramesCount = it.uploadedFramesCount + 1) }
                            Log.i(TAG, "Uploaded settled 1080p frame $pageIndex (Lines $topLine-$bottomLine)")
                        }
                    } else {
                        Log.w(TAG, "Snapshot from ImageReader was null for page $pageIndex")
                    }

                    // Check if web UI has requested any line recaptures
                    try {
                        val tasks = uploadClient.fetchRecaptureQueue()
                        for (task in tasks) {
                            _uiState.update { it.copy(workflowStatus = "Seeking to line ${task.lineNumber} for web-requested recapture...") }
                            paginationService.seekToLine(task.lineNumber, topLine, targetDisplayId)
                            delay(500)
                            val recSnap = cm?.captureSettledSnapshot()
                            if (recSnap != null) {
                                uploadClient.uploadFrame(recSnap, task.lineNumber, task.lineNumber + 45, pageIndex)
                                uploadClient.completeRecapture(task.lineNumber)
                                Log.i(TAG, "Completed recapture for line ${task.lineNumber}")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error checking recapture queue", e)
                    }
                },
                onPageAdvanced = { page, top, bottom ->
                    _uiState.update {
                        it.copy(workflowStatus = "Page $page (Lines $top-$bottom) Settled & Uploaded to Studio")
                    }
                }
            )

            // Wait for pagination to conclude
            while (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running) {
                delay(500)
            }

            _uiState.update {
                it.copy(
                    isWorkflowRunning = false,
                    workflowStatus = "Capture Complete! All frames uploaded to studio."
                )
            }
            } catch (e: Exception) {
                Log.e(TAG, "Error in workflow execution", e)
                _uiState.update {
                    it.copy(
                        isWorkflowRunning = false,
                        errorMessage = "Workflow error: ${e.message}"
                    )
                }
            }
        }
    }

    fun setTargetTotalLines(lines: Int) {
        _uiState.update { it.copy(targetTotalLines = lines.coerceAtLeast(10)) }
    }

    fun setServerHost(host: String) {
        val trimmed = host.trim()
        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("server_host", trimmed).apply()
        uploadClient.serverHost = trimmed
        _uiState.update { it.copy(serverHost = trimmed) }
        viewModelScope.launch {
            val ok = uploadClient.testConnection()
            _uiState.update { it.copy(isBackendConnected = ok) }
        }
    }

    fun startPacingOnly(totalLines: Int = _uiState.value.targetTotalLines, dwellMs: Long = 1500L) {
        val paginationService = DesktopPaginationService.instance
        if (paginationService == null) {
            _uiState.update { it.copy(errorMessage = "Accessibility Service is not enabled. Please enable it in Settings.") }
            return
        }
        val targetDisplayId = paginationService.resolveTargetDisplayId(_uiState.value.targetDisplay?.displayId)
        _uiState.update {
            it.copy(
                isWorkflowRunning = true,
                workflowStatus = "Running standalone pacer test on Display $targetDisplayId (Dwell: ${dwellMs}ms)..."
            )
        }
        paginationService.startPacingEngine(
            targetDisplayId = targetDisplayId,
            totalLines = totalLines,
            dwellTimeMs = dwellMs,
            phase = "PACING_TEST",
            onPageAdvanced = { page, top, bottom ->
                _uiState.update { it.copy(workflowStatus = "Test Page $page (Lines $top-$bottom) • Freeze ${dwellMs}ms") }
            }
        )
    }

    fun stopWorkflow() {
        viewModelScope.launch {
            DesktopPaginationService.instance?.stopPagination()
            SegmentRecorderService.instance?.stopWorkflow()
            _uiState.update {
                it.copy(
                    isWorkflowRunning = false,
                    workflowStatus = "Stopped by user."
                )
            }
        }
    }

    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
    }

    data class UiState(
        val isWorkflowRunning: Boolean = false,
        val isAccessibilityActive: Boolean = false,
        val geminiApiKey: String = "",
        val serverHost: String = "192.168.86.83:8000",
        val isBackendConnected: Boolean = false,
        val uploadedFramesCount: Int = 0,
        val targetTotalLines: Int = 9487,
        val workflowStatus: String = "Ready to start",
        val calibrationStatus: String = "Uncalibrated",
        val calculatedTotalLines: Int = 9487,
        val currentPage: Int = 0,
        val dwellCountdownMs: Long = 0L,
        val currentTopLine: Int = 1,
        val currentBottomLine: Int = 1,
        val linePitchPx: Float = 32f,
        val targetDisplay: com.matrixcapture.app.capture.DisplayCaptureManager.ExternalDisplayInfo? = null,
        val recorderState: SegmentRecorderService.RecorderState = SegmentRecorderService.RecorderState(),
        val assemblyResult: MarkdownAssembler.AssemblyResult? = null,
        val errorMessage: String? = null
    )

    companion object {
        private const val TAG = "CaptureViewModel"
    }
}

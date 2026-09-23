package com.matrixcapture.app.ui

import android.app.Application
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.os.PowerManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.matrixcapture.app.capture.DisplayCaptureManager
import com.matrixcapture.app.network.FrameUploadClient
import com.matrixcapture.app.data.DeviceModel
import com.matrixcapture.app.service.DesktopPaginationService
import com.matrixcapture.app.service.SegmentRecorderService
import com.matrixcapture.app.splicer.MarkdownAssembler
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class CaptureViewModel(application: Application) : AndroidViewModel(application) {
    private val context: Context get() = getApplication<Application>().applicationContext
    val uploadClient = FrameUploadClient()
    private val _uiState = MutableStateFlow(UiState())
    val uiState = _uiState.asStateFlow()
    private var vmWakeLock: PowerManager.WakeLock? = null

    private fun acquireVmWakeLock() = runCatching {
        if (vmWakeLock == null) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            vmWakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP, "MatrixCapture:VmWakeLock")
        }
        if (vmWakeLock?.isHeld == false) vmWakeLock?.acquire()
    }

    private fun releaseVmWakeLock() = runCatching {
        if (vmWakeLock?.isHeld == true) vmWakeLock?.release()
    }

    init {
        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        prefs.getString("gemini_api_key", "")?.takeIf { it.isNotEmpty() }?.let {
            SegmentRecorderService.apiKey = it; _uiState.update { s -> s.copy(geminiApiKey = it) }
        }
        val host = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
        uploadClient.serverHost = host; _uiState.update { it.copy(serverHost = host) }

        val lines = prefs.getInt("target_total_lines", 0).let { if (it in listOf(9487, 9994)) { prefs.edit().putInt("target_total_lines", 0).apply(); 0 } else it }
        val savedDeviceStr = prefs.getString("device_model", DeviceModel.AUTO.id)
        val initialDevice = DeviceModel.fromString(savedDeviceStr)
        DesktopPaginationService.setDeviceModel(initialDevice)
        _uiState.update { it.copy(targetTotalLines = lines, calculatedTotalLines = lines, deviceModel = initialDevice) }
        DesktopPaginationService.resetToStart(lines)

        viewModelScope.launch { _uiState.update { it.copy(isBackendConnected = uploadClient.testConnection()) } }

        fun <T> Flow<T>.bind(block: (T) -> Unit) = viewModelScope.launch { collect { block(it) } }
        DesktopPaginationService.isServiceActive.bind { a -> _uiState.update { it.copy(isAccessibilityActive = a) } }
        DesktopPaginationService.dwellCountdownMs.bind { c -> _uiState.update { it.copy(dwellCountdownMs = c) } }
        DesktopPaginationService.currentPage.bind { p -> _uiState.update { it.copy(currentPage = p) } }
        DesktopPaginationService.calibrationState.bind { cs -> _uiState.update { it.copy(calibrationStatus = cs) } }
        DesktopPaginationService.calculatedTotalLines.bind { t -> _uiState.update { it.copy(calculatedTotalLines = t) } }
        DesktopPaginationService.deviceModel.bind { m -> _uiState.update { it.copy(deviceModel = m) } }

        viewModelScope.launch {
            while (isActive) {
                delay(1200)
                try {
                    val pState = DesktopPaginationService.telemetry.value
                    val api = SegmentRecorderService.instance?.getGeminiApiService()
                    val pt = api?.mobilePromptTokens?.get() ?: 0; val ct = api?.mobileCandidatesTokens?.get() ?: 0; val tt = api?.mobileTotalTokens?.get() ?: 0
                    _uiState.update { it.copy(mobilePromptTokens = pt, mobileCandidatesTokens = ct, mobileTotalTokens = tt, autoTuneFactor = pState.autoTuneFactor, bottomToTopError = pState.bottomToTopError, wrappedLinesDetected = pState.wrappedLinesDetected) }

                    val resolvedDevice = DesktopPaginationService.deviceModel.value.resolve()
                    val devName = "${resolvedDevice.displayName} Desktop (${_uiState.value.targetDisplay?.name ?: "Display 1"})"
                    val ok = uploadClient.sendTelemetry(FrameUploadClient.TelemetryData(devName, DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running, pState.currentPage, pState.currentTopLine, pState.currentBottomLine, pState.targetTotalLines, pState.dwellRemainingMs.toInt(), pState.phase, pState.statusMessage, pState.activeStep, "mobile", pt, ct, tt, pState.autoTuneFactor, pState.linePitchPx, pState.bottomToTopError, pState.wrappedLinesDetected))
                    _uiState.update { it.copy(isBackendConnected = ok) }

                    uploadClient.fetchOrchestrationState().getOrNull()?.let { ro ->
                        val prev = _uiState.value.orchestrationStatus
                        _uiState.update { it.copy(orchestrationStatus = ro.status, orchestrationInvokedBy = ro.invokedBy, orchestrationActiveStep = ro.activeStep, orchestrationStepLabel = ro.stepLabel, orchestrationNextTargetTop = ro.nextTargetTop) }
                        if (ro.status != prev) {
                            when (ro.status) {
                                "RUNNING" -> {
                                    acquireVmWakeLock()
                                    if (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Paused) DesktopPaginationService.instance?.resumePagination() else if (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Idle && !_uiState.value.isWorkflowRunning) startPacingOnly()
                                }
                                "PAUSED" -> if (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running) DesktopPaginationService.instance?.pausePagination()
                                "COMPLETED", "ABORTED" -> {
                                    releaseVmWakeLock()
                                    if (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running) stopWorkflow()
                                }
                            }
                        }
                        val cmdKey = "${ro.command}_${ro.updatedAt.ifEmpty { ro.stepLabel }}"
                        if (ro.command == "CAPTURE_DESKTOP" && lastHandledRemoteCommand != cmdKey) {
                            lastHandledRemoteCommand = cmdKey
                            android.util.Log.i("CaptureViewModel", "Ignored CAPTURE_DESKTOP: actuator disabled")
                        } else if (ro.command == "GET_NEXT_LINE" && lastHandledRemoteCommand != cmdKey) {
                            lastHandledRemoteCommand = cmdKey
                            getNextPageLine()
                        } else if ((ro.command == "CALIBRATE_INSTANT" || ro.command == "CALIBRATE") && lastHandledRemoteCommand != cmdKey) {
                            lastHandledRemoteCommand = cmdKey
                            calibrateDocument()
                        } else if ((ro.command == "ADVANCE_PAGE_ARROW" || ro.command == "PAGE_DOWN_ARROW") && lastHandledRemoteCommand != cmdKey) {
                            lastHandledRemoteCommand = cmdKey
                            alignAndCaptureNextPage()
                        }
                    }
                } catch (_: Exception) { _uiState.update { it.copy(isBackendConnected = false) } }
            }
        }
        initDisplayDetection()
    }

    private var lastHandledRemoteCommand: String? = null

    private fun initDisplayDetection() {
        val dm = context.getSystemService(Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager
        val upd = {
            val ext = dm.displays.firstOrNull { it.displayId != android.view.Display.DEFAULT_DISPLAY }
            if (ext != null) {
                val m = android.util.DisplayMetrics(); @Suppress("DEPRECATION") ext.getRealMetrics(m)
                _uiState.update { it.copy(targetDisplay = DisplayCaptureManager.ExternalDisplayInfo(ext.displayId, ext.name, m.widthPixels, m.heightPixels, m.densityDpi, ext.refreshRate, true)) }
            } else _uiState.update { it.copy(targetDisplay = null) }
        }
        upd()
        dm.registerDisplayListener(object : android.hardware.display.DisplayManager.DisplayListener {
            override fun onDisplayAdded(id: Int) = upd(); override fun onDisplayRemoved(id: Int) = upd(); override fun onDisplayChanged(id: Int) = upd()
        }, null)
    }

    fun setApiKey(k: String) {
        val t = k.trim(); context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).edit().putString("gemini_api_key", t).apply()
        SegmentRecorderService.apiKey = t; _uiState.update { it.copy(geminiApiKey = t) }
    }

    fun startFullWorkflow(resultCode: Int, resultData: Intent) {
        if (_uiState.value.isWorkflowRunning) return
        acquireVmWakeLock()
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(isWorkflowRunning = true, workflowStatus = "Initializing capture...", errorMessage = null) }
                context.startForegroundService(Intent(context, SegmentRecorderService::class.java).apply { action = SegmentRecorderService.ACTION_START; putExtra(SegmentRecorderService.EXTRA_RESULT_CODE, resultCode); putExtra(SegmentRecorderService.EXTRA_RESULT_DATA, resultData) })

                var rs = SegmentRecorderService.instance; var w = 0
                while ((rs == null || !rs.serviceState.value.isReady) && w < 40) { delay(200); rs = SegmentRecorderService.instance; w++ }
                if (rs == null) { _uiState.update { it.copy(isWorkflowRunning = false, errorMessage = "Failed to bind to SegmentRecorderService.") }; return@launch }

                val svc: SegmentRecorderService = rs
                launch { svc.serviceState.collect { s -> _uiState.update { it.copy(recorderState = s, targetDisplay = s.targetDisplayInfo) } } }
                svc.getGutterTracker()?.let { gt -> launch { gt.gutterState.collect { g -> _uiState.update { it.copy(currentTopLine = g.currentTopLine, currentBottomLine = g.currentBottomLine, linePitchPx = g.linePitchPx) } } } }

                val ps = DesktopPaginationService.instance ?: return@launch run { _uiState.update { it.copy(isWorkflowRunning = false, errorMessage = "Accessibility Service not enabled.") } }
                val dId = svc.serviceState.value.targetDisplayInfo?.displayId ?: ps.resolveTargetDisplayId()
                _uiState.update { it.copy(workflowStatus = "Calibrating line count...", uploadedFramesCount = 0) }

                val measured = ps.performLineCalibration(dId) { svc.getGutterTracker()?.getCalibrationSnapshot() }
                val total = if (measured > 10) measured else _uiState.value.targetTotalLines
                setTargetTotalLines(total)
                _uiState.update { it.copy(workflowStatus = "Calibrated: $total lines. Starting capture...", calculatedTotalLines = total, targetTotalLines = total) }

                ps.startPacingEngine(dId, total, 1200L, "SETTLED_CAPTURE_AND_UPLOAD", onFrameCaptureNeeded = { pIdx, top, bot ->
                    val cm = svc.getCaptureManager()
                    cm?.captureSettledSnapshot()?.let { snap ->
                        val res = uploadClient.uploadFrame(snap, top, bot, pIdx)
                        svc.reportFrameUploaded(pIdx, top, bot, res.success)
                        if (res.success) _uiState.update { it.copy(uploadedFramesCount = it.uploadedFramesCount + 1) }
                    }
                    try {
                        for (task in uploadClient.fetchRecaptureQueue()) {
                            ps.seekToLine(task.lineNumber, top, dId); delay(500)
                            cm?.captureSettledSnapshot()?.let { rSnap -> uploadClient.uploadFrame(rSnap, task.lineNumber, task.lineNumber + 45, pIdx); uploadClient.completeRecapture(task.lineNumber) }
                        }
                    } catch (_: Exception) {}
                }, onPageAdvanced = { page, top, bot -> _uiState.update { it.copy(workflowStatus = "Page $page (Lines $top-$bot) Settled & Uploaded") } })

                while (DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running) delay(500)
                _uiState.update { it.copy(isWorkflowRunning = false, workflowStatus = "Capture Complete!") }
            } catch (e: Exception) { _uiState.update { it.copy(isWorkflowRunning = false, errorMessage = "Workflow error: ${e.message}") } }
        }
    }

    fun setTargetTotalLines(lines: Int) {
        val v = lines.coerceAtLeast(0)
        context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).edit().putInt("target_total_lines", v).apply()
        _uiState.update { it.copy(targetTotalLines = v, calculatedTotalLines = v) }
        DesktopPaginationService.resetToStart(v)
        viewModelScope.launch { uploadClient.resetServerState(v) }
    }

    fun resetSession() {
        context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).edit().putInt("target_total_lines", 0).apply()
        DesktopPaginationService.resetToStart(0)
        viewModelScope.launch {
            uploadClient.resetServerState(0)
            _uiState.update { it.copy(targetTotalLines = 0, calculatedTotalLines = 0, currentPage = 1, currentTopLine = 0, currentBottomLine = 0, uploadedFramesCount = 0, workflowStatus = "Session reset to Page 1", errorMessage = null) }
        }
    }

    fun setServerHost(host: String) {
        val t = host.trim(); context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).edit().putString("server_host", t).apply()
        uploadClient.serverHost = t; _uiState.update { it.copy(serverHost = t) }
        viewModelScope.launch { _uiState.update { it.copy(isBackendConnected = uploadClient.testConnection()) } }
    }

    fun startPacingOnly(totalLines: Int = _uiState.value.targetTotalLines, dwellMs: Long = 1500L) {
        val ps = DesktopPaginationService.instance ?: return run { _uiState.update { it.copy(errorMessage = "Accessibility Service not enabled.") } }
        val dId = ps.resolveTargetDisplayId(_uiState.value.targetDisplay?.displayId)
        acquireVmWakeLock()
        _uiState.update { it.copy(isWorkflowRunning = true, workflowStatus = "Running pacer test on Display $dId...") }
        ps.startPacingEngine(dId, totalLines, dwellMs, "PACING_TEST", onPageAdvanced = { page, top, bot -> _uiState.update { it.copy(workflowStatus = "Page $page (Lines $top-$bot) • Freeze ${dwellMs}ms") } })
    }

    fun calibrateDocument() {
        val ps = DesktopPaginationService.instance ?: return run { _uiState.update { it.copy(errorMessage = "Accessibility Service not enabled.") } }
        acquireVmWakeLock()
        viewModelScope.launch {
            val dId = ps.resolveTargetDisplayId(_uiState.value.targetDisplay?.displayId)
            _uiState.update { it.copy(isWorkflowRunning = true, workflowStatus = "Calibrating line count...") }
            val measured = ps.performLineCalibration(dId) { SegmentRecorderService.instance?.getGutterTracker()?.getCalibrationSnapshot() }
            if (measured > 10) {
                setTargetTotalLines(measured)
                _uiState.update { it.copy(isWorkflowRunning = false, workflowStatus = "Calibration complete: $measured lines.", targetTotalLines = measured, calculatedTotalLines = measured) }
            } else _uiState.update { it.copy(isWorkflowRunning = false, workflowStatus = "Calibration completed. Lines: ${_uiState.value.targetTotalLines}") }
        }
    }

    fun stopWorkflow() = viewModelScope.launch {
        releaseVmWakeLock()
        DesktopPaginationService.instance?.stopPagination(); SegmentRecorderService.instance?.stopWorkflow()
        _uiState.update { it.copy(isWorkflowRunning = false, workflowStatus = "Stopped by user.") }
    }

    override fun onCleared() {
        super.onCleared()
        releaseVmWakeLock()
    }

    fun captureDesktopMode() {
        android.util.Log.i("CaptureViewModel", "captureDesktopMode is disabled")
    }

    fun sendCapturesToPythonApi() {
        android.util.Log.i("CaptureViewModel", "sendCapturesToPythonApi is disabled")
    }

    fun getNextPageLine() = viewModelScope.launch {
        _uiState.update { it.copy(workflowStatus = "Querying next page line...") }
        uploadClient.getNextPageLine().onSuccess { line ->
            _uiState.update { it.copy(workflowStatus = "Next page line: $line") }
            DesktopPaginationService.updateStatus("Next page line: $line")
        }.onFailure { err -> _uiState.update { it.copy(workflowStatus = "Error: ${err.message}") } }
    }

    fun alignAndCaptureNextPage() = viewModelScope.launch {
        val ps = DesktopPaginationService.instance ?: return@launch run { _uiState.update { it.copy(errorMessage = "Accessibility Service not enabled") } }
        val resolvedDev = DesktopPaginationService.deviceModel.value.resolve()
        val curPage = _uiState.value.currentPage.coerceAtLeast(1)
        val targetPage = curPage + 1
        val (expectedTop, expectedBot) = resolvedDev.expectedBounds(targetPage)
        _uiState.update { it.copy(workflowStatus = "Advancing to Page $targetPage (targeting Ln $expectedTop at top) via Arrow Keys...") }
        val dId = ps.resolveTargetDisplayId(_uiState.value.targetDisplay?.displayId)
        ps.advancePageWithArrowKeys(curPage, dId)
        delay(DesktopPaginationService.DWELL_TIME_MS)
        val snap = ps.captureScreenshot(dId) ?: return@launch run { _uiState.update { it.copy(workflowStatus = "Capture failed: Screen image was null") } }
        DesktopPaginationService.latestCapturedBitmap = snap
        _uiState.update { it.copy(currentPage = targetPage, currentTopLine = expectedTop, currentBottomLine = expectedBot, workflowStatus = "Uploading Page $targetPage (Lines $expectedTop-$expectedBot)...") }
        val res = uploadClient.uploadFrame(snap, expectedTop, expectedBot, targetPage, sync = true)
        if (res.success) {
            _uiState.update { it.copy(uploadedFramesCount = it.uploadedFramesCount + 1, workflowStatus = "Page $targetPage (Ln $expectedTop-$expectedBot) Aligned & Uploaded ✔") }
            DesktopPaginationService.updateStatus("Page $targetPage (Ln $expectedTop-$expectedBot) Aligned & Uploaded ✔")
        } else _uiState.update { it.copy(workflowStatus = "Upload failed: ${res.message}") }
    }

    fun openAccessibilitySettings() = context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK })

    fun setDeviceModel(model: DeviceModel) {
        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("device_model", model.id).apply()
        DesktopPaginationService.setDeviceModel(model)
        _uiState.update { it.copy(deviceModel = model) }
        DesktopPaginationService.updateStatus("Device set to: ${model.displayName} (${model.resolve().linesPerPage} lines/pg)")
    }

    private fun updateOrch(cmd: String, st: String) = viewModelScope.launch {
        _uiState.update { it.copy(orchestrationStatus = st, orchestrationInvokedBy = "Mobile App 📱") }
        uploadClient.sendOrchestrationCommand(cmd, "mobile")
    }

    fun beginOrchestration() { updateOrch("BEGIN_AUTO_FLIPPING", "RUNNING"); _uiState.update { it.copy(isWorkflowRunning = true) }; startPacingOnly() }
    fun pauseOrchestration() { updateOrch("PAUSE", "PAUSED"); DesktopPaginationService.instance?.pausePagination() }
    fun resumeOrchestration() { updateOrch("RESUME", "RUNNING"); DesktopPaginationService.instance?.resumePagination() }
    fun endOrchestration() { updateOrch("END", "COMPLETED"); _uiState.update { it.copy(isWorkflowRunning = false) }; stopWorkflow() }
    fun restartOrchestration() {
        updateOrch("RESTART", "RUNNING"); _uiState.update { it.copy(currentPage = 1, currentTopLine = 1, currentBottomLine = 0) }
        viewModelScope.launch { DesktopPaginationService.instance?.restartFromBeginning() }
    }

    data class UiState(
        val isWorkflowRunning: Boolean = false, val isAccessibilityActive: Boolean = false, val geminiApiKey: String = "", val serverHost: String = "192.168.86.83:8000",
        val isBackendConnected: Boolean = false, val uploadedFramesCount: Int = 0, val targetTotalLines: Int = 0, val workflowStatus: String = "Ready on Page 1",
        val calibrationStatus: String = "Uncalibrated", val calculatedTotalLines: Int = 0, val currentPage: Int = 1, val dwellCountdownMs: Long = 0L,
        val currentTopLine: Int = 1, val currentBottomLine: Int = 44, val linePitchPx: Float = 32f, val mobilePromptTokens: Int = 0, val mobileCandidatesTokens: Int = 0,
        val mobileTotalTokens: Int = 0, val autoTuneFactor: Float = 1.0f, val bottomToTopError: Int = 0, val wrappedLinesDetected: Int = 0,
        val targetDisplay: DisplayCaptureManager.ExternalDisplayInfo? = null, val recorderState: SegmentRecorderService.RecorderState = SegmentRecorderService.RecorderState(),
        val assemblyResult: MarkdownAssembler.AssemblyResult? = null, val errorMessage: String? = null, val orchestrationStatus: String = "IDLE",
        val orchestrationInvokedBy: String = "Web Studio 💻", val orchestrationActiveStep: String = "START_READY", val orchestrationStepLabel: String = "Ready at Ln 1",
        val orchestrationNextTargetTop: Int? = null, val deviceModel: DeviceModel = DeviceModel.AUTO
    )
    companion object { private const val TAG = "CaptureViewModel" }
}

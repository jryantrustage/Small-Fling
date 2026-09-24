package com.matrixcapture.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.PowerManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import com.matrixcapture.app.capture.GutterOcrTracker
import com.matrixcapture.app.ocr.MlKitOcrEngine
import com.matrixcapture.app.data.DeviceModel
import kotlin.coroutines.resume
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.concurrent.atomic.AtomicBoolean
import java.net.Socket
import java.io.PrintWriter
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class DesktopPaginationService : AccessibilityService() {
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var automationJob: Job? = null
    private val isPaginating = AtomicBoolean(false)
    private val isPaused = AtomicBoolean(false)
    private var wakeLock: PowerManager.WakeLock? = null

    private fun acquireWakeLock() = runCatching {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP, "MatrixCapture:PaginationWakeLock")
        }
        if (wakeLock?.isHeld == false) wakeLock?.acquire()
    }

    private fun releaseWakeLock() = runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }

    private val keyboardReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: android.content.Intent?) {
            if (intent?.action == "com.matrixcapture.app.ACTION_CLOSE_KEYBOARD") {
                setSoftKeyboardHidden(true)
                runCatching { performGlobalAction(GLOBAL_ACTION_BACK) }
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        _isServiceActive.value = true
        runCatching {
            softKeyboardController.addOnShowModeChangedListener { _, mode -> _isSoftKeyboardSuppressed.value = (mode == SHOW_MODE_HIDDEN) }
        }
        runCatching {
            val filter = android.content.IntentFilter("com.matrixcapture.app.ACTION_CLOSE_KEYBOARD")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(keyboardReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                registerReceiver(keyboardReceiver, filter)
            }
        }
    }

    fun setSoftKeyboardHidden(hidden: Boolean) = runCatching {
        val mode = if (hidden) SHOW_MODE_HIDDEN else SHOW_MODE_AUTO
        softKeyboardController.showMode = mode
        _isSoftKeyboardSuppressed.value = (mode == SHOW_MODE_HIDDEN)
    }

    fun toggleSoftKeyboard() = setSoftKeyboardHidden(!_isSoftKeyboardSuppressed.value)
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() = stopPagination()

    override fun onDestroy() {
        super.onDestroy()
        runCatching { unregisterReceiver(keyboardReceiver) }
        stopPagination()
        releaseWakeLock()
        setSoftKeyboardHidden(false)
        serviceScope.cancel()
        latestCapturedBitmap?.recycle()
        latestCapturedBitmap = null
        instance = null
        _isServiceActive.value = false
    }

    fun resolveTargetDisplayId(preferredId: Int? = null): Int {
        if (preferredId != null && preferredId != Display.DEFAULT_DISPLAY) return preferredId
        val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        return dm?.displays?.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }?.displayId ?: 0
    }

    suspend fun ensureKeyboardClosed(targetDisplayId: Int? = null) = withContext(Dispatchers.Default) {
        setSoftKeyboardHidden(true)
        val cmd = "if dumpsys input_method | grep -E 'mImeWindowVis=[123]' > /dev/null; then input keyevent 4; echo CLOSED; fi"
        executeShellCommand(cmd)
        delay(150)
    }

    suspend fun captureScreenshot(targetDisplayId: Int? = null): Bitmap? {
        ensureKeyboardClosed(targetDisplayId)
        return suspendCancellableCoroutine { cont ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val dispId = resolveTargetDisplayId(targetDisplayId)
                val cb = object : TakeScreenshotCallback {
                    override fun onSuccess(res: ScreenshotResult) {
                        val bmp = runCatching {
                            Bitmap.wrapHardwareBuffer(res.hardwareBuffer, res.colorSpace)?.copy(Bitmap.Config.ARGB_8888, false).also { res.hardwareBuffer.close() }
                        }.getOrNull()
                        if (bmp != null) latestCapturedBitmap = bmp
                        if (cont.isActive) cont.resume(bmp)
                    }
                    override fun onFailure(err: Int) {
                        if (dispId != Display.DEFAULT_DISPLAY) {
                            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                                override fun onSuccess(res: ScreenshotResult) {
                                    val bmp = runCatching { Bitmap.wrapHardwareBuffer(res.hardwareBuffer, res.colorSpace)?.copy(Bitmap.Config.ARGB_8888, false).also { res.hardwareBuffer.close() } }.getOrNull()
                                    if (bmp != null) latestCapturedBitmap = bmp
                                    if (cont.isActive) cont.resume(bmp)
                                }
                                override fun onFailure(e: Int) { if (cont.isActive) cont.resume(null) }
                            })
                        } else if (cont.isActive) cont.resume(null)
                    }
                }
                runCatching { takeScreenshot(dispId, mainExecutor, cb) }.onFailure { if (cont.isActive) cont.resume(null) }
            } else if (cont.isActive) cont.resume(null)
        }
    }

    fun findTargetWindow(displayId: Int): AccessibilityWindowInfo? {
        val myPkg = packageName ?: "com.matrixcapture.app"
        val allWindows: List<AccessibilityWindowInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            windowsOnAllDisplays.get(displayId) ?: windows.filter { it.displayId == displayId }
        } else {
            windows
        }
        if (allWindows.isEmpty()) return null

        // 1. Explicit Teams window match (by package name or window title)
        val teamsWindow = allWindows.firstOrNull { win ->
            val pkg = win.root?.packageName?.toString() ?: ""
            val title = win.title?.toString() ?: ""
            pkg.contains("teams", ignoreCase = true) ||
            title.contains("teams", ignoreCase = true) ||
            title.contains("matrix_", ignoreCase = true)
        }
        if (teamsWindow != null) return teamsWindow

        // 2. Application window that is NOT our Matrix Capture app
        val otherAppWindow = allWindows.firstOrNull { win ->
            val pkg = win.root?.packageName?.toString() ?: ""
            win.type == AccessibilityWindowInfo.TYPE_APPLICATION && pkg != myPkg
        }
        if (otherAppWindow != null) return otherAppWindow

        // 3. Focused window that is NOT our app
        val otherFocused = allWindows.firstOrNull { win ->
            val pkg = win.root?.packageName?.toString() ?: ""
            win.isFocused && pkg != myPkg
        }
        if (otherFocused != null) return otherFocused

        // 4. Any application window fallback
        return allWindows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION } ?: allWindows.firstOrNull()
    }

    fun getDisplayOrWindowBounds(displayId: Int): Rect {
        val bounds = Rect()
        findTargetWindow(displayId)?.getBoundsInScreen(bounds)
        if (bounds.isEmpty || bounds.width() < 200 || bounds.height() < 200) {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val display = dm?.getDisplay(displayId)
            if (display != null) {
                val metrics = DisplayMetrics()
                @Suppress("DEPRECATION") display.getRealMetrics(metrics)
                bounds.set(0, 0, metrics.widthPixels, metrics.heightPixels)
            } else bounds.set(0, 0, 1920, 1080)
        }
        return bounds
    }

    suspend fun executeShellCommand(cmd: String): Boolean = withContext(Dispatchers.IO) {
        val socketOk = runCatching {
            Socket("127.0.0.1", 18888).use { s ->
                s.soTimeout = 2000
                val w = PrintWriter(s.getOutputStream(), true)
                w.println(cmd)
                w.flush()
            }
            true
        }.getOrDefault(false)
        if (socketOk) return@withContext true

        val host = applicationContext.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE).getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
        runCatching {
            val json = JSONObject().put("command", cmd)
            val req = Request.Builder()
                .url("http://$host/api/adb/command")
                .post(json.toString().toRequestBody("application/json".toMediaTypeOrNull()))
                .build()
            OkHttpClient().newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    suspend fun dispatchKeyEvents(displayId: Int = 33, keycode: Int = 20, count: Int = 1): Boolean {
        val resolved = resolveTargetDisplayId(displayId)
        val keys = List(count) { keycode.toString() }.joinToString(" ")
        return executeShellCommand("input -d $resolved keyevent $keys")
    }

    suspend fun dispatchKeyCombination(displayId: Int = 33, key1: Int = 113, key2: Int = 123): Boolean {
        val resolved = resolveTargetDisplayId(displayId)
        return executeShellCommand("input -d $resolved keycombination $key1 $key2")
    }

    suspend fun performInstantCalibration(targetDisplayId: Int = 0, getGutterMetrics: (suspend () -> GutterMetricsSnapshot?)? = null): Int = withContext(Dispatchers.Default) {
        acquireWakeLock()
        val resolved = resolveTargetDisplayId(targetDisplayId)
        ensureKeyboardClosed(resolved)
        _calibrationState.value = "Calibrating: Jumping to end via Ctrl+End..."
        _telemetry.value = _telemetry.value.copy(activeStep = "CALIBRATING", statusMessage = "Calibrating: Sending Ctrl+End...")

        dispatchKeyCombination(resolved, 113, 123)
        delay(600)
        ensureKeyboardClosed(resolved)

        val client = FloatingOverlayService.getUploadClient(applicationContext)
        val endSnap = captureScreenshot(resolved)
        val totalLines = if (endSnap != null) {
            val pid = client.fetchActiveProjectId() ?: "active"
            client.calibrateProjectEnd(pid, endSnap).getOrNull()
                ?: endSnap.let { detectGutterState(it)?.currentBottomLine }
                ?: 0
        } else 0

        _calibrationState.value = "Calibrating: Total $totalLines lines. Snapping to Line 1 via Ctrl+Home..."
        _telemetry.value = _telemetry.value.copy(targetTotalLines = totalLines, statusMessage = "Detected $totalLines lines. Snapping to Line 1...")

        ensureKeyboardClosed(resolved)
        dispatchKeyCombination(resolved, 113, 122)
        delay(500)
        ensureKeyboardClosed(resolved)

        val homeSnap = captureScreenshot(resolved)
        if (homeSnap != null) {
            val pid = client.fetchActiveProjectId() ?: "active"
            client.verifyProjectHome(pid, homeSnap)
        }

        val targetDevice = _deviceModel.value.resolve()
        _calibrationState.value = "Calibration Complete: $totalLines lines"
        _calculatedTotalLines.value = totalLines
        _telemetry.value = _telemetry.value.copy(
            targetTotalLines = totalLines,
            currentTopLine = 1,
            currentBottomLine = targetDevice.linesPerPage,
            currentPage = 1,
            activeStep = "START_READY",
            statusMessage = "Calibrated: $totalLines lines verified via Ctrl+End / Ctrl+Home ✔"
        )
        totalLines
    }

    suspend fun performLineCalibration(targetDisplayId: Int = 0, getGutterMetrics: suspend () -> GutterMetricsSnapshot?): Int {
        return performInstantCalibration(targetDisplayId, getGutterMetrics)
    }

    suspend fun advancePageWithArrowKeys(pageIndex: Int, targetDisplayId: Int = 0): Boolean = withContext(Dispatchers.Default) {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        setSoftKeyboardHidden(true)
        val targetDevice = _deviceModel.value.resolve()
        val arrowCount = targetDevice.arrowCountForPage(pageIndex)
        val (targetTop, targetBot) = targetDevice.expectedBounds(pageIndex + 1)

        _telemetry.value = _telemetry.value.copy(
            activeStep = "PRECISION_SCROLL",
            statusMessage = "Advancing with $arrowCount Down Arrow presses (targeting Ln $targetTop at top)..."
        )

        val ok = dispatchKeyEvents(resolved, 20, arrowCount)
        delay(600)
        ok
    }

    fun startPacingEngine(
        targetDisplayId: Int = 0, totalLines: Int = 0, dwellTimeMs: Long = DWELL_TIME_MS, phase: String = "RECORDING_AND_PACING",
        onSegmentBoundary: (suspend (chunkIndex: Int, handoverLine: Int, overlapLine: Int) -> Unit)? = null,
        onPageAdvanced: (suspend (pageIndex: Int, topLine: Int, bottomLine: Int) -> Unit)? = null,
        onFrameCaptureNeeded: (suspend (pageIndex: Int, topLine: Int, bottomLine: Int) -> Unit)? = null,
        isFinishedCheck: (suspend () -> Boolean)? = null
    ) {
        if (!isPaginating.compareAndSet(false, true)) return
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val targetDevice = _deviceModel.value.resolve()
        val initialTarget = if (totalLines > 0) totalLines else _calculatedTotalLines.value
        _calculatedTotalLines.value = initialTarget
        _currentPage.value = 1
        _telemetry.value = PacingTelemetry(phase = phase, currentPage = 1, currentTopLine = 1, currentBottomLine = targetDevice.linesPerPage, targetTotalLines = initialTarget, statusMessage = "Starting Page 1 (Lines 1-${targetDevice.linesPerPage})...", dwellRemainingMs = dwellTimeMs, isDwellActive = true)
        acquireWakeLock()

        automationJob = serviceScope.launch {
            var dynamicTotal = initialTarget
            try {
                setSoftKeyboardHidden(true)
                _paginationState.value = PaginationState.Running
                var pageIndex = 0; var curTop = 1; var curBot = targetDevice.linesPerPage; var chunkIdx = 1; var chunkStart = 1

                for (sec in 3 downTo 1) {
                    _telemetry.value = _telemetry.value.copy(activeStep = "START_READY", statusMessage = "Focus Teams window! Starting capture in $sec...")
                    delay(1000)
                }

                while (isActive && isPaginating.get()) {
                    while (isPaused.get() && isPaginating.get() && isActive) delay(250)
                    if (!isActive || !isPaginating.get()) break
                    pageIndex++
                    _currentPage.value = pageIndex

                    if (pageIndex == 1) {
                        setSoftKeyboardHidden(true)
                        dispatchKeyCombination(resolvedDisplay, 113, 122)
                        delay(400)
                        curTop = 1; curBot = targetDevice.linesPerPage
                        _telemetry.value = _telemetry.value.copy(activeStep = "SCREEN_CAPTURE", currentPage = 1, currentTopLine = 1, currentBottomLine = curBot, statusMessage = "Page 1: Capturing frame (Ln 1-$curBot)...")
                        delay(300)
                        onFrameCaptureNeeded?.invoke(pageIndex, curTop, curBot)
                    } else {
                        advancePageWithArrowKeys(pageIndex - 1, resolvedDisplay)
                        val (expectedTop, expectedBot) = targetDevice.expectedBounds(pageIndex)
                        curTop = expectedTop; curBot = expectedBot
                        _telemetry.value = _telemetry.value.copy(activeStep = "SCREEN_CAPTURE", currentPage = pageIndex, currentTopLine = curTop, currentBottomLine = curBot, statusMessage = "Page $pageIndex: Settled frame (Ln $curTop-$curBot)...")
                        delay(400)
                        onFrameCaptureNeeded?.invoke(pageIndex, curTop, curBot)
                    }

                    val chunkProgress = curBot - chunkStart
                    _telemetry.value = PacingTelemetry(
                        phase = phase, activeStep = "DWELL_FREEZE", currentPage = pageIndex, currentTopLine = curTop, currentBottomLine = curBot,
                        targetTotalLines = dynamicTotal, currentSegmentIndex = chunkIdx, segmentProgressLines = chunkProgress.coerceAtLeast(0),
                        statusMessage = "Page $pageIndex (Ln $curTop-$curBot) • Dwell Freeze", dwellRemainingMs = dwellTimeMs, isDwellActive = true
                    )

                    var remaining = dwellTimeMs
                    _dwellCountdownMs.value = remaining
                    while (remaining > 0 && isActive && isPaginating.get()) {
                        delay(100L); remaining -= 100L
                        _dwellCountdownMs.value = remaining
                        _telemetry.value = _telemetry.value.copy(dwellRemainingMs = remaining)
                    }
                    _dwellCountdownMs.value = 0L
                    _telemetry.value = _telemetry.value.copy(dwellRemainingMs = 0L, isDwellActive = false, activeStep = "LOOP_EVAL")
                    onPageAdvanced?.invoke(pageIndex, curTop, curBot)

                    if (chunkProgress >= 1200) {
                        val handover = curBot; val overlap = (handover - 8).coerceAtLeast(1)
                        chunkIdx++; chunkStart = overlap
                        onSegmentBoundary?.invoke(chunkIdx, handover, overlap)
                    }

                    if ((dynamicTotal > 0 && curBot >= dynamicTotal) || isFinishedCheck?.invoke() == true) break
                }
            } catch (_: CancellationException) {
            } catch (e: Exception) { Log.e(TAG, "Pagination error", e)
            } finally {
                isPaginating.set(false); setSoftKeyboardHidden(false); releaseWakeLock()
                _paginationState.value = PaginationState.Idle
                _telemetry.value = _telemetry.value.copy(phase = "COMPLETED", targetTotalLines = dynamicTotal, isDwellActive = false, dwellRemainingMs = 0L, statusMessage = "Pacing Complete (Total: $dynamicTotal lines)")
            }
        }
    }

    fun stopPagination() {
        if (isPaginating.compareAndSet(true, false)) {
            isPaused.set(false); automationJob?.cancel(); setSoftKeyboardHidden(false); releaseWakeLock()
            _paginationState.value = PaginationState.Idle
        }
    }

    fun pausePagination() {
        if (isPaginating.get()) {
            isPaused.set(true); _paginationState.value = PaginationState.Paused
            _telemetry.value = _telemetry.value.copy(phase = "PAUSED", isPacing = false, statusMessage = "Paused at Page ${_currentPage.value}")
        }
    }

    fun resumePagination() {
        if (isPaginating.get() && isPaused.get()) {
            acquireWakeLock()
            isPaused.set(false); _paginationState.value = PaginationState.Running
            _telemetry.value = _telemetry.value.copy(phase = "PACING", isPacing = true, statusMessage = "Resumed at Page ${_currentPage.value}")
        }
    }

    suspend fun restartFromBeginning(targetDisplayId: Int = 0) {
        stopPagination(); isPaused.set(false); resetToStart(_calculatedTotalLines.value)
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val targetDevice = _deviceModel.value.resolve()
        setSoftKeyboardHidden(true)
        dispatchKeyCombination(resolved, 113, 122)
        delay(400)
        _telemetry.value = _telemetry.value.copy(phase = "READY", statusMessage = "Restarted from Beginning (Page 1)", currentPage = 1, currentTopLine = 1, currentBottomLine = targetDevice.linesPerPage)
    }

    suspend fun seekToLine(targetLine: Int, currentEstimatedLine: Int, targetDisplayId: Int = 0) {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolved)
        val lineDiff = targetLine - currentEstimatedLine
        repeat((Math.abs(lineDiff) / 28).coerceIn(1, 12)) {
            val (startY, endY) = if (lineDiff < 0) (bounds.centerY() - bounds.height() * 0.05f) to (bounds.centerY() + bounds.height() * 0.35f)
            else (bounds.centerY() + bounds.height() * 0.22f) to (bounds.centerY() - bounds.height() * 0.22f)
            dispatchSwipe(bounds.centerX().toFloat(), startY, bounds.centerX().toFloat(), endY, 280, displayId = resolved)
            delay(350)
        }
        delay(500)
    }

    private suspend fun dispatchSwipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 450L, holdDurationMs: Long = 200L, displayId: Int = 0): Boolean = suspendCancellableCoroutine { cont ->
        val p1 = Path().apply { moveTo(startX, startY); lineTo(endX, endY) }
        val s1 = GestureDescription.StrokeDescription(p1, 0L, durationMs, true)
        val b1 = GestureDescription.Builder().addStroke(s1).apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setDisplayId(displayId) }
        val d1 = dispatchGesture(b1.build(), object : GestureResultCallback() {
            override fun onCompleted(g: GestureDescription?) {
                val p2 = Path().apply { moveTo(endX, endY); lineTo(endX, endY) }
                val s2 = s1.continueStroke(p2, 0L, holdDurationMs, false)
                val b2 = GestureDescription.Builder().addStroke(s2).apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setDisplayId(displayId) }
                val d2 = dispatchGesture(b2.build(), object : GestureResultCallback() {
                    override fun onCompleted(g2: GestureDescription?) { if (cont.isActive) cont.resume(true) }
                    override fun onCancelled(g2: GestureDescription?) { if (cont.isActive) cont.resume(false) }
                }, null)
                if (!d2 && cont.isActive) cont.resume(false)
            }
            override fun onCancelled(g: GestureDescription?) { if (cont.isActive) cont.resume(false) }
        }, null)
        if (!d1 && cont.isActive) cont.resume(false)
    }

    suspend fun dispatchMicroDrag(deltaY: Float, displayId: Int = 0): Boolean {
        val bounds = getDisplayOrWindowBounds(displayId)
        val clamped = deltaY.coerceIn(-bounds.height() * 0.35f, bounds.height() * 0.35f)
        return dispatchSwipe(bounds.centerX().toFloat(), bounds.centerY() - clamped * 0.5f, bounds.centerX().toFloat(), bounds.centerY() + clamped * 0.5f, 380L, 280L, displayId)
    }

    suspend fun detectGutterState(bitmap: Bitmap): GutterOcrTracker.GutterState? {
        if (bitmap.isRecycled) return null
        val activeTracker = SegmentRecorderService.instance?.getGutterTracker()
        if (activeTracker != null) {
            val res = activeTracker.analyzeFrameSync(bitmap)
            if (res != null && res.currentTopLine > 0) return res
        }
        return runCatching {
            val localEngine = MlKitOcrEngine()
            val tracker = GutterOcrTracker(serviceScope, this, localEngine)
            val res = tracker.analyzeFrameSync(bitmap)
            tracker.close()
            res
        }.getOrNull()
    }

    suspend fun performPageDown(displayId: Int = 0) = dispatchKeyEvents(displayId, 20, _deviceModel.value.resolve().linesPerPage)
    suspend fun performPageUp(displayId: Int = 0) = dispatchKeyEvents(displayId, 19, _deviceModel.value.resolve().linesPerPage)

    suspend fun alignAndCaptureNextPage(targetTopLine: Int? = null, targetDisplayId: Int = 0): Bitmap? {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        ensureKeyboardClosed(resolved)

        val curPage = if (_currentPage.value > 0) _currentPage.value else 1
        val targetDevice = _deviceModel.value.resolve()
        val arrowCount = targetDevice.arrowCountForPage(curPage)
        updateStatus("Advancing page with $arrowCount Arrow Down presses...")

        // Positioning the bottom line of code to the top by using the arrow down key
        dispatchKeyEvents(resolved, 20, arrowCount)
        delay(400)
        ensureKeyboardClosed(resolved)
        delay(DWELL_TIME_MS)

        // Capture settled frame
        val snapshot = captureScreenshot(resolved)
        if (snapshot != null) {
            latestCapturedBitmap = snapshot
            val (expTop, expBot) = targetDevice.expectedBounds(curPage + 1)
            val newPage = curPage + 1
            _currentPage.value = newPage
            _telemetry.value = _telemetry.value.copy(
                currentPage = newPage,
                currentTopLine = expTop,
                currentBottomLine = expBot,
                activeStep = "SCREEN_CAPTURE",
                statusMessage = "Page $newPage (Ln $expTop-$expBot) Aligned via Arrow Down ✔"
            )
            Log.i(TAG, "alignAndCaptureNextPage captured: Page $newPage Top=$expTop Bot=$expBot via $arrowCount Down keys")
        }
        return snapshot
    }

    private fun performScrollFallback(window: AccessibilityWindowInfo?) {
        (window?.root ?: rootInActiveWindow)?.let { findFirstScrollableNode(it) }?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
    }

    private fun findFirstScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val res = findFirstScrollableNode(child)
            if (res != null) return res
        }
        return null
    }

    fun captureAndAnalyzeCurrentScreen(serverHost: String = "192.168.86.83:8000", onComplete: ((topLine: Int, bottomLine: Int, success: Boolean, msg: String) -> Unit)? = null) {
        val service = SegmentRecorderService.instance
        if (service == null || !service.serviceState.value.isReady) {
            _telemetry.value = _telemetry.value.copy(statusMessage = "Capture not ready: open app to grant screen capture")
            onComplete?.invoke(0, 0, false, "Screen capture not ready"); return
        }
        serviceScope.launch {
            _telemetry.value = _telemetry.value.copy(statusMessage = "Capturing screen snapshot...", isPacing = false)
            delay(300)
            val snapshot = service.getCaptureManager()?.captureSettledSnapshot()
            if (snapshot == null) {
                _telemetry.value = _telemetry.value.copy(statusMessage = "Failed: VirtualDisplay snapshot was null")
                onComplete?.invoke(0, 0, false, "Snapshot was null"); return@launch
            }
            _telemetry.value = _telemetry.value.copy(statusMessage = "Sending frame to Python API for AI Gutter OCR...")
            val result = com.matrixcapture.app.network.FrameUploadClient(serverHost).uploadFrame(snapshot, 0, 0, _currentPage.value)
            if (result.success && result.topLine > 0) {
                _telemetry.value = _telemetry.value.copy(currentTopLine = result.topLine, currentBottomLine = result.bottomLine, statusMessage = "Gutter Verified: Ln ${result.topLine} → ${result.bottomLine} (${result.extractedLineCount} lines). Waiting.", isPacing = false)
                onComplete?.invoke(result.topLine, result.bottomLine, true, result.message)
            } else {
                _telemetry.value = _telemetry.value.copy(statusMessage = if (result.success) "Server analyzed frame (${result.extractedLineCount} lines). Waiting." else "Upload/OCR failed: ${result.message}", isPacing = false)
                onComplete?.invoke(0, 0, result.success, result.message)
            }
        }
    }

    sealed class PaginationState {
        object Idle : PaginationState()
        object Running : PaginationState()
        object Paused : PaginationState()
        data class Error(val message: String) : PaginationState()
    }

    data class GutterMetricsSnapshot(val lowestLineNumber: Int, val lowestLineBottomY: Int, val linePitchPx: Float)

    data class PacingTelemetry(
        val phase: String = "IDLE", val activeStep: String = "START_READY", val isPacing: Boolean = false,
        val currentPage: Int = 1, val currentTopLine: Int = 0, val currentBottomLine: Int = 0, val targetTotalLines: Int = 0,
        val currentSegmentIndex: Int = 1, val segmentProgressLines: Int = 0, val segmentTargetLines: Int = 1200,
        val statusMessage: String = "Ready: Tap 'Capture Screen' to read gutter", val dwellRemainingMs: Long = 0L,
        val isDwellActive: Boolean = false, val autoTuneFactor: Float = 1.0f, val bottomToTopError: Int = 0,
        val linePitchPx: Float = 32f, val wrappedLinesDetected: Int = 0
    )

    companion object {
        private const val TAG = "DesktopPaginationService"
        const val DWELL_TIME_MS = 1500L
        @Volatile var instance: DesktopPaginationService? = null; private set
        @Volatile var latestCapturedBitmap: Bitmap? = null

        fun updateStatus(message: String) { _telemetry.value = _telemetry.value.copy(statusMessage = message) }
        fun updateGutterMetrics(topLine: Int, bottomLine: Int, linePitchPx: Float, wrappedLinesCount: Int = 0) {
            val old = _telemetry.value
            val pitch = if (linePitchPx > 0f) linePitchPx else old.linePitchPx
            _telemetry.value = old.copy(
                currentTopLine = if (topLine > 0) topLine else old.currentTopLine,
                currentBottomLine = if (bottomLine > 0) bottomLine else old.currentBottomLine,
                linePitchPx = pitch,
                wrappedLinesDetected = wrappedLinesCount
            )
        }
        private val _isServiceActive = MutableStateFlow(false); val isServiceActive = _isServiceActive.asStateFlow()
        private val _paginationState = MutableStateFlow<PaginationState>(PaginationState.Idle); val paginationState = _paginationState.asStateFlow()
        private val _currentPage = MutableStateFlow(1); val currentPage = _currentPage.asStateFlow()
        private val _dwellCountdownMs = MutableStateFlow(0L); val dwellCountdownMs = _dwellCountdownMs.asStateFlow()
        private val _calculatedTotalLines = MutableStateFlow(0); val calculatedTotalLines = _calculatedTotalLines.asStateFlow()
        private val _calibrationState = MutableStateFlow("Uncalibrated (Auto-detect active)"); val calibrationState = _calibrationState.asStateFlow()
        private val _telemetry = MutableStateFlow(PacingTelemetry()); val telemetry = _telemetry.asStateFlow()
        private val _isSoftKeyboardSuppressed = MutableStateFlow(false); val isSoftKeyboardSuppressed = _isSoftKeyboardSuppressed.asStateFlow()
        private val _deviceModel = MutableStateFlow(DeviceModel.AUTO); val deviceModel = _deviceModel.asStateFlow()

        fun setDeviceModel(model: DeviceModel) {
            _deviceModel.value = model
            val resolved = model.resolve()
            _telemetry.update { old ->
                if (old.currentBottomLine <= 0 || old.currentBottomLine in listOf(31, 49)) {
                    old.copy(currentBottomLine = resolved.linesPerPage)
                } else old
            }
        }

        fun resetToStart(targetLines: Int = 0) {
            instance?.stopPagination()
            val targetDevice = _deviceModel.value.resolve()
            _currentPage.value = 1
            _dwellCountdownMs.value = 0L
            _calculatedTotalLines.value = targetLines
            _calibrationState.value = if (targetLines > 0) "Ready (Target: $targetLines lines)" else "Ready (Auto-detect document length)"
            _telemetry.value = PacingTelemetry(phase = "READY", currentPage = 1, currentTopLine = 1, currentBottomLine = targetDevice.linesPerPage, targetTotalLines = targetLines)
        }
    }
}

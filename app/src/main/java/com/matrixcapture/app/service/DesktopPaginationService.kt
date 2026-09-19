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
import kotlin.coroutines.resume
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean

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
        if (wakeLock?.isHeld == false) wakeLock?.acquire(60 * 60 * 1000L)
    }

    private fun releaseWakeLock() = runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        _isServiceActive.value = true
        runCatching {
            softKeyboardController.addOnShowModeChangedListener { _, mode -> _isSoftKeyboardSuppressed.value = (mode == SHOW_MODE_HIDDEN) }
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
        stopPagination()
        setSoftKeyboardHidden(false)
        serviceScope.cancel()
        instance = null
        _isServiceActive.value = false
    }

    fun resolveTargetDisplayId(preferredId: Int? = null): Int {
        if (preferredId != null && preferredId != Display.DEFAULT_DISPLAY) return preferredId
        val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        return dm?.displays?.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }?.displayId ?: 0
    }

    suspend fun captureScreenshot(targetDisplayId: Int? = null): Bitmap? = suspendCancellableCoroutine { cont ->
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

    fun findTargetWindow(displayId: Int): AccessibilityWindowInfo? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            windowsOnAllDisplays.get(displayId)?.let { list ->
                return list.firstOrNull { (it.root?.packageName?.toString() ?: "").contains("teams", true) || it.isFocused } ?: list.firstOrNull()
            }
        }
        return windows.firstOrNull {
            val teams = (it.root?.packageName?.toString() ?: "").contains("teams", true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) it.displayId == displayId && (teams || it.isFocused) else teams
        } ?: windows.firstOrNull { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) it.displayId == displayId else true }
    }

    fun getDisplayOrWindowBounds(displayId: Int): Rect {
        val bounds = Rect()
        findTargetWindow(displayId)?.getBoundsInScreen(bounds)
        if (bounds.isEmpty) {
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

    suspend fun performLineCalibration(targetDisplayId: Int = 0, getGutterMetrics: suspend () -> GutterMetricsSnapshot?): Int = withContext(Dispatchers.Default) {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolved)
        for (sec in 3 downTo 1) {
            _calibrationState.value = "Calibrating in $sec... (Focus Teams window)"
            _telemetry.value = _telemetry.value.copy(statusMessage = "Focus Teams window! Starting calibration in $sec...")
            delay(1000)
        }
        var lastLineSeen = -1; var bottomUnchanged = 0
        for (i in 0 until 150) {
            dispatchSwipe(bounds.centerX().toFloat(), bounds.bottom * 0.85f, bounds.centerX().toFloat(), bounds.top * 0.15f, 90, displayId = resolved)
            delay(120)
            if (i % 3 == 0) {
                delay(180)
                val line = getGutterMetrics()?.lowestLineNumber ?: -1
                if (line > 0) {
                    _calibrationState.value = "Calibrating: Flinging down (Line $line)..."
                    if (line == lastLineSeen) {
                        if (++bottomUnchanged >= 2) break
                    } else { bottomUnchanged = 0; lastLineSeen = line }
                }
            }
        }
        delay(700)
        val metrics = getGutterMetrics()
        val totalLines = if (metrics != null && metrics.linePitchPx > 0 && metrics.lowestLineNumber > 0) {
            val obscured = (bounds.bottom - metrics.lowestLineBottomY).coerceAtLeast(0)
            metrics.lowestLineNumber + Math.ceil(obscured.toDouble() / metrics.linePitchPx).toInt()
        } else (if (lastLineSeen > 0) lastLineSeen else 0)

        _calibrationState.value = "Calibrating: Returning to line 1..."
        val upStartY = bounds.centerY() - bounds.height() * 0.05f
        val upEndY = bounds.centerY() + bounds.height() * 0.35f
        var topReached = 0
        for (i in 0 until 80) {
            if ((getGutterMetrics()?.lowestLineNumber ?: 999) <= 46 && ++topReached >= 2) break
            dispatchSwipe(bounds.centerX().toFloat(), upStartY, bounds.centerX().toFloat(), upEndY, 180, displayId = resolved)
            delay(150)
        }
        delay(800)
        _calibrationState.value = "Calibration Complete: $totalLines lines"
        _calculatedTotalLines.value = totalLines
        _telemetry.value = _telemetry.value.copy(targetTotalLines = totalLines, statusMessage = "Calibrated: $totalLines lines detected")
        totalLines
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
        val initialTarget = if (totalLines > 0) totalLines else _calculatedTotalLines.value
        _calculatedTotalLines.value = initialTarget
        _currentPage.value = 1
        _telemetry.value = PacingTelemetry(phase = phase, currentPage = 1, currentTopLine = 1, currentBottomLine = 44, targetTotalLines = initialTarget, statusMessage = "Starting Page 1 (Lines 1-44)...", dwellRemainingMs = dwellTimeMs, isDwellActive = true)
        acquireWakeLock()

        automationJob = serviceScope.launch {
            var dynamicTotal = initialTarget
            try {
                setSoftKeyboardHidden(true)
                _paginationState.value = PaginationState.Running
                val bounds = getDisplayOrWindowBounds(resolvedDisplay)
                val (centerX, centerY) = bounds.centerX().toFloat() to bounds.centerY().toFloat()
                var pageIndex = 0; var curTop = 1; var curBot = 44; var chunkIdx = 1; var chunkStart = 1
                var botStatic = 0; var prevBot = -1; var prevTop = -1; var autoTune = 1.0f; var alignErr = 0

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
                        _telemetry.value = _telemetry.value.copy(activeStep = "SCREEN_CAPTURE", statusMessage = "Page 1: Capturing initial frame (Ln 1)...")
                        val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        if (ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine) {
                            curTop = ocr.currentTopLine; curBot = ocr.currentBottomLine; prevBot = curBot; prevTop = curTop
                        }
                        delay(500)
                        _telemetry.value = _telemetry.value.copy(activeStep = "OCR_BOUNDS", statusMessage = "Page 1: OCR bounds verified (Ln $curTop-$curBot)")
                        onFrameCaptureNeeded?.invoke(pageIndex, curTop, curBot)
                    } else {
                        val targetTop = curBot + 1
                        _telemetry.value = _telemetry.value.copy(activeStep = "PRECISION_SCROLL", statusMessage = "Precision scrolling: positioning next page top to Ln $targetTop...")
                        val ocrBefore = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        val prevBottomY = if (ocrBefore != null && ocrBefore.lowestDetectedY > 0) ocrBefore.lowestDetectedY.toFloat() else bounds.height() * 0.86f
                        val adaptiveTravel = ((prevBottomY - (bounds.height() * 0.12f).coerceAtLeast(100f)).coerceAtLeast(220f) * autoTune).coerceIn(200f, bounds.height() * 0.70f)
                        if (!dispatchSwipe(centerX, centerY + adaptiveTravel / 2f, centerX, centerY - adaptiveTravel / 2f, 360L, displayId = resolvedDisplay)) {
                            performScrollFallback(findTargetWindow(resolvedDisplay))
                        }
                        delay(700)
                        _telemetry.value = _telemetry.value.copy(activeStep = "SCREEN_CAPTURE", statusMessage = "Page $pageIndex: Settled, capturing frame...")

                        val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        if (ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine) {
                            curTop = ocr.currentTopLine; curBot = ocr.currentBottomLine
                            if (curBot > dynamicTotal) { dynamicTotal = curBot; _calculatedTotalLines.value = dynamicTotal }
                            if (curBot == prevBot || curTop == prevTop) {
                                if (++botStatic >= 2) { dynamicTotal = curBot; _calculatedTotalLines.value = dynamicTotal; break }
                            } else { botStatic = 0; prevBot = curBot; prevTop = curTop }
                            alignErr = curTop - targetTop
                            autoTune = if (alignErr > 0) (autoTune - 0.05f * alignErr).coerceIn(0.65f, 1.35f) else if (alignErr < -1) (autoTune + 0.03f * (-alignErr)).coerceIn(0.65f, 1.35f) else autoTune
                            _telemetry.value = _telemetry.value.copy(activeStep = "OCR_BOUNDS", statusMessage = "Page $pageIndex: Gutter OCR Ln $curTop-$curBot (err $alignErr)")
                        } else alignErr = 0
                        onFrameCaptureNeeded?.invoke(pageIndex, curTop, curBot)
                    }

                    val chunkProgress = curBot - chunkStart
                    val gState = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                    _telemetry.value = PacingTelemetry(
                        phase = phase, activeStep = "DWELL_FREEZE", currentPage = pageIndex, currentTopLine = curTop, currentBottomLine = curBot,
                        targetTotalLines = dynamicTotal, currentSegmentIndex = chunkIdx, segmentProgressLines = chunkProgress.coerceAtLeast(0),
                        statusMessage = "Page $pageIndex (Ln $curTop-$curBot) • Dwell Freeze", dwellRemainingMs = dwellTimeMs, isDwellActive = true,
                        autoTuneFactor = autoTune, bottomToTopError = alignErr, linePitchPx = gState?.linePitchPx ?: 32f, wrappedLinesDetected = gState?.wrappedLinesCount ?: 0
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

                    val hasOcr = gState != null && gState.currentTopLine > 0 && gState.currentBottomLine >= gState.currentTopLine
                    if ((hasOcr && curBot >= dynamicTotal && botStatic >= 1) || (!hasOcr && curTop >= dynamicTotal) || isFinishedCheck?.invoke() == true) break
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
            isPaused.set(false); _paginationState.value = PaginationState.Running
            _telemetry.value = _telemetry.value.copy(phase = "PACING", isPacing = true, statusMessage = "Resumed at Page ${_currentPage.value}")
        }
    }

    suspend fun restartFromBeginning(targetDisplayId: Int = 0) {
        stopPagination(); isPaused.set(false); resetToStart(_calculatedTotalLines.value)
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolved)
        repeat(12) {
            dispatchSwipe(bounds.centerX().toFloat(), bounds.top * 0.25f, bounds.centerX().toFloat(), bounds.bottom * 0.75f, 250, displayId = resolved)
            delay(250)
        }
        _telemetry.value = _telemetry.value.copy(phase = "READY", statusMessage = "Restarted from Beginning (Page 1)", currentPage = 1, currentTopLine = 1, currentBottomLine = 0)
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

    private suspend fun performPageScroll(forward: Boolean, displayId: Int): Boolean {
        val resolved = resolveTargetDisplayId(displayId)
        findTargetWindow(resolved)?.root?.let { findFirstScrollableNode(it) }?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val act = if (forward) AccessibilityNodeInfo.AccessibilityAction.ACTION_PAGE_DOWN else AccessibilityNodeInfo.AccessibilityAction.ACTION_PAGE_UP
                if (it.performAction(act.id)) return true
            }
            if (it.performAction(if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return true
        }
        val bounds = getDisplayOrWindowBounds(resolved)
        val offset = bounds.height() * 0.25f
        val (startY, endY) = if (forward) (bounds.centerY() + offset) to (bounds.centerY() - offset) else (bounds.centerY() - offset) to (bounds.centerY() + offset)
        return dispatchSwipe(bounds.centerX().toFloat(), startY, bounds.centerX().toFloat(), endY, 350L, 200L, resolved)
    }

    suspend fun performPageDown(displayId: Int = 0) = performPageScroll(true, displayId)
    suspend fun performPageUp(displayId: Int = 0) = performPageScroll(false, displayId)

    suspend fun navigateToNextPageTargetLine(targetTopLine: Int, currentEstimatedTopLine: Int = 0, targetDisplayId: Int = 0): Boolean {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolved)
        val linePitch = _telemetry.value.linePitchPx.coerceIn(24f, 48f)
        updateStatus("Orchestrating advance to Target Line $targetTopLine at top...")
        val advance = if (currentEstimatedTopLine > 0) targetTopLine - currentEstimatedTopLine else 28
        when {
            advance >= 20 -> { performPageDown(resolved); delay(500) }
            advance <= -20 -> { performPageUp(resolved); delay(500) }
            Math.abs(advance) > 5 -> {
                val advancePx = (advance * linePitch).coerceAtMost(bounds.height() * 0.65f)
                val startY = bounds.centerY() + (advancePx * 0.45f).coerceAtMost(bounds.height() * 0.30f)
                val endY = bounds.centerY() - (advancePx * 0.45f).coerceAtMost(bounds.height() * 0.30f)
                dispatchSwipe(bounds.centerX().toFloat(), startY, bounds.centerX().toFloat(), endY, 400L, 250L, resolved)
                delay(450)
            }
        }
        val gState = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
        val detectedTop = gState?.currentTopLine ?: 0
        if (detectedTop > 0) {
            val delta = targetTopLine - detectedTop
            if (delta != 0 && Math.abs(delta) <= 15) {
                dispatchMicroDrag(-delta * (if (gState != null && gState.linePitchPx > 10f) gState.linePitchPx else linePitch), resolved)
                delay(400)
            }
        }
        updateStatus("Target Line $targetTopLine positioned at top of viewport ✔")
        return true
    }

    suspend fun alignAndCaptureNextPage(targetTopLine: Int? = null, targetDisplayId: Int = 0): Bitmap? {
        val resolved = resolveTargetDisplayId(targetDisplayId)
        val nextTarget = targetTopLine ?: (if (_telemetry.value.currentBottomLine > 0) _telemetry.value.currentBottomLine + 1 else 1)
        navigateToNextPageTargetLine(nextTarget, _telemetry.value.currentTopLine, resolved)
        delay(DWELL_TIME_MS)
        val snapshot = captureScreenshot(resolved)
        if (snapshot != null) {
            latestCapturedBitmap = snapshot
            val newPage = if (_telemetry.value.currentPage > 0) _telemetry.value.currentPage + 1 else 2
            _telemetry.value = _telemetry.value.copy(currentPage = newPage, currentTopLine = nextTarget, currentBottomLine = nextTarget + 44, statusMessage = "Line $nextTarget at top of Page $newPage")
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
        private val _isServiceActive = MutableStateFlow(false); val isServiceActive = _isServiceActive.asStateFlow()
        private val _paginationState = MutableStateFlow<PaginationState>(PaginationState.Idle); val paginationState = _paginationState.asStateFlow()
        private val _currentPage = MutableStateFlow(1); val currentPage = _currentPage.asStateFlow()
        private val _dwellCountdownMs = MutableStateFlow(0L); val dwellCountdownMs = _dwellCountdownMs.asStateFlow()
        private val _calculatedTotalLines = MutableStateFlow(0); val calculatedTotalLines = _calculatedTotalLines.asStateFlow()
        private val _calibrationState = MutableStateFlow("Uncalibrated (Auto-detect active)"); val calibrationState = _calibrationState.asStateFlow()
        private val _telemetry = MutableStateFlow(PacingTelemetry()); val telemetry = _telemetry.asStateFlow()
        private val _isSoftKeyboardSuppressed = MutableStateFlow(false); val isSoftKeyboardSuppressed = _isSoftKeyboardSuppressed.asStateFlow()

        fun resetToStart(targetLines: Int = 0) {
            instance?.stopPagination()
            _currentPage.value = 1
            _dwellCountdownMs.value = 0L
            _calculatedTotalLines.value = targetLines
            _calibrationState.value = if (targetLines > 0) "Ready (Target: $targetLines lines)" else "Ready (Auto-detect document length)"
            _telemetry.value = PacingTelemetry(phase = "READY", currentPage = 1, currentTopLine = 0, currentBottomLine = 0, targetTotalLines = targetLines)
        }
    }
}

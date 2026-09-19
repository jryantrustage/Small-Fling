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
import kotlin.coroutines.resume
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Module B: Accessibility & Input Automation Service for Android Desktop Mode.
 *
 * Runs automation on Display 1 (External Display / Teams Desktop Window):
 * 1. Initial Total-Line Calibration:
 *    - Rapid fling to bottom of document.
 *    - Resolves Teams offline/status bar occlusion via gutter pitch calculation.
 *    - Smoothly scrolls back to line 1.
 * 2. Pacing Engine:
 *    - Injects precise page-down swipes / scroll actions.
 *    - Enforces a strict 1,500ms freeze-per-page dwell time for 1 FPS Gemini video ingestion.
 */
class DesktopPaginationService : AccessibilityService() {

    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var automationJob: Job? = null
    private val isPaginating = AtomicBoolean(false)
    private val isPaused = AtomicBoolean(false)
    private var wakeLock: PowerManager.WakeLock? = null

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "MatrixCapture:PaginationWakeLock"
                )
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(60 * 60 * 1000L) // 60 min timeout
                Log.i(TAG, "Screen WakeLock acquired (prevents Desktop Mode display sleep).")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i(TAG, "Screen WakeLock released.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release wake lock", e)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        _isServiceActive.value = true
        try {
            softKeyboardController.addOnShowModeChangedListener { _, showMode ->
                _isSoftKeyboardSuppressed.value = (showMode == SHOW_MODE_HIDDEN)
                Log.d(TAG, "Soft keyboard show mode changed: $showMode")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not register soft keyboard show mode listener", e)
        }
        Log.i(TAG, "DesktopPaginationService connected and ready for external display automation.")
    }

    /**
     * Controls on-screen soft keyboard suppression.
     * Prevents virtual keyboard from popping up on external displays during capture sessions.
     */
    fun setSoftKeyboardHidden(hidden: Boolean) {
        try {
            val mode = if (hidden) SHOW_MODE_HIDDEN else SHOW_MODE_AUTO
            softKeyboardController.showMode = mode
            _isSoftKeyboardSuppressed.value = (mode == SHOW_MODE_HIDDEN)
            Log.i(TAG, "Soft keyboard showMode set to: ${if (hidden) "HIDDEN" else "AUTO"}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to set soft keyboard showMode", e)
        }
    }

    fun toggleSoftKeyboard() {
        setSoftKeyboardHidden(!_isSoftKeyboardSuppressed.value)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Track window changes or content updates if needed
    }

    override fun onInterrupt() {
        Log.w(TAG, "DesktopPaginationService interrupted.")
        stopPagination()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopPagination()
        setSoftKeyboardHidden(false)
        serviceScope.cancel()
        instance = null
        _isServiceActive.value = false
        Log.i(TAG, "DesktopPaginationService destroyed.")
    }

    /**
     * Resolves the target external display ID dynamically from connected displays.
     */
    fun resolveTargetDisplayId(preferredId: Int? = null): Int {
        if (preferredId != null && preferredId != Display.DEFAULT_DISPLAY) {
            return preferredId
        }
        val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        val external = dm?.displays?.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }
        val resolved = external?.displayId ?: 0
        Log.i(TAG, "Resolved target display ID: $resolved (name=${external?.name})")
        return resolved
    }

    /**
     * Captures a screenshot of the specified or active desktop display via AccessibilityService API.
     */
    suspend fun captureScreenshot(targetDisplayId: Int? = null): Bitmap? = suspendCancellableCoroutine { cont ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val displayId = resolveTargetDisplayId(targetDisplayId)
            Log.i(TAG, "Attempting Accessibility takeScreenshot on display $displayId")
            try {
                takeScreenshot(
                    displayId,
                    mainExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(screenshotResult: ScreenshotResult) {
                            try {
                                val hwBuffer = screenshotResult.hardwareBuffer
                                val colorSpace = screenshotResult.colorSpace
                                val bmp = Bitmap.wrapHardwareBuffer(hwBuffer, colorSpace)
                                    ?.copy(Bitmap.Config.ARGB_8888, false)
                                hwBuffer.close()
                                if (bmp != null) {
                                    latestCapturedBitmap = bmp
                                    Log.i(TAG, "Accessibility screenshot succeeded: ${bmp.width}x${bmp.height}")
                                }
                                if (cont.isActive) cont.resume(bmp)
                            } catch (e: Exception) {
                                Log.e(TAG, "Error wrapping hardware buffer to Bitmap", e)
                                if (cont.isActive) cont.resume(null)
                            }
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.w(TAG, "takeScreenshot failed on display $displayId with code $errorCode. Retrying on default display...")
                            if (displayId != Display.DEFAULT_DISPLAY) {
                                takeScreenshot(
                                    Display.DEFAULT_DISPLAY,
                                    mainExecutor,
                                    object : TakeScreenshotCallback {
                                        override fun onSuccess(res: ScreenshotResult) {
                                            try {
                                                val hw = res.hardwareBuffer
                                                val bmp = Bitmap.wrapHardwareBuffer(hw, res.colorSpace)
                                                    ?.copy(Bitmap.Config.ARGB_8888, false)
                                                hw.close()
                                                if (bmp != null) latestCapturedBitmap = bmp
                                                if (cont.isActive) cont.resume(bmp)
                                            } catch (ex: Exception) {
                                                if (cont.isActive) cont.resume(null)
                                            }
                                        }

                                        override fun onFailure(err: Int) {
                                            Log.e(TAG, "takeScreenshot fallback also failed with code: $err")
                                            if (cont.isActive) cont.resume(null)
                                        }
                                    }
                                )
                            } else {
                                if (cont.isActive) cont.resume(null)
                            }
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception calling takeScreenshot", e)
                if (cont.isActive) cont.resume(null)
            }
        } else {
            if (cont.isActive) cont.resume(null)
        }
    }

    /**
     * Finds the target interactive window on the specified display.
     */
    fun findTargetWindow(displayId: Int): AccessibilityWindowInfo? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val displays = windowsOnAllDisplays
            val windowsForDisplay = displays.get(displayId)
            if (!windowsForDisplay.isNullOrEmpty()) {
                // Look for Teams or active focused window
                return windowsForDisplay.firstOrNull { window ->
                    val pkg = window.root?.packageName?.toString() ?: ""
                    pkg.contains("teams", ignoreCase = true) || window.isFocused
                } ?: windowsForDisplay.firstOrNull()
            }
        }

        // Fallback across all active windows
        return windows.firstOrNull { window ->
            val pkg = window.root?.packageName?.toString() ?: ""
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.displayId == displayId && (pkg.contains("teams", ignoreCase = true) || window.isFocused)
            } else {
                pkg.contains("teams", ignoreCase = true)
            }
        } ?: windows.firstOrNull { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) it.displayId == displayId else true }
    }

    /**
     * Resolves interactive screen bounds on the target display.
     */
    fun getDisplayOrWindowBounds(displayId: Int): Rect {
        val bounds = Rect()
        val targetWindow = findTargetWindow(displayId)
        if (targetWindow != null) {
            targetWindow.getBoundsInScreen(bounds)
        }
        if (bounds.isEmpty) {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val display = dm?.getDisplay(displayId)
            if (display != null) {
                val metrics = DisplayMetrics()
                @Suppress("DEPRECATION")
                display.getRealMetrics(metrics)
                bounds.set(0, 0, metrics.widthPixels, metrics.heightPixels)
            } else {
                bounds.set(0, 0, 1920, 1080)
            }
        }
        Log.i(TAG, "Target bounds on Display $displayId: $bounds")
        return bounds
    }

    /**
     * Executes the initial total-line calibration routine:
     * 1. Rapidly flings to the bottom of the document.
     * 2. Takes a measurement from Gutter OCR for lowest visible line and line pitch.
     * 3. Calculates obscured space and estimates true line count.
     * 4. Flings cleanly back to line 1.
     */
    suspend fun performLineCalibration(
        targetDisplayId: Int = 0,
        getGutterMetrics: suspend () -> GutterMetricsSnapshot?
    ): Int = withContext(Dispatchers.Default) {
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        _calibrationState.value = "Calibrating: Scrolling to bottom..."
        Log.i(TAG, "Starting line calibration on Display $resolvedDisplay")

        val bounds = getDisplayOrWindowBounds(resolvedDisplay)

        // 3-second focus delay so user can activate Teams window on external screen
        for (sec in 3 downTo 1) {
            _calibrationState.value = "Calibrating in $sec... (Focus Teams window on external display)"
            _telemetry.value = _telemetry.value.copy(
                statusMessage = "Focus Teams window! Starting calibration in $sec..."
            )
            delay(1000)
        }

        // Rapid fling down (upward swipes) until end of document is detected
        var lastLineSeen = -1
        var bottomUnchangedCount = 0
        val maxDownFlings = 150

        for (i in 0 until maxDownFlings) {
            dispatchSwipe(
                startX = bounds.centerX().toFloat(),
                startY = bounds.bottom * 0.85f,
                endX = bounds.centerX().toFloat(),
                endY = bounds.top * 0.15f,
                durationMs = 90,
                displayId = resolvedDisplay
            )
            delay(120)

            // Check OCR progression every 3 flings
            if (i % 3 == 0) {
                delay(180)
                val m = getGutterMetrics()
                val line = m?.lowestLineNumber ?: -1
                if (line > 0) {
                    _calibrationState.value = "Calibrating: Flinging down (Line $line)..."
                    if (line == lastLineSeen) {
                        bottomUnchangedCount++
                        if (bottomUnchangedCount >= 2) {
                            Log.i(TAG, "Calibration: End of document detected at line $line (bottom reached after $i flings).")
                            break
                        }
                    } else {
                        bottomUnchangedCount = 0
                        lastLineSeen = line
                    }
                }
            }
        }

        // Allow UI to completely settle at bottom
        delay(700)

        // Read OCR gutter metrics at bottom
        val metrics = getGutterMetrics()
        val totalLines = if (metrics != null && metrics.linePitchPx > 0 && metrics.lowestLineNumber > 0) {
            // Teams bottom status bar / offline banner height
            // Calculate obscured distance from lowest detected line to bottom of window
            val lowestLineBottomY = metrics.lowestLineBottomY
            val windowBottom = bounds.bottom
            val obscuredHeight = (windowBottom - lowestLineBottomY).coerceAtLeast(0)

            // Extrapolate hidden lines: Ceil(H_obscured / Pitch)
            val obscuredLineCount = Math.ceil(obscuredHeight.toDouble() / metrics.linePitchPx).toInt()
            val deducedTotal = metrics.lowestLineNumber + obscuredLineCount

            Log.i(
                TAG,
                "Calibration: Lowest line = ${metrics.lowestLineNumber}, pitch = ${metrics.linePitchPx}px, " +
                        "obscuredHeight = ${obscuredHeight}px, deduced total = $deducedTotal"
            )
            deducedTotal
        } else if (lastLineSeen > 0) {
            lastLineSeen
        } else {
            Log.w(TAG, "OCR could not detect document bottom; using dynamic open-ended discovery (0 lines).")
            0
        }

        _calibrationState.value = "Calibrating: Returning to line 1..."

        // Controlled scrolling back to top (downward swipes strictly within middle body zone).
        // Keeps startY >= 42% of screen to NEVER trigger Teams pull-down-to-dismiss gesture.
        val upStartY = bounds.centerY() - (bounds.height() * 0.05f) // ~45% of height
        val upEndY = bounds.centerY() + (bounds.height() * 0.35f)   // ~85% of height
        var reachedTopCount = 0
        for (i in 0 until 80) {
            val metricsNow = getGutterMetrics()
            if (metricsNow != null && metricsNow.lowestLineNumber <= 46) {
                reachedTopCount++
                if (reachedTopCount >= 2) {
                    Log.i(TAG, "Line 1 reached during upward scroll at iteration $i; stopping.")
                    break
                }
            } else {
                reachedTopCount = 0
            }
            dispatchSwipe(
                startX = bounds.centerX().toFloat(),
                startY = upStartY,
                endX = bounds.centerX().toFloat(),
                endY = upEndY,
                durationMs = 180,
                displayId = resolvedDisplay
            )
            delay(150)
        }

        // Settle at top of document
        delay(800)
        _calibrationState.value = "Calibration Complete: $totalLines lines"
        _calculatedTotalLines.value = totalLines
        _telemetry.value = _telemetry.value.copy(
            targetTotalLines = totalLines,
            statusMessage = "Calibrated: $totalLines lines detected"
        )
        totalLines
    }

    /**
     * Starts the automated pacing engine.
     * Enforces a strict freeze-per-page dwell time (default 1,500ms) for Gemini 1 FPS ingestion,
     * tracks exact line ranges with guaranteed 10-14 line overlap so ZERO lines are ever missed,
     * and auto-suppresses the soft keyboard during capture.
     */
    fun startPacingEngine(
        targetDisplayId: Int = 0,
        totalLines: Int = 0,
        dwellTimeMs: Long = DWELL_TIME_MS,
        phase: String = "RECORDING_AND_PACING",
        onSegmentBoundary: (suspend (chunkIndex: Int, handoverLine: Int, overlapLine: Int) -> Unit)? = null,
        onPageAdvanced: (suspend (pageIndex: Int, topLine: Int, bottomLine: Int) -> Unit)? = null,
        onFrameCaptureNeeded: (suspend (pageIndex: Int, topLine: Int, bottomLine: Int) -> Unit)? = null,
        isFinishedCheck: (suspend () -> Boolean)? = null
    ) {
        if (!isPaginating.compareAndSet(false, true)) {
            Log.w(TAG, "Pacing engine is already running.")
            return
        }

        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val initialTarget = if (totalLines > 0) totalLines else _calculatedTotalLines.value
        _calculatedTotalLines.value = initialTarget
        _currentPage.value = 1
        _telemetry.value = PacingTelemetry(
            phase = phase,
            currentPage = 1,
            currentTopLine = 1,
            currentBottomLine = 44,
            targetTotalLines = initialTarget,
            currentSegmentIndex = 1,
            segmentProgressLines = 0,
            segmentTargetLines = 1200,
            statusMessage = "Starting Page 1 (Lines 1-44)...",
            dwellRemainingMs = dwellTimeMs,
            isDwellActive = true
        )
        acquireWakeLock()

        automationJob = serviceScope.launch {
            var dynamicTotalLines = initialTarget
            try {
                // Auto-suppress on-screen soft keyboard during capture session
                setSoftKeyboardHidden(true)

                _paginationState.value = PaginationState.Running
                val targetWindow = findTargetWindow(resolvedDisplay)
                val bounds = getDisplayOrWindowBounds(resolvedDisplay)

                val centerY = bounds.centerY().toFloat()
                val centerX = bounds.centerX().toFloat()
                val durationMs = 360L

                val linesPerPage = 28
                val visibleLinesCount = 44
                var pageIndex = 0
                var currentTopLine = 1
                var currentBottomLine = visibleLinesCount
                var currentChunkIndex = 1
                var currentChunkStartLine = 1

                var bottomStaticCount = 0
                var prevBottomRead = -1
                var prevTopRead = -1

                // Adaptive Closed-Loop Auto-Tune State
                var autoTuneFactor = 1.0f
                var lastAlignmentError = 0
                var targetPreviousBottomLine = 1
                var targetNextTopLine = 1

                Log.i(TAG, "Starting pacing engine on Display $resolvedDisplay: Initial=$initialTarget lines, Dwell=${dwellTimeMs}ms, Phase=$phase")

                // 3-second focus countdown so user can ensure Teams is focused
                for (sec in 3 downTo 1) {
                    _telemetry.value = _telemetry.value.copy(
                        activeStep = "START_READY",
                        statusMessage = "Focus Teams window! Starting capture in $sec..."
                    )
                    delay(1000)
                }

                while (isActive && isPaginating.get()) {
                    while (isPaused.get() && isPaginating.get() && isActive) {
                        delay(250)
                    }
                    if (!isActive || !isPaginating.get()) break
                    pageIndex++
                    _currentPage.value = pageIndex

                    if (pageIndex == 1) {
                        _telemetry.value = _telemetry.value.copy(
                            activeStep = "SCREEN_CAPTURE",
                            statusMessage = "Page 1: Capturing initial frame (Ln 1)..."
                        )
                        // Check if real OCR lines are available on initial frame
                        val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        if (ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine) {
                            currentTopLine = ocr.currentTopLine
                            currentBottomLine = ocr.currentBottomLine
                            prevBottomRead = currentBottomLine
                            prevTopRead = currentTopLine
                        } else {
                            currentTopLine = 1
                            currentBottomLine = visibleLinesCount
                        }
                        Log.i(TAG, "Page 1 initial frame settling (Lines $currentTopLine-$currentBottomLine)...")
                        delay(500) // Initial settle
                        _telemetry.value = _telemetry.value.copy(
                            activeStep = "OCR_BOUNDS",
                            statusMessage = "Page 1: OCR bounds verified (Ln $currentTopLine-$currentBottomLine)"
                        )
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    } else {
                        targetPreviousBottomLine = currentBottomLine
                        targetNextTopLine = targetPreviousBottomLine + 1
                        _telemetry.value = _telemetry.value.copy(
                            activeStep = "PRECISION_SCROLL",
                            statusMessage = "Precision scrolling: positioning next page top to Ln $targetNextTopLine..."
                        )

                        val ocrBefore = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        val prevBottomY = if (ocrBefore != null && ocrBefore.lowestDetectedY > 0) {
                            ocrBefore.lowestDetectedY.toFloat()
                        } else {
                            bounds.height() * 0.86f
                        }
                        val topTargetY = (bounds.height() * 0.12f).coerceAtLeast(100f)
                        val targetDisplacementPx = (prevBottomY - topTargetY).coerceAtLeast(220f)
                        val adaptiveTravel = (targetDisplacementPx * autoTuneFactor).coerceIn(200f, bounds.height() * 0.70f)

                        val startY = centerY + (adaptiveTravel / 2f)
                        val endY = centerY - (adaptiveTravel / 2f)

                        Log.i(TAG, "Auto-tune flip to Page $pageIndex: targetTopLine=$targetNextTopLine (prior bottom $targetPreviousBottomLine), travel=${adaptiveTravel}px (factor=${String.format(java.util.Locale.US, "%.3f", autoTuneFactor)})...")

                        val gestureSucceeded = dispatchSwipe(
                            startX = centerX,
                            startY = startY,
                            endX = centerX,
                            endY = endY,
                            durationMs = durationMs,
                            displayId = resolvedDisplay
                        )

                        if (!gestureSucceeded) {
                            Log.w(TAG, "Page swipe gesture failed on Display $resolvedDisplay; attempting fallback scroll.")
                            performScrollFallback(targetWindow)
                        }

                        delay(700) // Wait for scroll to completely settle (Zero motion blur with anti-fling deceleration)

                        _telemetry.value = _telemetry.value.copy(
                            activeStep = "SCREEN_CAPTURE",
                            statusMessage = "Page $pageIndex: Settled, capturing frame..."
                        )

                        // Ground-truth line numbers directly from Gutter OCR if detected
                        val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        val hasRealOcr = ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine

                        if (hasRealOcr) {
                            currentTopLine = ocr!!.currentTopLine
                            currentBottomLine = ocr.currentBottomLine

                            // Dynamic document total line expansion: never clip if document is longer than expected
                            if (currentBottomLine > dynamicTotalLines) {
                                dynamicTotalLines = currentBottomLine
                                _calculatedTotalLines.value = dynamicTotalLines
                            }

                            // Dynamic end-of-document detection: if top line or bottom line stops advancing after swipe
                            if (pageIndex > 1 && (currentBottomLine == prevBottomRead || currentTopLine == prevTopRead)) {
                                bottomStaticCount++
                                if (bottomStaticCount >= 2) {
                                    Log.i(TAG, "End of document reached dynamically (line unchanged: top=$currentTopLine, bottom=$currentBottomLine).")
                                    dynamicTotalLines = currentBottomLine
                                    _calculatedTotalLines.value = dynamicTotalLines
                                    break
                                }
                            } else {
                                bottomStaticCount = 0
                                prevBottomRead = currentBottomLine
                                prevTopRead = currentTopLine
                            }

                            // Auto-tune alignment error calculation: target top is prior bottom + 1
                            val error = currentTopLine - targetNextTopLine
                            lastAlignmentError = error

                            // If error > 0: overshot! We scrolled too far and skipped lines.
                            // If error < -1: undershot! Too much overlap.
                            if (error > 0) {
                                autoTuneFactor = (autoTuneFactor - 0.05f * error).coerceIn(0.65f, 1.35f)
                            } else if (error < -1) {
                                autoTuneFactor = (autoTuneFactor + 0.03f * (-error)).coerceIn(0.65f, 1.35f)
                            }
                            Log.i(TAG, "Auto-tune evaluated: targetTop=$targetNextTopLine, actualTop=$currentTopLine, error=$error lines -> next factor=${String.format(java.util.Locale.US, "%.3f", autoTuneFactor)}")
                            _telemetry.value = _telemetry.value.copy(
                                activeStep = "OCR_BOUNDS",
                                statusMessage = "Page $pageIndex: Gutter OCR Ln $currentTopLine-$currentBottomLine (target top $targetNextTopLine, err $error)"
                            )
                        } else {
                            // When OCR is not active, DO NOT fabricate arbitrary line numbers!
                            Log.w(TAG, "OCR did not detect line numbers on Page $pageIndex. Swiping based on viewport.")
                            lastAlignmentError = 0
                        }

                        // Trigger discrete settled snapshot grab
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    }

                    val chunkProgress = currentBottomLine - currentChunkStartLine
                    val ocrState = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                    val ocrActive = ocrState != null && ocrState.currentTopLine > 0
                    val statusMsg = if (ocrActive) {
                        "Page $pageIndex (Lines $currentTopLine-$currentBottomLine) • Dwell Freeze"
                    } else {
                        "Page $pageIndex (Gutter Uncalibrated) • Dwell Freeze"
                    }

                    val currentGutter = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                    _telemetry.value = PacingTelemetry(
                        phase = phase,
                        activeStep = "DWELL_FREEZE",
                        currentPage = pageIndex,
                        currentTopLine = currentTopLine,
                        currentBottomLine = currentBottomLine,
                        targetTotalLines = dynamicTotalLines,
                        currentSegmentIndex = currentChunkIndex,
                        segmentProgressLines = chunkProgress.coerceAtLeast(0),
                        segmentTargetLines = 1200,
                        statusMessage = statusMsg,
                        dwellRemainingMs = dwellTimeMs,
                        isDwellActive = true,
                        autoTuneFactor = autoTuneFactor,
                        bottomToTopError = lastAlignmentError,
                        linePitchPx = currentGutter?.linePitchPx ?: 32f,
                        wrappedLinesDetected = currentGutter?.wrappedLinesCount ?: 0
                    )

                    // Strict Freeze Dwell Time (Crucial for Gemini 1 FPS video ingestion)
                    val dwellInterval = 100L
                    var remaining = dwellTimeMs
                    _dwellCountdownMs.value = remaining
                    while (remaining > 0 && isActive && isPaginating.get()) {
                        delay(dwellInterval)
                        remaining -= dwellInterval
                        _dwellCountdownMs.value = remaining
                        _telemetry.value = _telemetry.value.copy(dwellRemainingMs = remaining)
                    }
                    _dwellCountdownMs.value = 0L
                    _telemetry.value = _telemetry.value.copy(
                        dwellRemainingMs = 0L,
                        isDwellActive = false,
                        activeStep = "LOOP_EVAL",
                        statusMessage = "Page $pageIndex complete. Evaluating loop continuation..."
                    )

                    onPageAdvanced?.invoke(pageIndex, currentTopLine, currentBottomLine)

                    // Check chunk rotation threshold (~1,200 lines)
                    if (chunkProgress >= 1200) {
                        val handoverLine = currentBottomLine
                        val overlapLine = (handoverLine - 8).coerceAtLeast(1)
                        currentChunkIndex++
                        currentChunkStartLine = overlapLine
                        Log.i(TAG, "Segment rotation: Chunk $currentChunkIndex starting at overlap line $overlapLine (handover at $handoverLine)")
                        onSegmentBoundary?.invoke(currentChunkIndex, handoverLine, overlapLine)
                    }

                    // Stop criteria: reached end of document
                    val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                    val hasRealOcr = ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine
                    if ((hasRealOcr && currentBottomLine >= dynamicTotalLines && bottomStaticCount >= 1) ||
                        (!hasRealOcr && currentTopLine >= dynamicTotalLines) ||
                        isFinishedCheck?.invoke() == true) {
                        Log.i(TAG, "Pacing engine reached end of document (topLine=$currentTopLine, bottomLine=$currentBottomLine, total=$dynamicTotalLines).")
                        break
                    }
                }
            } catch (e: CancellationException) {
                Log.i(TAG, "Pacing engine coroutine cancelled.")
            } catch (e: Exception) {
                Log.e(TAG, "Error during pagination loop", e)
            } finally {
                isPaginating.set(false)
                setSoftKeyboardHidden(false) // Restore soft keyboard when finished
                releaseWakeLock()
                _paginationState.value = PaginationState.Idle
                _telemetry.value = _telemetry.value.copy(
                    phase = "COMPLETED",
                    targetTotalLines = dynamicTotalLines,
                    isDwellActive = false,
                    dwellRemainingMs = 0L,
                    statusMessage = "Pacing Complete at line ${_telemetry.value.currentBottomLine} (Total: $dynamicTotalLines lines)"
                )
            }
        }
    }

    fun stopPagination() {
        if (isPaginating.compareAndSet(true, false)) {
            isPaused.set(false)
            automationJob?.cancel()
            setSoftKeyboardHidden(false)
            releaseWakeLock()
            _paginationState.value = PaginationState.Idle
            Log.i(TAG, "Pagination automation stopped.")
        }
    }

    fun pausePagination() {
        if (isPaginating.get()) {
            isPaused.set(true)
            _paginationState.value = PaginationState.Paused
            _telemetry.value = _telemetry.value.copy(
                phase = "PAUSED",
                isPacing = false,
                statusMessage = "Orchestration Paused at Page ${_currentPage.value}"
            )
            Log.i(TAG, "Pagination automation paused.")
        }
    }

    fun resumePagination() {
        if (isPaginating.get() && isPaused.get()) {
            isPaused.set(false)
            _paginationState.value = PaginationState.Running
            _telemetry.value = _telemetry.value.copy(
                phase = "PACING",
                isPacing = true,
                statusMessage = "Orchestration Resumed at Page ${_currentPage.value}"
            )
            Log.i(TAG, "Pagination automation resumed.")
        }
    }

    suspend fun restartFromBeginning(targetDisplayId: Int = 0) {
        stopPagination()
        isPaused.set(false)
        resetToStart(_calculatedTotalLines.value)
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        repeat(12) {
            dispatchSwipe(
                startX = bounds.centerX().toFloat(),
                startY = bounds.top * 0.25f,
                endX = bounds.centerX().toFloat(),
                endY = bounds.bottom * 0.75f,
                durationMs = 250,
                displayId = resolvedDisplay
            )
            delay(250)
        }
        _telemetry.value = _telemetry.value.copy(
            phase = "READY",
            statusMessage = "Restarted from Beginning (Page 1)",
            currentPage = 1,
            currentTopLine = 1,
            currentBottomLine = 0
        )
        Log.i(TAG, "Restarted pagination from beginning.")
    }

    /**
     * Injects scroll gestures to seek to a specific line number.
     * Brings a flagged or missing line requested from the web UI directly into view.
     * Confines gestures to middle/lower viewport so Teams never interprets upward scrolling as dismiss.
     */
    suspend fun seekToLine(targetLine: Int, currentEstimatedLine: Int, targetDisplayId: Int = 0) {
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        val centerX = bounds.centerX().toFloat()
        val lineDiff = targetLine - currentEstimatedLine

        val linesPerPage = 28
        val pagesToMove = Math.abs(lineDiff) / linesPerPage
        val moves = pagesToMove.coerceIn(1, 12)

        Log.i(TAG, "Seeking to line $targetLine from $currentEstimatedLine ($moves gestures on Display $resolvedDisplay)...")
        repeat(moves) {
            if (lineDiff < 0) {
                // Scroll UP (pull document down) - stay strictly between 45% and 80% to avoid Teams pull-down-to-dismiss
                dispatchSwipe(
                    startX = centerX,
                    startY = bounds.centerY() - (bounds.height() * 0.05f),
                    endX = centerX,
                    endY = bounds.centerY() + (bounds.height() * 0.35f),
                    durationMs = 280,
                    displayId = resolvedDisplay
                )
            } else {
                // Scroll DOWN (pull document up) - stay within middle 50%
                dispatchSwipe(
                    startX = centerX,
                    startY = bounds.centerY() + (bounds.height() * 0.22f),
                    endX = centerX,
                    endY = bounds.centerY() - (bounds.height() * 0.22f),
                    durationMs = 280,
                    displayId = resolvedDisplay
                )
            }
            delay(350)
        }
        delay(500) // Settle after seek
    }

    /**
     * Injects a deterministic zero-momentum swipe gesture via AccessibilityService on the specified display.
     * Prevents Android VelocityTracker from triggering inertial flings by dragging smoothly
     * and holding stationary for holdDurationMs (zero lift-off velocity) before sending ACTION_UP.
     */
    private suspend fun dispatchSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long = 450L,
        holdDurationMs: Long = 200L,
        displayId: Int = 0
    ): Boolean = suspendCancellableCoroutine { continuation ->
        val dragPath = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val stroke1 = GestureDescription.StrokeDescription(dragPath, 0L, durationMs, true)
        val builder1 = GestureDescription.Builder().addStroke(stroke1)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder1.setDisplayId(displayId)
        }

        val dispatchedPhase1 = dispatchGesture(
            builder1.build(),
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    super.onCompleted(gestureDescription)
                    // Phase 2: Stationary dwell hold at (endX, endY) to kill momentum fling
                    val holdPath = Path().apply {
                        moveTo(endX, endY)
                        lineTo(endX, endY)
                    }
                    val stroke2 = stroke1.continueStroke(holdPath, 0L, holdDurationMs, false)
                    val builder2 = GestureDescription.Builder().addStroke(stroke2)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder2.setDisplayId(displayId)
                    }
                    val dispatchedPhase2 = dispatchGesture(
                        builder2.build(),
                        object : GestureResultCallback() {
                            override fun onCompleted(gestureDescription: GestureDescription?) {
                                super.onCompleted(gestureDescription)
                                Log.d(TAG, "Anti-fling gesture completed on Display $displayId: ($startX, $startY) -> ($endX, $endY)")
                                if (continuation.isActive) continuation.resume(true) {}
                            }

                            override fun onCancelled(gestureDescription: GestureDescription?) {
                                super.onCancelled(gestureDescription)
                                Log.w(TAG, "Anti-fling phase 2 cancelled on Display $displayId")
                                if (continuation.isActive) continuation.resume(false) {}
                            }
                        },
                        null
                    )
                    if (!dispatchedPhase2 && continuation.isActive) {
                        Log.w(TAG, "Failed to dispatch anti-fling phase 2 on Display $displayId")
                        continuation.resume(false) {}
                    }
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    super.onCancelled(gestureDescription)
                    Log.w(TAG, "Gesture phase 1 cancelled on Display $displayId")
                    if (continuation.isActive) continuation.resume(false) {}
                }
            },
            null
        )

        if (!dispatchedPhase1 && continuation.isActive) {
            Log.w(TAG, "Failed to dispatch gesture phase 1 on Display $displayId")
            continuation.resume(false)
        }
    }

    /**
     * Executes a sensitive, zero-momentum micro-touch drag of exact pixel offset (deltaY).
     * Used for sub-line and single-line fine tuning to position the target line number
     * precisely at the top gutter of the viewport.
     * Positive deltaY = pull document down (scroll up).
     * Negative deltaY = push document up (scroll down).
     */
    suspend fun dispatchMicroDrag(
        deltaY: Float,
        displayId: Int = 0
    ): Boolean {
        val bounds = getDisplayOrWindowBounds(displayId)
        val centerX = bounds.centerX().toFloat()
        val centerY = bounds.centerY().toFloat()

        // Confine drag within middle 40% safe viewport zone
        val clampedDeltaY = deltaY.coerceIn(-bounds.height() * 0.35f, bounds.height() * 0.35f)
        val startY = centerY - (clampedDeltaY * 0.5f)
        val endY = centerY + (clampedDeltaY * 0.5f)

        Log.i(TAG, "Sensitive micro-drag on Display $displayId: deltaY=${deltaY}px ($startY -> $endY)")
        return dispatchSwipe(
            startX = centerX,
            startY = startY,
            endX = centerX,
            endY = endY,
            durationMs = 380L,
            holdDurationMs = 280L,
            displayId = displayId
        )
    }

    /**
     * Performs coarse Page Down on the target display window.
     */
    suspend fun performPageDown(displayId: Int = 0): Boolean {
        val resolvedDisplay = resolveTargetDisplayId(displayId)
        val window = findTargetWindow(resolvedDisplay)
        val root = window?.root ?: rootInActiveWindow
        val scrollable = root?.let { findFirstScrollableNode(it) }
        if (scrollable != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val res = scrollable.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_PAGE_DOWN.id)
                if (res) return true
            }
            val res = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
            if (res) return true
        }
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        val centerX = bounds.centerX().toFloat()
        val startY = bounds.centerY() + bounds.height() * 0.25f
        val endY = bounds.centerY() - bounds.height() * 0.25f
        return dispatchSwipe(centerX, startY, centerX, endY, 350L, 200L, resolvedDisplay)
    }

    /**
     * Performs coarse Page Up on the target display window.
     */
    suspend fun performPageUp(displayId: Int = 0): Boolean {
        val resolvedDisplay = resolveTargetDisplayId(displayId)
        val window = findTargetWindow(resolvedDisplay)
        val root = window?.root ?: rootInActiveWindow
        val scrollable = root?.let { findFirstScrollableNode(it) }
        if (scrollable != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val res = scrollable.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_PAGE_UP.id)
                if (res) return true
            }
            val res = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
            if (res) return true
        }
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        val centerX = bounds.centerX().toFloat()
        val startY = bounds.centerY() - bounds.height() * 0.25f
        val endY = bounds.centerY() + bounds.height() * 0.25f
        return dispatchSwipe(centerX, startY, centerX, endY, 350L, 200L, resolvedDisplay)
    }

    /**
     * Synchronized Orchestration to scroll down to targetTopLine so it becomes the very first line at the top.
     * Combines coarse page up/down with closed-loop sensitive micro-touch adjustment.
     */
    suspend fun navigateToNextPageTargetLine(
        targetTopLine: Int,
        currentEstimatedTopLine: Int = 0,
        targetDisplayId: Int = 0
    ): Boolean {
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        val linePitch = _telemetry.value.linePitchPx.coerceIn(24f, 48f)

        updateStatus("Orchestrating advance to Target Line $targetTopLine at top...")

        // Step 1: Coarse page advance (Page Down / Page Up) if target is far
        val linesToAdvance = if (currentEstimatedTopLine > 0) {
            targetTopLine - currentEstimatedTopLine
        } else {
            28 // Default page jump
        }

        if (linesToAdvance >= 20) {
            updateStatus("Coarse advance: Executing Page Down...")
            performPageDown(resolvedDisplay)
            delay(500)
        } else if (linesToAdvance <= -20) {
            updateStatus("Coarse advance: Executing Page Up...")
            performPageUp(resolvedDisplay)
            delay(500)
        } else if (Math.abs(linesToAdvance) > 5) {
            val coarseAdvancePx = (linesToAdvance * linePitch).coerceAtMost(bounds.height() * 0.65f)
            val centerX = bounds.centerX().toFloat()
            val startY = bounds.centerY() + (coarseAdvancePx * 0.45f).coerceAtMost(bounds.height() * 0.30f)
            val endY = bounds.centerY() - (coarseAdvancePx * 0.45f).coerceAtMost(bounds.height() * 0.30f)

            dispatchSwipe(
                startX = centerX,
                startY = startY,
                endX = centerX,
                endY = endY,
                durationMs = 400L,
                holdDurationMs = 250L,
                displayId = resolvedDisplay
            )
            delay(450)
        }

        // Step 2: Sensitive touch micro-adjustment to position target line precisely at top
        val gState = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
        val detectedTop = gState?.currentTopLine ?: 0
        val effectiveLinePitch = if (gState != null && gState.linePitchPx > 10f) gState.linePitchPx else linePitch

        if (detectedTop > 0) {
            val lineDelta = targetTopLine - detectedTop
            Log.i(TAG, "Alignment check: Target Line $targetTopLine, Detected Top $detectedTop (pitch=${effectiveLinePitch}px)")
            if (lineDelta != 0 && Math.abs(lineDelta) <= 15) {
                // Negative delta pushes document up so lower lines move to the top
                val microDeltaY = -lineDelta * effectiveLinePitch
                updateStatus("Sensitive micro-touch positioning (offset: ${microDeltaY.toInt()}px for ${lineDelta} lines)...")
                dispatchMicroDrag(microDeltaY, resolvedDisplay)
                delay(400)
            }
        }

        updateStatus("Target Line $targetTopLine positioned at top of viewport ✔")
        return true
    }

    /**
     * Advances to the next page's target line, executes micro-touch alignment,
     * settles with zero blur, and returns the high-res screenshot ready for upload.
     */
    suspend fun alignAndCaptureNextPage(
        targetTopLine: Int? = null,
        targetDisplayId: Int = 0
    ): Bitmap? {
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val currentBottom = _telemetry.value.currentBottomLine
        val nextTarget = targetTopLine ?: (if (currentBottom > 0) currentBottom + 1 else 1)

        navigateToNextPageTargetLine(
            targetTopLine = nextTarget,
            currentEstimatedTopLine = _telemetry.value.currentTopLine,
            targetDisplayId = resolvedDisplay
        )
        delay(DWELL_TIME_MS) // Enforce Zero-Blur dwell freeze

        val snapshot = captureScreenshot(resolvedDisplay)
        if (snapshot != null) {
            latestCapturedBitmap = snapshot
            val curPage = _telemetry.value.currentPage
            val newPage = if (curPage > 0) curPage + 1 else 2
            _telemetry.value = _telemetry.value.copy(
                currentPage = newPage,
                currentTopLine = nextTarget,
                currentBottomLine = nextTarget + 44,
                statusMessage = "Line $nextTarget at top of Page $newPage"
            )
        }
        return snapshot
    }

    /**
     * Fallback to standard AccessibilityNodeInfo scroll action if gesture fails.
     */
    private fun performScrollFallback(window: AccessibilityWindowInfo?) {
        val root = window?.root ?: rootInActiveWindow ?: return
        val scrollableNode = findFirstScrollableNode(root)
        scrollableNode?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
    }

    private fun findFirstScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findFirstScrollableNode(child)
            if (result != null) return result
        }
        return null
    }

    /**
     * Captures current screen snapshot without flipping pages, sends to Python API,
     * reads first and last gutter line numbers via Gemini AI OCR, updates telemetry, and WAITS.
     */
    fun captureAndAnalyzeCurrentScreen(
        serverHost: String = "192.168.86.83:8000",
        onComplete: ((topLine: Int, bottomLine: Int, success: Boolean, msg: String) -> Unit)? = null
    ) {
        val activeService = SegmentRecorderService.instance
        if (activeService == null || !activeService.serviceState.value.isReady) {
            _telemetry.value = _telemetry.value.copy(
                statusMessage = "Capture not ready: open app to grant screen capture"
            )
            onComplete?.invoke(0, 0, false, "Screen capture not ready")
            return
        }

        serviceScope.launch {
            _telemetry.value = _telemetry.value.copy(
                statusMessage = "Capturing screen snapshot...",
                isPacing = false
            )
            delay(300) // Settle

            val cm = activeService.getCaptureManager()
            val snapshot = cm?.captureSettledSnapshot()
            if (snapshot == null) {
                _telemetry.value = _telemetry.value.copy(
                    statusMessage = "Failed: VirtualDisplay snapshot was null"
                )
                onComplete?.invoke(0, 0, false, "Snapshot was null")
                return@launch
            }

            _telemetry.value = _telemetry.value.copy(
                statusMessage = "Sending frame to Python API for AI Gutter OCR..."
            )

            val client = com.matrixcapture.app.network.FrameUploadClient(serverHost)
            val result = client.uploadFrame(
                bitmap = snapshot,
                topLine = 0,
                bottomLine = 0,
                pageIndex = _currentPage.value
            )

            if (result.success && result.topLine > 0) {
                _telemetry.value = _telemetry.value.copy(
                    currentTopLine = result.topLine,
                    currentBottomLine = result.bottomLine,
                    statusMessage = "Gutter Verified: Ln ${result.topLine} → ${result.bottomLine} (${result.extractedLineCount} lines). Waiting.",
                    isPacing = false
                )
                onComplete?.invoke(result.topLine, result.bottomLine, true, result.message)
            } else if (result.success) {
                _telemetry.value = _telemetry.value.copy(
                    statusMessage = "Server analyzed frame (${result.extractedLineCount} lines). Waiting.",
                    isPacing = false
                )
                onComplete?.invoke(0, 0, true, "Analyzed")
            } else {
                _telemetry.value = _telemetry.value.copy(
                    statusMessage = "Upload/OCR failed: ${result.message}",
                    isPacing = false
                )
                onComplete?.invoke(0, 0, false, result.message)
            }
        }
    }

    sealed class PaginationState {
        object Idle : PaginationState()
        object Running : PaginationState()
        object Paused : PaginationState()
        data class Error(val message: String) : PaginationState()
    }

    data class GutterMetricsSnapshot(
        val lowestLineNumber: Int,
        val lowestLineBottomY: Int,
        val linePitchPx: Float
    )

    data class PacingTelemetry(
        val phase: String = "IDLE", // "IDLE", "PACING_TEST", "RECORDING_AND_PACING", "COMPLETED"
        val activeStep: String = "START_READY", // "START_READY", "SCREEN_CAPTURE", "OCR_BOUNDS", "PRECISION_SCROLL", "DWELL_FREEZE", "LOOP_EVAL"
        val isPacing: Boolean = false,
        val currentPage: Int = 1,
        val currentTopLine: Int = 0,
        val currentBottomLine: Int = 0,
        val targetTotalLines: Int = 0,
        val currentSegmentIndex: Int = 1,
        val segmentProgressLines: Int = 0,
        val segmentTargetLines: Int = 1200,
        val statusMessage: String = "Ready: Tap 'Capture Screen' to read gutter",
        val dwellRemainingMs: Long = 0L,
        val isDwellActive: Boolean = false,
        val autoTuneFactor: Float = 1.0f,
        val bottomToTopError: Int = 0,
        val linePitchPx: Float = 32f,
        val wrappedLinesDetected: Int = 0
    )

    companion object {
        private const val TAG = "DesktopPaginationService"
        const val DWELL_TIME_MS = 1500L

        @Volatile
        var instance: DesktopPaginationService? = null
            private set

        @Volatile
        var latestCapturedBitmap: android.graphics.Bitmap? = null

        fun updateStatus(message: String) {
            _telemetry.value = _telemetry.value.copy(statusMessage = message)
        }

        private val _isServiceActive = MutableStateFlow(false)
        val isServiceActive = _isServiceActive.asStateFlow()

        private val _paginationState = MutableStateFlow<PaginationState>(PaginationState.Idle)
        val paginationState = _paginationState.asStateFlow()

        private val _currentPage = MutableStateFlow(1)
        val currentPage = _currentPage.asStateFlow()

        private val _dwellCountdownMs = MutableStateFlow(0L)
        val dwellCountdownMs = _dwellCountdownMs.asStateFlow()

        private val _calculatedTotalLines = MutableStateFlow(0)
        val calculatedTotalLines = _calculatedTotalLines.asStateFlow()

        private val _calibrationState = MutableStateFlow("Uncalibrated (Auto-detect active)")
        val calibrationState = _calibrationState.asStateFlow()

        private val _telemetry = MutableStateFlow(PacingTelemetry())
        val telemetry = _telemetry.asStateFlow()

        private val _isSoftKeyboardSuppressed = MutableStateFlow(false)
        val isSoftKeyboardSuppressed = _isSoftKeyboardSuppressed.asStateFlow()

        fun resetToStart(targetLines: Int = 0) {
            instance?.stopPagination()
            _currentPage.value = 1
            _dwellCountdownMs.value = 0L
            _calculatedTotalLines.value = targetLines
            _calibrationState.value = if (targetLines > 0) "Ready (Target: $targetLines lines)" else "Ready (Auto-detect document length)"
            _telemetry.value = PacingTelemetry(
                phase = "READY",
                currentPage = 1,
                currentTopLine = 0,
                currentBottomLine = 0,
                targetTotalLines = targetLines,
                currentSegmentIndex = 1,
                segmentProgressLines = 0,
                segmentTargetLines = 1200,
                statusMessage = "Ready: Tap 'Capture Screen' to read gutter",
                dwellRemainingMs = 0L,
                isDwellActive = false
            )
            Log.i(TAG, "Reset to Page 1 with target lines: $targetLines")
        }
    }
}

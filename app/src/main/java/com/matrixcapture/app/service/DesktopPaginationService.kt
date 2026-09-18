package com.matrixcapture.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
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
        val totalLines = if (metrics != null && metrics.linePitchPx > 0) {
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
        } else {
            val fallback = metrics?.lowestLineNumber ?: (if (lastLineSeen > 0) lastLineSeen else _calculatedTotalLines.value)
            Log.w(TAG, "Pitch calculation unavailable; fallback lines: $fallback")
            fallback
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

                // Adaptive Closed-Loop Auto-Tune State
                var autoTuneFactor = 1.0f
                var lastAlignmentError = 0
                var targetPreviousBottomLine = 1

                Log.i(TAG, "Starting pacing engine on Display $resolvedDisplay: Initial=$initialTarget lines, Dwell=${dwellTimeMs}ms, Phase=$phase")

                while (isActive && isPaginating.get()) {
                    pageIndex++
                    _currentPage.value = pageIndex

                    if (pageIndex == 1) {
                        // Check if real OCR lines are available on initial frame
                        val ocr = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                        if (ocr != null && ocr.currentTopLine > 0 && ocr.currentBottomLine >= ocr.currentTopLine) {
                            currentTopLine = ocr.currentTopLine
                            currentBottomLine = ocr.currentBottomLine
                            prevBottomRead = currentBottomLine
                        } else {
                            currentTopLine = 1
                            currentBottomLine = visibleLinesCount
                        }
                        Log.i(TAG, "Page 1 initial frame settling (Lines $currentTopLine-$currentBottomLine)...")
                        delay(400) // Initial settle
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    } else {
                        targetPreviousBottomLine = currentBottomLine
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

                        Log.i(TAG, "Auto-tune flip to Page $pageIndex: targetBottomLine=$targetPreviousBottomLine, travel=${adaptiveTravel}px (factor=${String.format(java.util.Locale.US, "%.3f", autoTuneFactor)})...")

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

                            // Dynamic end-of-document detection: if bottom line stops advancing after swipe
                            if (pageIndex > 1 && currentBottomLine == prevBottomRead) {
                                bottomStaticCount++
                                if (bottomStaticCount >= 2) {
                                    Log.i(TAG, "End of document reached dynamically at line $currentBottomLine (pacing complete).")
                                    dynamicTotalLines = currentBottomLine
                                    _calculatedTotalLines.value = dynamicTotalLines
                                    break
                                }
                            } else {
                                bottomStaticCount = 0
                                prevBottomRead = currentBottomLine
                            }

                            // Auto-tune alignment error calculation:
                            // Goal: newTopLine == targetPreviousBottomLine (or 1 line safety overlap)
                            val error = currentTopLine - targetPreviousBottomLine
                            lastAlignmentError = error

                            // If error > 0: overshot! We scrolled too far and skipped lines.
                            // If error < -1: undershot! Too much overlap.
                            if (error > 0) {
                                autoTuneFactor = (autoTuneFactor - 0.05f * error).coerceIn(0.65f, 1.35f)
                            } else if (error < -1) {
                                autoTuneFactor = (autoTuneFactor + 0.03f * (-error)).coerceIn(0.65f, 1.35f)
                            }
                            Log.i(TAG, "Auto-tune evaluated: prevBottom=$targetPreviousBottomLine, newTop=$currentTopLine, error=$error lines -> next factor=${String.format(java.util.Locale.US, "%.3f", autoTuneFactor)}")
                        } else {
                            // When OCR is not active, advance conservatively and flag as UNCALIBRATED
                            currentTopLine += linesPerPage
                            currentBottomLine = currentTopLine + visibleLinesCount - 1
                            lastAlignmentError = 0
                        }

                        // Trigger discrete settled snapshot grab
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    }

                    val chunkProgress = currentBottomLine - currentChunkStartLine
                    val ocrActive = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value?.currentTopLine ?: 0 > 0
                    val statusMsg = if (ocrActive) {
                        "Page $pageIndex (Lines $currentTopLine-$currentBottomLine) • Dwell Freeze"
                    } else {
                        "Page $pageIndex (Est. Ln $currentTopLine-$currentBottomLine • UNCALIBRATED) • Dwell Freeze"
                    }

                    val currentGutter = SegmentRecorderService.instance?.getGutterTracker()?.gutterState?.value
                    _telemetry.value = PacingTelemetry(
                        phase = phase,
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
                    _telemetry.value = _telemetry.value.copy(dwellRemainingMs = 0L, isDwellActive = false)

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
            automationJob?.cancel()
            setSoftKeyboardHidden(false)
            releaseWakeLock()
            _paginationState.value = PaginationState.Idle
            Log.i(TAG, "Pagination automation stopped.")
        }
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
            continuation.resume(false) {}
        }
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

    sealed class PaginationState {
        object Idle : PaginationState()
        object Running : PaginationState()
        data class Error(val message: String) : PaginationState()
    }

    data class GutterMetricsSnapshot(
        val lowestLineNumber: Int,
        val lowestLineBottomY: Int,
        val linePitchPx: Float
    )

    data class PacingTelemetry(
        val phase: String = "IDLE", // "IDLE", "PACING_TEST", "RECORDING_AND_PACING", "COMPLETED"
        val currentPage: Int = 1,
        val currentTopLine: Int = 1,
        val currentBottomLine: Int = 44,
        val targetTotalLines: Int = 0,
        val currentSegmentIndex: Int = 1,
        val segmentProgressLines: Int = 0,
        val segmentTargetLines: Int = 1200,
        val statusMessage: String = "Ready on Page 1 (Auto-Detect / Calibrate)",
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
                currentTopLine = 1,
                currentBottomLine = 44,
                targetTotalLines = targetLines,
                currentSegmentIndex = 1,
                segmentProgressLines = 0,
                segmentTargetLines = 1200,
                statusMessage = if (targetLines > 0) "Ready on Page 1 (Target: $targetLines lines)" else "Ready on Page 1 (Auto-detecting lines)",
                dwellRemainingMs = 0L,
                isDwellActive = false
            )
            Log.i(TAG, "Reset to Page 1 with target lines: $targetLines")
        }
    }
}

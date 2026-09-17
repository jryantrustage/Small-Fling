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
        Log.i(TAG, "DesktopPaginationService connected and ready for external display automation.")
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

        // Rapid fling down (upward swipes) to reach end of document
        repeat(12) {
            dispatchSwipe(
                startX = bounds.centerX().toFloat(),
                startY = bounds.bottom * 0.80f,
                endX = bounds.centerX().toFloat(),
                endY = bounds.top * 0.20f,
                durationMs = 120,
                displayId = resolvedDisplay
            )
            delay(180)
        }

        // Allow UI to settle
        delay(600)

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
            val fallback = metrics?.lowestLineNumber ?: 9487 // Matches user document header fallback
            Log.w(TAG, "Pitch calculation unavailable; fallback estimated lines: $fallback")
            fallback
        }

        _calibrationState.value = "Calibrating: Resetting to line 1..."

        // Rapid fling back to top (downward swipes)
        repeat(15) {
            dispatchSwipe(
                startX = bounds.centerX().toFloat(),
                startY = bounds.top * 0.25f,
                endX = bounds.centerX().toFloat(),
                endY = bounds.bottom * 0.85f,
                durationMs = 120,
                displayId = resolvedDisplay
            )
            delay(180)
        }

        // Settle at top of document
        delay(800)
        _calibrationState.value = "Calibration Complete: $totalLines lines"
        _calculatedTotalLines.value = totalLines
        totalLines
    }

    /**
     * Starts the automated pacing engine.
     * Enforces a strict freeze-per-page dwell time (default 1,500ms) for Gemini 1 FPS ingestion,
     * tracks exact line ranges (38 lines/page advance with 8-line overlap), and signals
     * segment rotations at ~1,200 line increments.
     */
    fun startPacingEngine(
        targetDisplayId: Int = 0,
        totalLines: Int = 9487,
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
        _calculatedTotalLines.value = totalLines
        acquireWakeLock()

        automationJob = serviceScope.launch {
            try {
                _paginationState.value = PaginationState.Running
                val targetWindow = findTargetWindow(resolvedDisplay)
                val bounds = getDisplayOrWindowBounds(resolvedDisplay)

                val startY = bounds.bottom * 0.82f
                val endY = bounds.top + (bounds.height() * 0.12f)
                val centerX = bounds.centerX().toFloat()

                val linesPerPage = 38
                val visibleLinesCount = 46
                var pageIndex = 0
                var currentTopLine = 1
                var currentChunkIndex = 1
                var currentChunkStartLine = 1

                Log.i(TAG, "Starting pacing engine on Display $resolvedDisplay: Total=$totalLines lines, Dwell=${dwellTimeMs}ms, Phase=$phase")

                while (isActive && isPaginating.get()) {
                    pageIndex++
                    _currentPage.value = pageIndex

                    val currentBottomLine: Int
                    if (pageIndex == 1) {
                        currentTopLine = 1
                        currentBottomLine = visibleLinesCount
                        Log.i(TAG, "Page 1 initial frame settling (Lines 1-$visibleLinesCount)...")
                        delay(400) // Initial settle
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    } else {
                        // Advance page via swipe
                        Log.i(TAG, "Swiping to Page $pageIndex on Display $resolvedDisplay...")
                        val gestureSucceeded = dispatchSwipe(
                            startX = centerX,
                            startY = startY,
                            endX = centerX,
                            endY = endY,
                            durationMs = 280,
                            displayId = resolvedDisplay
                        )

                        if (!gestureSucceeded) {
                            Log.w(TAG, "Page swipe gesture failed on Display $resolvedDisplay; attempting fallback scroll.")
                            performScrollFallback(targetWindow)
                        }

                        delay(450) // Wait for inertial scroll to completely stop (Zero motion blur)
                        currentTopLine += linesPerPage
                        currentBottomLine = currentTopLine + visibleLinesCount - 1

                        // Trigger discrete settled snapshot grab
                        onFrameCaptureNeeded?.invoke(pageIndex, currentTopLine, currentBottomLine)
                    }

                    val chunkProgress = currentBottomLine - currentChunkStartLine
                    val statusMsg = "Page $pageIndex (Lines $currentTopLine-$currentBottomLine) • Dwell Freeze"

                    _telemetry.value = PacingTelemetry(
                        phase = phase,
                        currentPage = pageIndex,
                        currentTopLine = currentTopLine,
                        currentBottomLine = currentBottomLine,
                        targetTotalLines = totalLines,
                        currentSegmentIndex = currentChunkIndex,
                        segmentProgressLines = chunkProgress.coerceAtLeast(0),
                        segmentTargetLines = 1200,
                        statusMessage = statusMsg,
                        dwellRemainingMs = dwellTimeMs,
                        isDwellActive = true
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
                    if (currentTopLine >= totalLines || isFinishedCheck?.invoke() == true) {
                        Log.i(TAG, "Pacing engine reached end of document (topLine=$currentTopLine, total=$totalLines).")
                        break
                    }
                }
            } catch (e: CancellationException) {
                Log.i(TAG, "Pacing engine coroutine cancelled.")
            } catch (e: Exception) {
                Log.e(TAG, "Error during pagination loop", e)
            } finally {
                isPaginating.set(false)
                releaseWakeLock()
                _paginationState.value = PaginationState.Idle
                _telemetry.value = _telemetry.value.copy(
                    phase = "COMPLETED",
                    isDwellActive = false,
                    dwellRemainingMs = 0L,
                    statusMessage = "Pacing Complete at line ${_telemetry.value.currentTopLine}"
                )
            }
        }
    }

    fun stopPagination() {
        if (isPaginating.compareAndSet(true, false)) {
            automationJob?.cancel()
            releaseWakeLock()
            _paginationState.value = PaginationState.Idle
            Log.i(TAG, "Pagination automation stopped.")
        }
    }

    /**
     * Injects scroll gestures to seek to a specific line number.
     * Brings a flagged or missing line requested from the web UI directly into view.
     */
    suspend fun seekToLine(targetLine: Int, currentEstimatedLine: Int, targetDisplayId: Int = 0) {
        val resolvedDisplay = resolveTargetDisplayId(targetDisplayId)
        val bounds = getDisplayOrWindowBounds(resolvedDisplay)
        val centerX = bounds.centerX().toFloat()
        val lineDiff = targetLine - currentEstimatedLine

        val linesPerPage = 38
        val pagesToMove = Math.abs(lineDiff) / linesPerPage
        val moves = pagesToMove.coerceIn(1, 12)

        Log.i(TAG, "Seeking to line $targetLine from $currentEstimatedLine ($moves gestures on Display $resolvedDisplay)...")
        repeat(moves) {
            if (lineDiff < 0) {
                // Scroll UP (pull document down)
                dispatchSwipe(
                    startX = centerX,
                    startY = bounds.top + (bounds.height() * 0.20f),
                    endX = centerX,
                    endY = bounds.bottom * 0.80f,
                    durationMs = 250,
                    displayId = resolvedDisplay
                )
            } else {
                // Scroll DOWN (pull document up)
                dispatchSwipe(
                    startX = centerX,
                    startY = bounds.bottom * 0.80f,
                    endX = centerX,
                    endY = bounds.top + (bounds.height() * 0.20f),
                    durationMs = 250,
                    displayId = resolvedDisplay
                )
            }
            delay(350)
        }
        delay(500) // Settle after seek
    }

    /**
     * Injects a smooth swipe gesture via AccessibilityService on the specified display.
     */
    private suspend fun dispatchSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long,
        displayId: Int = 0
    ): Boolean = suspendCancellableCoroutine { continuation ->
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val builder = GestureDescription.Builder().addStroke(stroke)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setDisplayId(displayId)
        }
        val gesture = builder.build()

        val dispatched = dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    super.onCompleted(gestureDescription)
                    Log.d(TAG, "Gesture completed on Display $displayId: ($startX, $startY) -> ($endX, $endY)")
                    if (continuation.isActive) continuation.resume(true) {}
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    super.onCancelled(gestureDescription)
                    Log.w(TAG, "Gesture cancelled on Display $displayId")
                    if (continuation.isActive) continuation.resume(false) {}
                }
            },
            null
        )

        if (!dispatched && continuation.isActive) {
            Log.w(TAG, "Failed to dispatch gesture on Display $displayId")
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
        val currentPage: Int = 0,
        val currentTopLine: Int = 1,
        val currentBottomLine: Int = 46,
        val targetTotalLines: Int = 9487,
        val currentSegmentIndex: Int = 1,
        val segmentProgressLines: Int = 0,
        val segmentTargetLines: Int = 1200,
        val statusMessage: String = "Ready",
        val dwellRemainingMs: Long = 0L,
        val isDwellActive: Boolean = false
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

        private val _currentPage = MutableStateFlow(0)
        val currentPage = _currentPage.asStateFlow()

        private val _dwellCountdownMs = MutableStateFlow(0L)
        val dwellCountdownMs = _dwellCountdownMs.asStateFlow()

        private val _calculatedTotalLines = MutableStateFlow(9487)
        val calculatedTotalLines = _calculatedTotalLines.asStateFlow()

        private val _calibrationState = MutableStateFlow("Direct Pacing (Total: 9,487 lines)")
        val calibrationState = _calibrationState.asStateFlow()

        private val _telemetry = MutableStateFlow(PacingTelemetry())
        val telemetry = _telemetry.asStateFlow()
    }
}

package com.matrixcapture.app.capture

import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.matrixcapture.app.service.DesktopPaginationService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Real-Time Gutter Tracker using Google ML Kit.
 *
 * Receives settled 1080p bitmaps directly from DisplayCaptureManager,
 * crops the left gutter margin (15%), extracts sequential line numbers,
 * and measures vertical line pitch for pacing alignment.
 */
class GutterOcrTracker(
    private val scope: CoroutineScope
) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val isProcessingFrame = AtomicBoolean(false)

    private val _gutterState = MutableStateFlow(GutterState())
    val gutterState = _gutterState.asStateFlow()

    private var frameCounter = 0
    var isPaused = false

    /**
     * Called by DisplayCaptureManager whenever a new frame is rendered.
     */
    fun onFrameCaptured(bitmap: Bitmap) {
        if (isPaused || bitmap.isRecycled) return

        frameCounter++
        // Process every 3rd frame to avoid saturating ML Kit during rapid scroll
        if (frameCounter % 3 != 0 || isProcessingFrame.get()) {
            return
        }

        if (isProcessingFrame.compareAndSet(false, true)) {
            scope.launch(Dispatchers.Default) {
                try {
                    processGutterBitmap(bitmap)
                } catch (e: Exception) {
                    Log.e(TAG, "Error during gutter OCR processing", e)
                } finally {
                    isProcessingFrame.set(false)
                }
            }
        }
    }

    private fun processGutterBitmap(fullFrame: Bitmap) {
        val width = fullFrame.width
        val height = fullFrame.height
        // Safe 15% crop covering gutter line numbers even with display scaling
        val gutterWidth = (width * GUTTER_WIDTH_RATIO).toInt().coerceIn(120, width / 2)

        val croppedGutter = try {
            Bitmap.createBitmap(fullFrame, 0, 0, gutterWidth, height)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to crop gutter from full frame", e)
            return
        }

        val inputImage = InputImage.fromBitmap(croppedGutter, 0)
        recognizer.process(inputImage)
            .addOnSuccessListener { visionText ->
                parseGutterLines(visionText, height)
                croppedGutter.recycle()
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "ML Kit OCR failed", e)
                croppedGutter.recycle()
            }
    }

    /**
     * Parses recognized numbers in vertical order, updates line bounds,
     * computes line height pitch, and detects wrapped lines.
     */
    private fun parseGutterLines(visionText: Text, viewportHeight: Int) {
        val detectedNumbers = mutableListOf<DetectedGutterLine>()
        val topToolbarThreshold = (viewportHeight * 0.05f).toInt()
        val bottomStatusBarThreshold = (viewportHeight * 0.95f).toInt()

        for (block in visionText.textBlocks) {
            for (line in block.lines) {
                val cleanedText = line.text.trim().filter { it.isDigit() }
                val lineNumber = cleanedText.toIntOrNull()
                val box = line.boundingBox
                if (lineNumber != null && lineNumber > 0 && box != null) {
                    // Ignore toolbar elements at the very top and status bar at bottom
                    if (box.top < topToolbarThreshold || box.bottom > bottomStatusBarThreshold) {
                        continue
                    }
                    detectedNumbers.add(
                        DetectedGutterLine(
                            lineNumber = lineNumber,
                            centerY = box.centerY(),
                            topY = box.top,
                            bottomY = box.bottom
                        )
                    )
                }
            }
        }

        if (detectedNumbers.isEmpty()) return

        // Sort vertically by top coordinate
        detectedNumbers.sortBy { it.topY }

        val topLineItem = detectedNumbers.first()
        val topLine = topLineItem.lineNumber
        val bottomItem = detectedNumbers.last()
        val bottomLine = bottomItem.lineNumber

        // Calculate average pitch (pixels per line)
        var totalPitch = 0f
        var pitchSampleCount = 0
        for (i in 0 until detectedNumbers.size - 1) {
            val curr = detectedNumbers[i]
            val next = detectedNumbers[i + 1]
            val lineDelta = next.lineNumber - curr.lineNumber
            val pyDelta = next.centerY - curr.centerY
            if (lineDelta in 1..5 && pyDelta > 0) {
                totalPitch += (pyDelta.toFloat() / lineDelta)
                pitchSampleCount++
            }
        }
        val avgPitch = if (pitchSampleCount > 0) totalPitch / pitchSampleCount else 32.0f

        // Detect wrapped line edge cases
        var wrappedCount = 0
        for (i in 0 until detectedNumbers.size - 1) {
            val curr = detectedNumbers[i]
            val next = detectedNumbers[i + 1]
            if (next.lineNumber == curr.lineNumber + 1) {
                val pyDelta = next.centerY - curr.centerY
                val visualRows = Math.round(pyDelta / avgPitch).toInt()
                if (visualRows > 1) {
                    curr.isWrapped = true
                    curr.wrappedVisualLines = visualRows
                    wrappedCount++
                }
            }
        }

        _gutterState.value = GutterState(
            currentTopLine = topLine,
            currentBottomLine = bottomLine,
            highestDetectedY = topLineItem.topY,
            lowestDetectedY = bottomItem.bottomY,
            linePitchPx = avgPitch,
            viewportHeight = viewportHeight,
            wrappedLinesCount = wrappedCount
        )
    }

    /**
     * Provides an instantaneous snapshot of current gutter metrics for calibration.
     */
    fun getCalibrationSnapshot(): DesktopPaginationService.GutterMetricsSnapshot? {
        val state = _gutterState.value
        return if (state.currentBottomLine > 0) {
            DesktopPaginationService.GutterMetricsSnapshot(
                lowestLineNumber = state.currentBottomLine,
                lowestLineBottomY = state.lowestDetectedY,
                linePitchPx = state.linePitchPx
            )
        } else {
            null
        }
    }

    fun reset() {
        frameCounter = 0
        _gutterState.value = GutterState()
    }

    fun close() {
        recognizer.close()
    }

    data class DetectedGutterLine(
        val lineNumber: Int,
        val centerY: Int,
        val topY: Int,
        val bottomY: Int,
        var isWrapped: Boolean = false,
        var wrappedVisualLines: Int = 1
    )

    data class GutterState(
        val currentTopLine: Int = 0,
        val currentBottomLine: Int = 0,
        val highestDetectedY: Int = 0,
        val lowestDetectedY: Int = 0,
        val linePitchPx: Float = 32f,
        val viewportHeight: Int = 1080,
        val wrappedLinesCount: Int = 0
    )

    companion object {
        private const val TAG = "GutterOcrTracker"
        const val GUTTER_WIDTH_RATIO = 0.15f // Crop the left 15% margin
    }
}

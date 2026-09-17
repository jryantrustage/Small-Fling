package com.matrixcapture.app.capture

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.Rect
import android.media.Image
import android.media.ImageReader
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.matrixcapture.app.service.DesktopPaginationService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Module C: Real-Time Gutter Tracker using Google ML Kit.
 *
 * Receives frames from VirtualDisplay via ImageReader, crops the left 10% (gutter),
 * extracts sequential line numbers, measures vertical line pitch, and signals
 * 1,200-line video chunking thresholds with overlap handover.
 */
class GutterOcrTracker(
    private val scope: CoroutineScope,
    private val onSegmentThresholdReached: (handoverLine: Int, overlapLine: Int) -> Unit
) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val isProcessingFrame = AtomicBoolean(false)

    private val _gutterState = MutableStateFlow(GutterState())
    val gutterState = _gutterState.asStateFlow()

    private var segmentStartLine = 1
    private var lastRecordedBottomLine = 1
    private var frameCounter = 0

    var isPaused = false

    /**
     * Connects to an ImageReader configured for RGBA_8888 or YUV.
     */
    fun createFrameListener(): ImageReader.OnImageAvailableListener {
        return ImageReader.OnImageAvailableListener { reader ->
            val image = try {
                reader.acquireLatestImage()
            } catch (e: Exception) {
                null
            } ?: return@OnImageAvailableListener

            frameCounter++
            // Sample during dwell time or every 4th frame (sufficient for gutter tracking at 30fps)
            if (isPaused || frameCounter % 3 != 0 || isProcessingFrame.get()) {
                image.close()
                return@OnImageAvailableListener
            }

            if (isProcessingFrame.compareAndSet(false, true)) {
                scope.launch(Dispatchers.Default) {
                    try {
                        processGutterFrame(image)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error during OCR processing", e)
                    } finally {
                        image.close()
                        isProcessingFrame.set(false)
                    }
                }
            } else {
                image.close()
            }
        }
    }

    /**
     * Extracts and crops the left 10% line gutter, then performs ML Kit text recognition.
     */
    private suspend fun processGutterFrame(image: Image) = withContext(Dispatchers.Default) {
        val width = image.width
        val height = image.height
        val gutterWidth = (width * GUTTER_WIDTH_RATIO).toInt().coerceAtLeast(60)

        // Convert planes to bitmap crop (RGBA_8888 format from VirtualDisplay ImageReader)
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * width

        val bitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)

        // Crop specifically the left gutter region
        val croppedGutter = Bitmap.createBitmap(bitmap, 0, 0, gutterWidth, height)
        bitmap.recycle()

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
     * computes line height pitch, and checks the 1,200-line segment boundary.
     */
    private fun parseGutterLines(visionText: Text, viewportHeight: Int) {
        val detectedNumbers = mutableListOf<DetectedGutterLine>()

        for (block in visionText.textBlocks) {
            for (line in block.lines) {
                val cleanedText = line.text.trim().filter { it.isDigit() }
                val lineNumber = cleanedText.toIntOrNull()
                val box = line.boundingBox
                if (lineNumber != null && lineNumber > 0 && box != null) {
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

        val topLine = detectedNumbers.first().lineNumber
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

        lastRecordedBottomLine = maxOf(lastRecordedBottomLine, bottomLine)
        val linesInSegment = lastRecordedBottomLine - segmentStartLine + 1

        _gutterState.value = GutterState(
            currentTopLine = topLine,
            currentBottomLine = bottomLine,
            lowestDetectedY = bottomItem.bottomY,
            linePitchPx = avgPitch,
            segmentStartLine = segmentStartLine,
            cumulativeSegmentLines = linesInSegment,
            viewportHeight = viewportHeight
        )

        // 1,200-Line Segmentation Trigger:
        // When span approaches 1,200 lines, trigger rotation with 5-10 lines overlap
        if (linesInSegment >= SEGMENT_TARGET_LINES) {
            val handoverLine = lastRecordedBottomLine
            val overlapStartLine = (handoverLine - OVERLAP_LINES).coerceAtLeast(1)

            Log.i(
                TAG,
                "Triggering segment rotation at line $handoverLine (Segment span: $linesInSegment lines). " +
                        "Next segment starts with overlap at line $overlapStartLine."
            )

            // Update bounds for next segment
            segmentStartLine = overlapStartLine
            onSegmentThresholdReached(handoverLine, overlapStartLine)
        }
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
        segmentStartLine = 1
        lastRecordedBottomLine = 1
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
        val bottomY: Int
    )

    data class GutterState(
        val currentTopLine: Int = 1,
        val currentBottomLine: Int = 1,
        val lowestDetectedY: Int = 0,
        val linePitchPx: Float = 32f,
        val segmentStartLine: Int = 1,
        val cumulativeSegmentLines: Int = 0,
        val viewportHeight: Int = 1080
    )

    companion object {
        private const val TAG = "GutterOcrTracker"
        const val GUTTER_WIDTH_RATIO = 0.10f // Crop the left 10% margin
        const val SEGMENT_TARGET_LINES = 1200 // Max lines per chunk
        const val OVERLAP_LINES = 8 // 5–10 lines overlap to prevent boundary loss
    }
}

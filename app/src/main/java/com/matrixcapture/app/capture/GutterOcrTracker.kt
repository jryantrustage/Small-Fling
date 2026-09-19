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

class GutterOcrTracker(private val scope: CoroutineScope) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val isProcessingFrame = AtomicBoolean(false)
    private val _gutterState = MutableStateFlow(GutterState())
    val gutterState = _gutterState.asStateFlow()
    private var frameCounter = 0
    var isPaused = false

    fun onFrameCaptured(bitmap: Bitmap) {
        if (isPaused || bitmap.isRecycled || ++frameCounter % 3 != 0 || isProcessingFrame.get()) return
        if (isProcessingFrame.compareAndSet(false, true)) {
            scope.launch(Dispatchers.Default) {
                try { processGutterBitmap(bitmap) }
                catch (e: Exception) { Log.e(TAG, "Error in gutter OCR", e) }
                finally { isProcessingFrame.set(false) }
            }
        }
    }

    private fun processGutterBitmap(fullFrame: Bitmap) {
        val w = fullFrame.width; val h = fullFrame.height
        val gw = (w * 0.15f).toInt().coerceIn(120, w / 2)
        val cropped = try { Bitmap.createBitmap(fullFrame, 0, 0, gw, h) } catch (e: Exception) { return }
        recognizer.process(InputImage.fromBitmap(cropped, 0))
            .addOnSuccessListener { parseGutterLines(it, h); cropped.recycle() }
            .addOnFailureListener { cropped.recycle() }
    }

    private fun parseGutterLines(visionText: Text, viewportHeight: Int) {
        val detected = mutableListOf<DetectedGutterLine>()
        val topThresh = (viewportHeight * 0.05f).toInt(); val botThresh = (viewportHeight * 0.95f).toInt()
        for (b in visionText.textBlocks) {
            for (line in b.lines) {
                val num = line.text.trim().filter { it.isDigit() }.toIntOrNull()
                val box = line.boundingBox
                if (num != null && num > 0 && box != null && box.top >= topThresh && box.bottom <= botThresh) {
                    detected.add(DetectedGutterLine(num, box.centerY(), box.top, box.bottom))
                }
            }
        }
        if (detected.isEmpty()) return
        detected.sortBy { it.topY }

        var totalPitch = 0f; var pitchSamples = 0
        for (i in 0 until detected.size - 1) {
            val dL = detected[i + 1].lineNumber - detected[i].lineNumber
            val dY = detected[i + 1].centerY - detected[i].centerY
            if (dL in 1..5 && dY > 0) { totalPitch += dY.toFloat() / dL; pitchSamples++ }
        }
        val avgPitch = if (pitchSamples > 0) totalPitch / pitchSamples else 32f

        var wrapped = 0
        for (i in 0 until detected.size - 1) {
            if (detected[i + 1].lineNumber == detected[i].lineNumber + 1) {
                val rows = Math.round((detected[i + 1].centerY - detected[i].centerY) / avgPitch).toInt()
                if (rows > 1) { detected[i].isWrapped = true; detected[i].wrappedVisualLines = rows; wrapped++ }
            }
        }

        _gutterState.value = GutterState(detected.first().lineNumber, detected.last().lineNumber, detected.first().topY, detected.last().bottomY, avgPitch, viewportHeight, wrapped)
    }

    fun getCalibrationSnapshot(): DesktopPaginationService.GutterMetricsSnapshot? {
        val s = _gutterState.value
        return if (s.currentBottomLine > 0) DesktopPaginationService.GutterMetricsSnapshot(s.currentBottomLine, s.lowestDetectedY, s.linePitchPx) else null
    }

    fun reset() { frameCounter = 0; _gutterState.value = GutterState() }
    fun close() = recognizer.close()

    data class DetectedGutterLine(val lineNumber: Int, val centerY: Int, val topY: Int, val bottomY: Int, var isWrapped: Boolean = false, var wrappedVisualLines: Int = 1)
    data class GutterState(val currentTopLine: Int = 0, val currentBottomLine: Int = 0, val highestDetectedY: Int = 0, val lowestDetectedY: Int = 0, val linePitchPx: Float = 32f, val viewportHeight: Int = 1080, val wrappedLinesCount: Int = 0)

    companion object {
        private const val TAG = "GutterOcrTracker"
        const val GUTTER_WIDTH_RATIO = 0.15f
    }
}

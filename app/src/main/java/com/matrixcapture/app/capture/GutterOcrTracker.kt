package com.matrixcapture.app.capture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.util.Log
import com.matrixcapture.app.data.EngineMode
import com.matrixcapture.app.data.SettingsRepository
import com.matrixcapture.app.ocr.*
import com.matrixcapture.app.service.DesktopPaginationService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean

open class GutterOcrTracker(
    protected val scope: CoroutineScope,
    context: Context? = null,
    var ocrEngine: OcrEngine = MlKitOcrEngine()
) {
    private val isProcessingFrame = AtomicBoolean(false)
    private val _gutterState = MutableStateFlow(GutterState())
    val gutterState = _gutterState.asStateFlow()
    private var frameCounter = 0
    var isPaused = false

    private var gutterBitmapBuffer: Bitmap? = null
    private var gutterCanvas: Canvas? = null
    private val srcRect = Rect()
    private val dstRect = Rect()
    private val bufferLock = Any()

    init {
        context?.let { ctx ->
            scope.launch {
                val repo = SettingsRepository.getInstance(ctx)
                repo.engineMode.collect { mode ->
                    setEngineMode(mode, repo.serverHost.value)
                }
            }
        }
    }

    fun setEngineMode(mode: EngineMode, serverHost: String = "192.168.86.83:8000") {
        if (ocrEngine.engineType != mode.toOcrEngineType()) {
            ocrEngine.close()
            ocrEngine = when (mode) {
                EngineMode.CLOUD_GEMINI -> GeminiCloudEngine()
                EngineMode.LOCAL_OLLAMA -> OllamaLocalEngine("${serverHost.substringBefore(":")}:11434")
                EngineMode.HYBRID_AUTO -> HybridOcrEngine(MlKitOcrEngine(), ServerOcrEngine(serverHost))
            }
            Log.i(TAG, "GutterOcrTracker switched OCR engine to: ${ocrEngine.engineType}")
        }
    }

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

    suspend fun analyzeSnapshot(fullFrame: Bitmap, customGutterRect: Rect? = null): GutterState? = withContext(Dispatchers.Default) {
        if (fullFrame.isRecycled) return@withContext null
        try {
            processGutterBitmap(fullFrame, customGutterRect)
            _gutterState.value
        } catch (e: Exception) {
            Log.e(TAG, "Error in analyzeSnapshot", e)
            null
        }
    }

    private suspend fun processGutterBitmap(fullFrame: Bitmap, customGutterRect: Rect? = null) {
        val w = fullFrame.width; val h = fullFrame.height
        val (gx, gy, gw, gh) = if (customGutterRect != null && !customGutterRect.isEmpty) {
            val cx = customGutterRect.left.coerceIn(0, (w - 30).coerceAtLeast(0))
            val cy = customGutterRect.top.coerceIn(0, (h - 30).coerceAtLeast(0))
            val cw = customGutterRect.width().coerceIn(30, w - cx)
            val ch = customGutterRect.height().coerceIn(30, h - cy)
            listOf(cx, cy, cw, ch)
        } else {
            val cw = (w * GUTTER_WIDTH_RATIO).toInt().coerceIn(80, w / 2)
            listOf(0, 0, cw, h)
        }

        val targetBitmap = synchronized(bufferLock) {
            if (isPaused) return
            var buf = gutterBitmapBuffer
            if (buf == null || buf.isRecycled || buf.width != gw || buf.height != gh) {
                buf?.recycle()
                buf = Bitmap.createBitmap(gw, gh, Bitmap.Config.ARGB_8888)
                gutterBitmapBuffer = buf
                gutterCanvas = Canvas(buf)
            }
            srcRect.set(gx, gy, gx + gw, gy + gh)
            dstRect.set(0, 0, gw, gh)
            gutterCanvas?.drawBitmap(fullFrame, srcRect, dstRect, null)
            buf
        } ?: return
        val result = ocrEngine.recognizeText(targetBitmap)
        parseGutterLines(result, gh, gy)
    }

    private fun parseGutterLines(result: OcrResult, viewportHeight: Int, offsetY: Int = 0) {
        val detected = mutableListOf<DetectedGutterLine>()
        val topThresh = (viewportHeight * 0.02f).toInt(); val botThresh = (viewportHeight * 0.98f).toInt()
        for (line in result.lines) {
            val num = line.lineNumber
            val box = line.box
            if (num != null && num > 0 && box.top >= topThresh && box.bottom <= botThresh) {
                detected.add(DetectedGutterLine(num, box.centerY + offsetY, box.top + offsetY, box.bottom + offsetY))
            }
        }
        if (detected.isEmpty()) return
        detected.sortBy { it.topY }

        val validLines = mutableListOf<DetectedGutterLine>()
        for (d in detected) {
            if (validLines.isEmpty() || (d.topY > validLines.last().topY && d.lineNumber >= validLines.last().lineNumber)) {
                validLines.add(d)
            }
        }
        if (validLines.isEmpty()) return

        // Compute line pitch (dY / dL) dynamically across consecutive gutter numbers
        var totalPitch = 0f; var pitchSamples = 0
        for (i in 0 until validLines.size - 1) {
            val dL = validLines[i + 1].lineNumber - validLines[i].lineNumber
            val dY = validLines[i + 1].centerY - validLines[i].centerY
            if (dL in 1..5 && dY > 0) {
                val samplePitch = dY.toFloat() / dL
                if (samplePitch in 14f..100f) {
                    totalPitch += samplePitch
                    pitchSamples++
                }
            }
        }
        val prevPitch = _gutterState.value.linePitchPx
        val avgPitch = if (pitchSamples > 0) {
            val measured = totalPitch / pitchSamples
            if (prevPitch > 10f) (measured * 0.8f + prevPitch * 0.2f) else measured
        } else if (prevPitch > 10f) prevPitch else 32f

        var wrapped = 0
        for (i in 0 until validLines.size - 1) {
            if (validLines[i + 1].lineNumber == validLines[i].lineNumber + 1) {
                val rows = Math.round((validLines[i + 1].centerY - validLines[i].centerY) / avgPitch).toInt()
                if (rows > 1) { validLines[i].isWrapped = true; validLines[i].wrappedVisualLines = rows; wrapped++ }
            }
        }

        val gState = GutterState(
            currentTopLine = validLines.first().lineNumber,
            currentBottomLine = validLines.last().lineNumber,
            highestDetectedY = validLines.first().topY,
            lowestDetectedY = validLines.last().bottomY,
            linePitchPx = avgPitch,
            viewportHeight = viewportHeight,
            wrappedLinesCount = wrapped
        )
        _gutterState.value = gState

        // Zero-latency pipe into DesktopPaginationService for real-time auto-swipe pacer calculations
        DesktopPaginationService.updateGutterMetrics(
            topLine = gState.currentTopLine,
            bottomLine = gState.currentBottomLine,
            linePitchPx = gState.linePitchPx,
            wrappedLinesCount = gState.wrappedLinesCount
        )
    }

    fun getCalibrationSnapshot(): DesktopPaginationService.GutterMetricsSnapshot? {
        val s = _gutterState.value
        return if (s.currentBottomLine > 0) DesktopPaginationService.GutterMetricsSnapshot(s.currentBottomLine, s.lowestDetectedY, s.linePitchPx) else null
    }

    fun reset() { frameCounter = 0; _gutterState.value = GutterState() }
    open fun close() {
        isPaused = true
        isProcessingFrame.set(false)
        synchronized(bufferLock) {
            gutterBitmapBuffer?.recycle()
            gutterBitmapBuffer = null
            gutterCanvas = null
        }
        ocrEngine.close()
    }

    data class DetectedGutterLine(val lineNumber: Int, val centerY: Int, val topY: Int, val bottomY: Int, var isWrapped: Boolean = false, var wrappedVisualLines: Int = 1)
    data class GutterState(val currentTopLine: Int = 0, val currentBottomLine: Int = 0, val highestDetectedY: Int = 0, val lowestDetectedY: Int = 0, val linePitchPx: Float = 32f, val viewportHeight: Int = 1080, val wrappedLinesCount: Int = 0)

    companion object {
        private const val TAG = "GutterOcrTracker"
        const val GUTTER_WIDTH_RATIO = 0.12f
    }
}


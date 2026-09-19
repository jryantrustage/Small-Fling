package com.matrixcapture.app.capture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.nio.ByteBuffer

class DisplayCaptureManager(
    private val context: Context,
    private val mediaProjection: MediaProjection,
    private val outputDirectory: File? = null
) {
    private val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val frameHandler = Handler(Looper.getMainLooper())

    @Volatile private var latestSettledBitmap: Bitmap? = null
    private val bitmapLock = Any()
    var gutterTracker: GutterOcrTracker? = null

    private val _displayInfoState = MutableStateFlow<ExternalDisplayInfo?>(null)
    val displayInfoState = _displayInfoState.asStateFlow()
    private val _isRecording = MutableStateFlow(false)
    val isRecording = _isRecording.asStateFlow()

    init { detectExternalDisplay() }

    fun detectExternalDisplay(): ExternalDisplayInfo? {
        val displays = displayManager.displays
        val ext = displays.firstOrNull { d ->
            d.displayId != Display.DEFAULT_DISPLAY && (d.flags and Display.FLAG_PRESENTATION != 0 || isExternalType(d) || d.name.contains("HDMI", true))
        } ?: displays.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY } ?: displays.first()

        val m = DisplayMetrics()
        @Suppress("DEPRECATION") ext.getRealMetrics(m)
        val info = ExternalDisplayInfo(ext.displayId, ext.name, m.widthPixels, m.heightPixels, m.densityDpi, ext.refreshRate, ext.displayId != Display.DEFAULT_DISPLAY)
        _displayInfoState.value = info
        return info
    }

    private fun isExternalType(d: Display): Boolean = try { Display::class.java.getMethod("getType").invoke(d) == 2 } catch (_: Exception) { false }

    fun setupOcrVirtualDisplay(width: Int, height: Int, densityDpi: Int, frameListener: ImageReader.OnImageAvailableListener? = null) {
        val tw = if (width > 0) width else 1920; val th = if (height > 0) height else 1080; val tdpi = if (densityDpi > 0) densityDpi else 320
        imageReader?.close()
        imageReader = ImageReader.newInstance(tw, th, PixelFormat.RGBA_8888, 3).apply {
            setOnImageAvailableListener({ reader ->
                val image = try { reader.acquireLatestImage() } catch (_: Exception) { null } ?: return@setOnImageAvailableListener
                try {
                    convertImageToBitmap(image)?.let { bmp ->
                        synchronized(bitmapLock) { latestSettledBitmap?.recycle(); latestSettledBitmap = bmp }
                        gutterTracker?.onFrameCaptured(bmp)
                    }
                } catch (e: Exception) { Log.e(TAG, "Error in ImageReader", e) }
                finally { image.close() }
            }, frameHandler)
        }
        virtualDisplay?.release()
        virtualDisplay = mediaProjection.createVirtualDisplay("MatrixCapture_Settled_VD", tw, th, tdpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader?.surface, null, null)
        _isRecording.value = true
    }

    private fun convertImageToBitmap(image: Image): Bitmap? {
        val w = image.width; val h = image.height
        val plane = image.planes[0]; val buf: ByteBuffer = plane.buffer
        val pStride = plane.pixelStride; val rStride = plane.rowStride
        val rPad = rStride - pStride * w
        val raw = Bitmap.createBitmap(w + rPad / pStride, h, Bitmap.Config.ARGB_8888).apply { copyPixelsFromBuffer(buf) }
        return if (rPad == 0) raw else Bitmap.createBitmap(raw, 0, 0, w, h).also { raw.recycle() }
    }

    fun captureSettledSnapshot(): Bitmap? {
        synchronized(bitmapLock) { latestSettledBitmap?.takeIf { !it.isRecycled }?.let { return it.copy(Bitmap.Config.ARGB_8888, false) } }
        for (i in 0 until 8) {
            try { Thread.sleep(50) } catch (_: InterruptedException) {}
            synchronized(bitmapLock) { latestSettledBitmap?.takeIf { !it.isRecycled }?.let { return it.copy(Bitmap.Config.ARGB_8888, false) } }
        }
        return null
    }

    fun release() {
        try {
            virtualDisplay?.release(); imageReader?.close()
            synchronized(bitmapLock) { latestSettledBitmap?.recycle(); latestSettledBitmap = null }
        } catch (e: Exception) { Log.e(TAG, "Error releasing resources", e) }
        finally { virtualDisplay = null; imageReader = null; _isRecording.value = false }
    }

    data class ExternalDisplayInfo(val displayId: Int, val name: String, val width: Int, val height: Int, val densityDpi: Int, val refreshRate: Float, val isExternal: Boolean)
    companion object { private const val TAG = "DisplayCaptureManager" }
}

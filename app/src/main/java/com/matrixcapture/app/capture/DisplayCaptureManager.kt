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

/**
 * High-Performance Multi-Display Settled Screen Capture Manager.
 *
 * Dedicated to capturing pristine, uncompressed 1080p Bitmaps from the active external display.
 * Feeds settled frames directly to GutterOcrTracker and FrameUploadClient.
 */
class DisplayCaptureManager(
    private val context: Context,
    private val mediaProjection: MediaProjection,
    private val outputDirectory: File? = null
) {
    private val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val frameHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var latestSettledBitmap: Bitmap? = null
    private val bitmapLock = Any()

    var gutterTracker: GutterOcrTracker? = null

    private val _displayInfoState = MutableStateFlow<ExternalDisplayInfo?>(null)
    val displayInfoState = _displayInfoState.asStateFlow()

    private val _isRecording = MutableStateFlow(false)
    val isRecording = _isRecording.asStateFlow()

    init {
        detectExternalDisplay()
    }

    /**
     * Scans for external desktop display (Screen 1) connected via USB-C DP Alt Mode or HDMI.
     */
    fun detectExternalDisplay(): ExternalDisplayInfo? {
        val displays = displayManager.displays
        Log.i(TAG, "Detecting displays. Found ${displays.size} connected displays.")

        var externalDisplay: Display? = null
        for (d in displays) {
            Log.d(TAG, "Display ID: ${d.displayId}, Name: ${d.name}, Flags: ${d.flags}, Type: ${getDisplayTypeString(d)}")
            if (d.displayId != Display.DEFAULT_DISPLAY &&
                (d.flags and Display.FLAG_PRESENTATION != 0 || isExternalType(d) || d.name.contains("HDMI", ignoreCase = true))
            ) {
                externalDisplay = d
                break
            }
        }

        val targetDisplay = externalDisplay ?: displays.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }
        ?: displays.first()

        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        targetDisplay.getRealMetrics(metrics)

        val info = ExternalDisplayInfo(
            displayId = targetDisplay.displayId,
            name = targetDisplay.name,
            width = metrics.widthPixels,
            height = metrics.heightPixels,
            densityDpi = metrics.densityDpi,
            refreshRate = targetDisplay.refreshRate,
            isExternal = targetDisplay.displayId != Display.DEFAULT_DISPLAY
        )

        _displayInfoState.value = info
        Log.i(TAG, "Selected Capture Target: $info")
        return info
    }

    private fun isExternalType(display: Display): Boolean {
        return try {
            val getTypeMethod = Display::class.java.getMethod("getType")
            getTypeMethod.invoke(display) == 2 // Display.TYPE_EXTERNAL
        } catch (e: Exception) {
            false
        }
    }

    private fun getDisplayTypeString(display: Display): String {
        return try {
            val getTypeMethod = Display::class.java.getMethod("getType")
            when (getTypeMethod.invoke(display) as Int) {
                1 -> "BUILT_IN"
                2 -> "EXTERNAL"
                3 -> "WIFI"
                4 -> "OVERLAY"
                5 -> "VIRTUAL"
                else -> "UNKNOWN"
            }
        } catch (e: Exception) {
            "ID_${display.displayId}"
        }
    }

    /**
     * Initializes the ImageReader and VirtualDisplay for pristine 1080p frame extraction.
     */
    fun setupOcrVirtualDisplay(
        width: Int,
        height: Int,
        densityDpi: Int,
        frameListener: ImageReader.OnImageAvailableListener? = null
    ) {
        val targetWidth = if (width > 0) width else 1920
        val targetHeight = if (height > 0) height else 1080
        val targetDpi = if (densityDpi > 0) densityDpi else 320

        imageReader?.close()
        imageReader = ImageReader.newInstance(targetWidth, targetHeight, PixelFormat.RGBA_8888, 3).apply {
            setOnImageAvailableListener({ reader ->
                val image = try {
                    reader.acquireLatestImage()
                } catch (e: Exception) {
                    null
                } ?: return@setOnImageAvailableListener

                try {
                    val bmp = convertImageToBitmap(image)
                    if (bmp != null) {
                        synchronized(bitmapLock) {
                            latestSettledBitmap?.recycle()
                            latestSettledBitmap = bmp
                        }
                        // Notify gutter OCR tracker with the latest frame
                        gutterTracker?.onFrameCaptured(bmp)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing ImageReader frame", e)
                } finally {
                    image.close()
                }
            }, frameHandler)
        }

        virtualDisplay?.release()
        virtualDisplay = mediaProjection.createVirtualDisplay(
            "MatrixCapture_Settled_VD",
            targetWidth,
            targetHeight,
            targetDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface,
            null,
            null
        )
        _isRecording.value = true
        Log.i(TAG, "Settled VirtualDisplay successfully bound to ImageReader ($targetWidth x $targetHeight @ ${targetDpi}dpi)")
    }

    private fun convertImageToBitmap(image: Image): Bitmap? {
        val width = image.width
        val height = image.height
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * width

        val rawBitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        rawBitmap.copyPixelsFromBuffer(buffer)

        return if (rowPadding == 0) {
            rawBitmap
        } else {
            val cropped = Bitmap.createBitmap(rawBitmap, 0, 0, width, height)
            rawBitmap.recycle()
            cropped
        }
    }

    /**
     * Grabs a pristine 1080p uncompressed screenshot Bitmap from the settled ImageReader surface.
     * Guaranteed non-null during active sessions.
     */
    fun captureSettledSnapshot(): Bitmap? {
        synchronized(bitmapLock) {
            latestSettledBitmap?.let {
                if (!it.isRecycled) {
                    return it.copy(Bitmap.Config.ARGB_8888, false)
                }
            }
        }

        // Retry briefly (up to 400ms) if first frame is still being rendered
        for (i in 0 until 8) {
            try {
                Thread.sleep(50)
            } catch (_: InterruptedException) {}
            synchronized(bitmapLock) {
                latestSettledBitmap?.let {
                    if (!it.isRecycled) {
                        return it.copy(Bitmap.Config.ARGB_8888, false)
                    }
                }
            }
        }

        Log.w(TAG, "Settled snapshot requested before first frame was rendered.")
        return null
    }

    fun release() {
        try {
            virtualDisplay?.release()
            imageReader?.close()
            synchronized(bitmapLock) {
                latestSettledBitmap?.recycle()
                latestSettledBitmap = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing capture manager resources", e)
        } finally {
            virtualDisplay = null
            imageReader = null
            _isRecording.value = false
        }
    }

    data class ExternalDisplayInfo(
        val displayId: Int,
        val name: String,
        val width: Int,
        val height: Int,
        val densityDpi: Int,
        val refreshRate: Float,
        val isExternal: Boolean
    )

    companion object {
        private const val TAG = "DisplayCaptureManager"
    }
}

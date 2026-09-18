package com.matrixcapture.app.capture

import android.content.Context
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.Surface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Module A & C: Multi-Display & Desktop Mode Management with Segmented Media Recording.
 *
 * 1. Identifies Display.TYPE_EXTERNAL (Display ID 1) connected via USB-C DP Alt Mode.
 * 2. Obtains exact resolution and density.
 * 3. Binds dual VirtualDisplays from MediaProjection:
 *    - Surface A: MediaRecorder (H.264 / MP4 1080p @ 30fps).
 *    - Surface B: ImageReader (Gutter OCR line tracker).
 * 4. Manages seamless segmented video rotation.
 */
class DisplayCaptureManager(
    private val context: Context,
    private val mediaProjection: MediaProjection,
    private val outputDirectory: File
) {
    private val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

    private var mediaRecorder: MediaRecorder? = null
    private var unifiedVirtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    private var currentSegmentIndex = 0
    private var currentSegmentStartLine = 1
    private var currentSegmentFile: File? = null

    private val _displayInfoState = MutableStateFlow<ExternalDisplayInfo?>(null)
    val displayInfoState = _displayInfoState.asStateFlow()

    private val _isRecording = MutableStateFlow(false)
    val isRecording = _isRecording.asStateFlow()

    init {
        detectExternalDisplay()
    }

    /**
     * Scans for external desktop display (Screen 1) connected via DisplayPort Alt Mode.
     */
    fun detectExternalDisplay(): ExternalDisplayInfo? {
        val displays = displayManager.displays
        Log.i(TAG, "Detecting displays. Found ${displays.size} connected displays.")

        var externalDisplay: Display? = null
        for (d in displays) {
            Log.d(TAG, "Display ID: ${d.displayId}, Name: ${d.name}, Flags: ${d.flags}, Type: ${getDisplayTypeString(d)}")
            // On Pixel Desktop Mode, USB-C monitor presents as Display.TYPE_EXTERNAL
            if (d.displayId != Display.DEFAULT_DISPLAY &&
                (d.flags and Display.FLAG_PRESENTATION != 0 || isExternalType(d) || d.name.contains("HDMI", ignoreCase = true))
            ) {
                externalDisplay = d
                break
            }
        }

        // Fallback to secondary display or default if running in emulator / single display
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
     * Initializes the ImageReader surface for the real-time Gutter OCR tracker.
     */
    fun setupOcrVirtualDisplay(
        width: Int,
        height: Int,
        densityDpi: Int,
        frameListener: ImageReader.OnImageAvailableListener
    ) {
        // High-performance RGBA_8888 ImageReader for Gutter cropping
        imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 3)
        imageReader?.setOnImageAvailableListener(frameListener, Handler(Looper.getMainLooper()))

        if (unifiedVirtualDisplay == null) {
            unifiedVirtualDisplay = mediaProjection.createVirtualDisplay(
                "MatrixCapture_Unified_VD",
                width,
                height,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface,
                null,
                null
            )
            Log.i(TAG, "Unified VirtualDisplay bound to ImageReader ($width x $height @ ${densityDpi}dpi)")
        } else {
            unifiedVirtualDisplay?.setSurface(imageReader?.surface)
            Log.i(TAG, "Unified VirtualDisplay re-pointed to ImageReader surface")
        }
    }

    var gutterTracker: GutterOcrTracker? = null

    /**
     * Grabs a pristine 1080p uncompressed screenshot Bitmap from the settled ImageReader surface.
     * Zero motion blur, zero video compression artifacts.
     */
    fun captureSettledSnapshot(): Bitmap? {
        val cached = gutterTracker?.getLatestSettledFrameBitmap()
        if (cached != null) {
            return cached
        }

        val reader = imageReader ?: return null
        val image = try {
            reader.acquireLatestImage()
        } catch (e: Exception) {
            Log.e(TAG, "Error acquiring snapshot image from ImageReader", e)
            null
        } ?: return null

        return try {
            val width = image.width
            val height = image.height
            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            val rowPadding = rowStride - pixelStride * width

            val rawBitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
            )
            rawBitmap.copyPixelsFromBuffer(buffer)

            if (rowPadding == 0) {
                rawBitmap
            } else {
                Bitmap.createBitmap(rawBitmap, 0, 0, width, height)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error converting ImageReader image to Bitmap", e)
            null
        } finally {
            image.close()
        }
    }

    /**
     * Starts recording a discrete MP4 video segment at 1080p, 30fps.
     */
    @Synchronized
    fun startNewSegment(
        segmentIndex: Int,
        startLine: Int,
        width: Int = 1920,
        height: Int = 1080,
        densityDpi: Int = 320
    ): File {
        currentSegmentIndex = segmentIndex
        currentSegmentStartLine = startLine

        if (!outputDirectory.exists()) {
            outputDirectory.mkdirs()
        }

        val segmentFileName = String.format(
            Locale.US,
            "segment_%03d_lines_%05d_recording.mp4",
            segmentIndex,
            startLine
        )
        val file = File(outputDirectory, segmentFileName)
        currentSegmentFile = file

        mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }.apply {
            setVideoSource(MediaRecorder.VideoSource.SURFACE)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            setVideoSize(width, height)
            setVideoFrameRate(30)
            setVideoEncodingBitRate(10_000_000) // 10 Mbps for crisp, artifact-free OCR code frames
            setOutputFile(file.absolutePath)
            prepare()
        }

        val recorderSurface: Surface = mediaRecorder!!.surface

        if (unifiedVirtualDisplay == null) {
            unifiedVirtualDisplay = mediaProjection.createVirtualDisplay(
                "MatrixCapture_Unified_VD",
                width,
                height,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                recorderSurface,
                null,
                null
            )
            Log.i(TAG, "Created Unified VirtualDisplay for MediaRecorder ($width x $height)")
        } else {
            unifiedVirtualDisplay?.setSurface(recorderSurface)
            Log.i(TAG, "Switched Unified VirtualDisplay to MediaRecorder Surface")
        }

        mediaRecorder?.start()
        _isRecording.value = true
        Log.i(TAG, "Started recording segment $segmentIndex at line $startLine -> ${file.name}")
        return file
    }

    /**
     * Finalizes the active video segment and renames it to include its end line.
     */
    @Synchronized
    fun finalizeSegment(endLine: Int): CompletedSegment? {
        if (!_isRecording.value || mediaRecorder == null || currentSegmentFile == null) {
            return null
        }

        try {
            mediaRecorder?.stop()
            mediaRecorder?.reset()
            mediaRecorder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MediaRecorder", e)
        } finally {
            mediaRecorder = null
            // Swapping surface back to OCR imageReader keeps VirtualDisplay alive without crash
            unifiedVirtualDisplay?.setSurface(imageReader?.surface)
            _isRecording.value = false
        }

        val rawFile = currentSegmentFile ?: return null
        val finalizedName = String.format(
            Locale.US,
            "segment_%03d_lines_%05d_%05d.mp4",
            currentSegmentIndex,
            currentSegmentStartLine,
            endLine
        )
        val finalizedFile = File(outputDirectory, finalizedName)
        if (rawFile.exists()) {
            rawFile.renameTo(finalizedFile)
        }

        val result = CompletedSegment(
            segmentIndex = currentSegmentIndex,
            startLine = currentSegmentStartLine,
            endLine = endLine,
            videoFile = finalizedFile
        )
        Log.i(TAG, "Finalized segment: $result")
        return result
    }

    fun release() {
        try {
            if (_isRecording.value) {
                mediaRecorder?.stop()
            }
            mediaRecorder?.release()
            unifiedVirtualDisplay?.release()
            imageReader?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing capture manager resources", e)
        } finally {
            mediaRecorder = null
            unifiedVirtualDisplay = null
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

    data class CompletedSegment(
        val segmentIndex: Int,
        val startLine: Int,
        val endLine: Int,
        val videoFile: File
    )

    companion object {
        private const val TAG = "DisplayCaptureManager"
    }
}

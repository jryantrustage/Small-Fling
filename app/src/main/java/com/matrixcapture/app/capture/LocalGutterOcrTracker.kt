package com.matrixcapture.app.capture

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.matrixcapture.app.ocr.MlKitOcrEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

class LocalGutterOcrTracker(
    scope: CoroutineScope,
    context: Context? = null
) : GutterOcrTracker(scope, context, MlKitOcrEngine()) {
    private var streamJob: Job? = null

    init {
        Log.i(TAG, "LocalGutterOcrTracker active: on-device Google ML Kit text recognition engaged for zero-latency Pixel 10 gutter tracking")
    }

    fun connectFrameStream(stream: SharedFlow<Bitmap>) {
        if (streamJob?.isActive == true) return
        streamJob?.cancel()
        streamJob = scope.launch(Dispatchers.Default) {
            stream.collect { bmp -> onFrameCaptured(bmp) }
        }
        Log.i(TAG, "Connected LocalGutterOcrTracker to DisplayCaptureManager frame emission stream")
    }

    fun disconnectFrameStream() {
        streamJob?.cancel()
        streamJob = null
    }

    override fun close() {
        disconnectFrameStream()
        super.close()
    }

    companion object {
        private const val TAG = "LocalGutterOcrTracker"
    }
}

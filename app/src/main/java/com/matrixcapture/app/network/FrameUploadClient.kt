package com.matrixcapture.app.network

import android.graphics.Bitmap
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Client for uploading discrete settled 1080p desktop screenshots to the FastAPI server,
 * and polling the recapture queue for user-requested line seeks.
 */
class FrameUploadClient(
    var serverHost: String = "192.168.86.83:8000"
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    data class RecaptureTask(
        val lineNumber: Int,
        val reason: String
    )

    /**
     * Compresses the 1080p snapshot to PNG and uploads to FastAPI with gutter line bounds.
     */
    suspend fun uploadFrame(
        bitmap: Bitmap,
        topLine: Int,
        bottomLine: Int,
        pageIndex: Int
    ): Boolean = withContext(Dispatchers.IO) {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        val byteArray = stream.toByteArray()

        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("top_line", topLine.toString())
            .addFormDataPart("bottom_line", bottomLine.toString())
            .addFormDataPart("page_index", pageIndex.toString())
            .addFormDataPart(
                "file",
                "frame_${topLine}_${bottomLine}.png",
                byteArray.toRequestBody("image/png".toMediaTypeOrNull(), 0, byteArray.size)
            )
            .build()

        val url = "http://$serverHost/api/upload-frame"
        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Log.i(TAG, "Uploaded frame $pageIndex (lines $topLine-$bottomLine) successfully to $url")
                    true
                } else {
                    Log.e(TAG, "Failed to upload frame: ${response.code} - ${response.message}")
                    false
                }
            }
        } catch (e: IOException) {
            Log.e(TAG, "Network error uploading frame to $url", e)
            false
        }
    }

    /**
     * Polls the FastAPI backend to see if any line numbers have been flagged for re-capture.
     */
    suspend fun fetchRecaptureQueue(): List<RecaptureTask> = withContext(Dispatchers.IO) {
        val url = "http://$serverHost/api/recapture-queue"
        val request = Request.Builder().url(url).get().build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext emptyList()
                val bodyStr = response.body?.string() ?: return@withContext emptyList()
                val jsonArr = JSONArray(bodyStr)
                val list = mutableListOf<RecaptureTask>()
                for (i in 0 until jsonArr.length()) {
                    val obj = jsonArr.getJSONObject(i)
                    list.add(
                        RecaptureTask(
                            lineNumber = obj.optInt("line_number"),
                            reason = obj.optString("reason")
                        )
                    )
                }
                list
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Reports to FastAPI that line N was successfully recaptured.
     */
    suspend fun completeRecapture(lineNumber: Int) = withContext(Dispatchers.IO) {
        val url = "http://$serverHost/api/recapture-completed"
        val json = JSONObject().apply {
            put("line_number", lineNumber)
            put("reason", "recaptured")
        }
        val requestBody = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder().url(url).post(requestBody).build()

        try {
            client.newCall(request).execute().close()
        } catch (e: Exception) {
            Log.e(TAG, "Error marking recapture completed", e)
        }
    }

    data class TelemetryData(
        val deviceId: String = "Pixel 10 Desktop",
        val isPacing: Boolean = false,
        val currentPage: Int = 0,
        val currentTopLine: Int = 0,
        val currentBottomLine: Int = 0,
        val targetTotalLines: Int = 0,
        val dwellCountdownMs: Int = 0,
        val phase: String = "IDLE",
        val statusMessage: String = "",
        val mobilePromptTokens: Int = 0,
        val mobileCandidatesTokens: Int = 0,
        val mobileTotalTokens: Int = 0,
        val autoTuneFactor: Float = 1.0f,
        val linePitchPx: Float = 32f,
        val bottomToTopError: Int = 0,
        val wrappedLinesDetected: Int = 0
    )

    suspend fun sendTelemetry(data: TelemetryData): Boolean = withContext(Dispatchers.IO) {
        val url = "http://$serverHost/api/telemetry"
        val json = JSONObject().apply {
            put("device_id", data.deviceId)
            put("is_pacing", data.isPacing)
            put("current_page", data.currentPage)
            put("current_top_line", data.currentTopLine)
            put("current_bottom_line", data.currentBottomLine)
            put("target_total_lines", data.targetTotalLines)
            put("dwell_countdown_ms", data.dwellCountdownMs)
            put("phase", data.phase)
            put("status_message", data.statusMessage)
            put("mobile_tokens", JSONObject().apply {
                put("prompt_tokens", data.mobilePromptTokens)
                put("candidates_tokens", data.mobileCandidatesTokens)
                put("total_tokens", data.mobileTotalTokens)
            })
            put("pacer_calibration", JSONObject().apply {
                put("auto_tune_factor", data.autoTuneFactor.toDouble())
                put("line_pitch_px", data.linePitchPx.toDouble())
                put("bottom_to_top_error", data.bottomToTopError)
                put("wrapped_lines_detected", data.wrappedLinesDetected)
            })
        }

        val requestBody = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder().url(url).post(requestBody).build()
        try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    suspend fun resetServerState(targetTotalLines: Int = 0): Boolean = withContext(Dispatchers.IO) {
        val url = "http://$serverHost/api/reset-state"
        val json = JSONObject().apply {
            put("target_total_lines", targetTotalLines)
        }
        val requestBody = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder().url(url).post(requestBody).build()
        try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            Log.e(TAG, "Error calling reset-state on $url", e)
            false
        }
    }

    suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        val url = "http://$serverHost/api/health"
        val request = Request.Builder().url(url).get().build()
        try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    companion object {
        private const val TAG = "FrameUploadClient"
    }
}

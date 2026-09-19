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

class FrameUploadClient(var serverHost: String = "192.168.86.83:8000") {
    private val client = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()

    data class RecaptureTask(val lineNumber: Int, val reason: String)
    data class UploadResult(val success: Boolean, val topLine: Int = 0, val bottomLine: Int = 0, val extractedLineCount: Int = 0, val message: String = "")
    data class TelemetryData(val deviceId: String = "Pixel 10 Desktop", val isPacing: Boolean = false, val currentPage: Int = 0, val currentTopLine: Int = 0, val currentBottomLine: Int = 0, val targetTotalLines: Int = 0, val dwellCountdownMs: Int = 0, val phase: String = "IDLE", val statusMessage: String = "", val activeStep: String? = null, val source: String = "mobile", val mobilePromptTokens: Int = 0, val mobileCandidatesTokens: Int = 0, val mobileTotalTokens: Int = 0, val autoTuneFactor: Float = 1.0f, val linePitchPx: Float = 32f, val bottomToTopError: Int = 0, val wrappedLinesDetected: Int = 0)
    data class OrchestrationState(val status: String = "IDLE", val command: String = "NONE", val source: String = "system", val invokedBy: String = "System ⚙️", val activeStep: String = "START_READY", val stepLabel: String = "", val currentPage: Int = 1, val currentTopLine: Int = 0, val currentBottomLine: Int = 0, val nextTargetTop: Int = 0, val targetTotalLines: Int = 0, val statusMessage: String = "")

    private fun parseOrchestration(bodyStr: String, fallbackCmd: String, fallbackSrc: String): OrchestrationState {
        val root = JSONObject(bodyStr)
        val orch = root.optJSONObject("orchestration") ?: JSONObject()
        val telem = root.optJSONObject("telemetry") ?: JSONObject()
        return OrchestrationState(
            status = orch.optString("status", "IDLE"), command = orch.optString("last_command", fallbackCmd),
            source = orch.optString("source", fallbackSrc), invokedBy = orch.optString("invoked_by", "System ⚙️"),
            activeStep = orch.optString("active_step", "START_READY"), stepLabel = orch.optString("step_label", ""),
            currentPage = telem.optInt("current_page", orch.optInt("page", 1)),
            currentTopLine = telem.optInt("current_top_line", orch.optInt("top_line", 0)),
            currentBottomLine = telem.optInt("current_bottom_line", orch.optInt("bottom_line", 0)),
            nextTargetTop = orch.optInt("next_target_top", 0), targetTotalLines = telem.optInt("target_total_lines", 0),
            statusMessage = telem.optString("status_message", "")
        )
    }

    suspend fun uploadFrame(bitmap: Bitmap, topLine: Int = 0, bottomLine: Int = 0, pageIndex: Int = 1, sync: Boolean = true, engine: String? = null, modelTarget: String? = null, pipelineMode: String? = null): UploadResult = withContext(Dispatchers.IO) {
        val stream = ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        val bytes = stream.toByteArray()
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("top_line", topLine.toString()).addFormDataPart("bottom_line", bottomLine.toString())
            .addFormDataPart("page_index", pageIndex.toString()).addFormDataPart("sync", sync.toString())
            .addFormDataPart("file", "frame_p${pageIndex}_${System.currentTimeMillis()}.png", bytes.toRequestBody("image/png".toMediaTypeOrNull(), 0, bytes.size))
        engine?.let { builder.addFormDataPart("engine", it) }
        modelTarget?.let { builder.addFormDataPart("model_target", it) }
        pipelineMode?.let { builder.addFormDataPart("pipeline_mode", it) }
        val body = builder.build()
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/upload-frame").post(body).build()).execute().use { resp ->
                if (resp.isSuccessful) {
                    val json = JSONObject(resp.body?.string() ?: "{}")
                    UploadResult(true, json.optInt("top_line"), json.optInt("bottom_line"), json.optInt("extracted_line_count"), json.optString("message"))
                } else UploadResult(false, message = "HTTP ${resp.code}")
            }
        } catch (e: Exception) { UploadResult(false, message = e.message ?: "Error") }
    }

    suspend fun setServerPipelineMode(mode: String): Result<Unit> = withContext(Dispatchers.IO) {
        val json = JSONObject().apply { put("mode", mode.lowercase()) }
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/pipeline/mode").post(json.toString().toRequestBody("application/json".toMediaTypeOrNull())).build()).execute().use { resp ->
                if (resp.isSuccessful) Result.success(Unit) else Result.failure(IOException("HTTP ${resp.code}"))
            }
        } catch (e: Exception) { Result.failure(e) }
    }

    suspend fun getNextPageLine(): Result<Int> = withContext(Dispatchers.IO) {
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/next-page-line").get().build()).execute().use { resp ->
                if (resp.isSuccessful) Result.success(JSONObject(resp.body?.string() ?: "{}").optInt("next_page_first_line", 1))
                else Result.failure(IOException("HTTP ${resp.code}"))
            }
        } catch (e: Exception) { Result.failure(e) }
    }

    suspend fun fetchRecaptureQueue(): List<RecaptureTask> = withContext(Dispatchers.IO) {
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/recapture-queue").get().build()).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string() ?: "[]")
                (0 until arr.length()).map { RecaptureTask(arr.getJSONObject(it).optInt("line_number"), arr.getJSONObject(it).optString("reason")) }
            }
        } catch (_: Exception) { emptyList() }
    }

    suspend fun completeRecapture(lineNumber: Int) = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply { put("line_number", lineNumber); put("reason", "recaptured") }
            client.newCall(Request.Builder().url("http://$serverHost/api/recapture-completed").post(json.toString().toRequestBody("application/json".toMediaTypeOrNull())).build()).execute().close()
        } catch (_: Exception) {}
    }

    suspend fun sendTelemetry(data: TelemetryData): Boolean = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("device_id", data.deviceId); put("is_pacing", data.isPacing); put("current_page", data.currentPage)
            put("current_top_line", data.currentTopLine); put("current_bottom_line", data.currentBottomLine)
            put("target_total_lines", data.targetTotalLines); put("dwell_countdown_ms", data.dwellCountdownMs)
            put("phase", data.phase); put("status_message", data.statusMessage); data.activeStep?.let { put("active_step", it) }; put("source", data.source)
            put("mobile_tokens", JSONObject().apply { put("prompt_tokens", data.mobilePromptTokens); put("candidates_tokens", data.mobileCandidatesTokens); put("total_tokens", data.mobileTotalTokens) })
            put("pacer_calibration", JSONObject().apply { put("auto_tune_factor", data.autoTuneFactor.toDouble()); put("line_pitch_px", data.linePitchPx.toDouble()); put("bottom_to_top_error", data.bottomToTopError); put("wrapped_lines_detected", data.wrappedLinesDetected) })
        }
        try { client.newCall(Request.Builder().url("http://$serverHost/api/telemetry").post(json.toString().toRequestBody("application/json".toMediaTypeOrNull())).build()).execute().use { it.isSuccessful } } catch (_: Exception) { false }
    }

    suspend fun resetServerState(targetTotalLines: Int = 0): Boolean = withContext(Dispatchers.IO) {
        val json = JSONObject().apply { put("target_total_lines", targetTotalLines) }
        try { client.newCall(Request.Builder().url("http://$serverHost/api/reset-state").post(json.toString().toRequestBody("application/json".toMediaTypeOrNull())).build()).execute().use { it.isSuccessful } } catch (_: Exception) { false }
    }

    suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        try { client.newCall(Request.Builder().url("http://$serverHost/api/health").get().build()).execute().use { it.isSuccessful } } catch (_: Exception) { false }
    }

    suspend fun sendOrchestrationCommand(command: String, source: String = "mobile"): Result<OrchestrationState> = withContext(Dispatchers.IO) {
        val json = JSONObject().apply { put("command", command.uppercase()); put("source", source) }
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/orchestrate").post(json.toString().toRequestBody("application/json".toMediaTypeOrNull())).build()).execute().use { resp ->
                if (resp.isSuccessful) Result.success(parseOrchestration(resp.body?.string() ?: "{}", command, source))
                else Result.failure(IOException("HTTP ${resp.code}"))
            }
        } catch (e: Exception) { Result.failure(e) }
    }

    suspend fun fetchOrchestrationState(): Result<OrchestrationState> = withContext(Dispatchers.IO) {
        try {
            client.newCall(Request.Builder().url("http://$serverHost/api/orchestrate").get().build()).execute().use { resp ->
                if (resp.isSuccessful) Result.success(parseOrchestration(resp.body?.string() ?: "{}", "NONE", "system"))
                else Result.failure(IOException("HTTP ${resp.code}"))
            }
        } catch (e: Exception) { Result.failure(e) }
    }

    companion object { private const val TAG = "FrameUploadClient" }
}

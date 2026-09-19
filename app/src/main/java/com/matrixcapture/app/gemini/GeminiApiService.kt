package com.matrixcapture.app.gemini

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class GeminiApiService(private val apiKeyProvider: () -> String) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }
    private val httpClient = OkHttpClient.Builder().connectTimeout(60, TimeUnit.SECONDS).readTimeout(180, TimeUnit.SECONDS).writeTimeout(180, TimeUnit.SECONDS).build()

    val mobilePromptTokens = AtomicInteger(0)
    val mobileCandidatesTokens = AtomicInteger(0)
    val mobileTotalTokens = AtomicInteger(0)

    suspend fun uploadVideo(file: File, displayName: String = file.name): GeminiFile = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        if (apiKey.isEmpty()) throw IllegalStateException("Gemini API Key is not set.")

        val fileSize = file.length()
        val initReq = Request.Builder()
            .url("https://generativelanguage.googleapis.com/upload/v1beta/files?key=$apiKey")
            .addHeader("X-Goog-Upload-Protocol", "resumable").addHeader("X-Goog-Upload-Command", "start")
            .addHeader("X-Goog-Upload-Header-Content-Length", fileSize.toString()).addHeader("X-Goog-Upload-Header-Content-Type", "video/mp4")
            .post("""{"file": {"display_name": "$displayName"}}""".toRequestBody("application/json".toMediaType()))
            .build()

        val uploadUrl = httpClient.newCall(initReq).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("Failed upload init: HTTP ${resp.code} - ${resp.body?.string()}")
            resp.header("X-Goog-Upload-URL") ?: throw IOException("Missing X-Goog-Upload-URL")
        }

        val uploadReq = Request.Builder().url(uploadUrl).addHeader("Content-Length", fileSize.toString()).addHeader("X-Goog-Upload-Offset", "0").addHeader("X-Goog-Upload-Command", "upload, finalize").post(file.asRequestBody("video/mp4".toMediaType())).build()
        httpClient.newCall(uploadReq).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw IOException("Failed upload: HTTP ${resp.code} - $body")
            json.decodeFromString<FileUploadResponse>(body).file
        }
    }

    suspend fun pollUntilActive(fileName: String, timeoutMs: Long = 180_000L, pollIntervalMs: Long = 3000L): GeminiFile = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val file = httpClient.newCall(Request.Builder().url("https://generativelanguage.googleapis.com/v1beta/$fileName?key=$apiKey").get().build()).execute().use { resp ->
                val body = resp.body?.string() ?: ""
                if (!resp.isSuccessful) throw IOException("File status failed: HTTP ${resp.code} - $body")
                json.decodeFromString<GeminiFile>(body)
            }
            when (file.state) {
                "ACTIVE" -> return@withContext file
                "FAILED" -> throw IllegalStateException("Video processing failed: $fileName")
                else -> delay(pollIntervalMs)
            }
        }
        throw IllegalStateException("Timed out waiting for $fileName")
    }

    suspend fun extractCodeFromSegment(fileUri: String, segmentIndex: Int, startLine: Int, endLine: Int, modelName: String = "gemini-3.6-flash"): String = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        val payload = GenerateContentRequest(
            systemInstruction = ContentBlock(parts = listOf(Part(text = GEMINI_SYSTEM_PROMPT))),
            contents = listOf(ContentBlock(parts = listOf(Part(fileData = FileData("video/mp4", fileUri)), Part(text = "Extract the complete document content displayed in this video segment (Lines approximately $startLine through $endLine). Follow all instructions precisely.")))),
            generationConfig = GenerationConfig(temperature = 0.0, maxOutputTokens = 8192)
        )
        val bodyStr = json.encodeToString(GenerateContentRequest.serializer(), payload)
        val req = Request.Builder().url("https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey").post(bodyStr.toRequestBody("application/json".toMediaType())).build()

        httpClient.newCall(req).execute().use { resp ->
            val b = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw IOException("Gemini error: HTTP ${resp.code} - $b")
            val res = json.decodeFromString<GenerateContentResponse>(b)
            res.usageMetadata?.let {
                mobilePromptTokens.addAndGet(it.promptTokenCount); mobileCandidatesTokens.addAndGet(it.candidatesTokenCount); mobileTotalTokens.addAndGet(it.totalTokenCount)
            }
            res.candidates?.firstOrNull()?.content?.parts?.joinToString("\n") { it.text ?: "" } ?: ""
        }
    }

    suspend fun deleteRemoteFile(fileName: String): Boolean = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        try { httpClient.newCall(Request.Builder().url("https://generativelanguage.googleapis.com/v1beta/$fileName?key=$apiKey").delete().build()).execute().use { it.isSuccessful } }
        catch (_: Exception) { false }
    }

    @Serializable data class FileUploadResponse(val file: GeminiFile)
    @Serializable data class GeminiFile(val name: String, @SerialName("display_name") val displayName: String? = null, val mimeType: String? = null, val sizeBytes: String? = null, val state: String? = null, val uri: String? = null)
    @Serializable data class GenerateContentRequest(@SerialName("system_instruction") val systemInstruction: ContentBlock? = null, val contents: List<ContentBlock>, val generationConfig: GenerationConfig? = null)
    @Serializable data class ContentBlock(val role: String? = null, val parts: List<Part>)
    @Serializable data class Part(val text: String? = null, @SerialName("file_data") val fileData: FileData? = null)
    @Serializable data class FileData(@SerialName("mime_type") val mimeType: String, @SerialName("file_uri") val fileUri: String)
    @Serializable data class GenerationConfig(val temperature: Double = 0.0, val maxOutputTokens: Int = 8192)
    @Serializable data class GenerateContentResponse(val candidates: List<Candidate>? = null, val usageMetadata: UsageMetadata? = null)
    @Serializable data class UsageMetadata(val promptTokenCount: Int = 0, val candidatesTokenCount: Int = 0, val totalTokenCount: Int = 0)
    @Serializable data class Candidate(val content: ContentBlock? = null)

    companion object {
        private const val TAG = "GeminiApiService"
        val GEMINI_SYSTEM_PROMPT = """You are an uncompromising, bit-level OCR code extraction engine. You are given a 30fps screen-recorded MP4 video showing a document being paginated line by line. Extract ALL text and code visible in the editor exactly as typed. Maintain all triple backticks (```) and language identifiers. Preserve all parser comments. Never abbreviate, truncate or summarize. Use standard ASCII spaces. Only output raw document contents.""".trimIndent()
    }
}

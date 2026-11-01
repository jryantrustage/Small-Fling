package com.matrixcapture.app.gemini

import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class GeminiApiService(private val apiKeyProvider: () -> String) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    val mobilePromptTokens = AtomicInteger(0)
    val mobileCandidatesTokens = AtomicInteger(0)
    val mobileTotalTokens = AtomicInteger(0)

    suspend fun extractCodeFromBitmap(
        bitmap: Bitmap,
        startLine: Int = 0,
        endLine: Int = 0,
        modelName: String = "gemini-2.5-flash"
    ): String = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        if (apiKey.isEmpty()) throw IllegalStateException("Gemini API Key is not set.")

        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, baos)
        val base64Img = android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)

        val promptText = if (startLine > 0 && endLine >= startLine) {
            "Extract the complete document text displayed in this frame (Lines approximately $startLine through $endLine). Maintain all code indentation, line numbers, and formatting precisely. Output only raw document contents."
        } else {
            "Extract all document text and code lines visible in this frame. Output only the exact text line by line."
        }

        val payload = GenerateContentRequest(
            systemInstruction = ContentBlock(parts = listOf(Part(text = GEMINI_SYSTEM_PROMPT))),
            contents = listOf(
                ContentBlock(
                    parts = listOf(
                        Part(inlineData = InlineData("image/jpeg", base64Img)),
                        Part(text = promptText)
                    )
                )
            ),
            generationConfig = GenerationConfig(temperature = 0.0, maxOutputTokens = 8192)
        )
        val bodyStr = json.encodeToString(GenerateContentRequest.serializer(), payload)
        val req = Request.Builder()
            .url("https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey")
            .post(bodyStr.toRequestBody("application/json".toMediaType()))
            .build()

        httpClient.newCall(req).execute().use { resp ->
            val b = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw IOException("Gemini error: HTTP ${resp.code} - $b")
            val res = json.decodeFromString<GenerateContentResponse>(b)
            res.usageMetadata?.let {
                mobilePromptTokens.addAndGet(it.promptTokenCount)
                mobileCandidatesTokens.addAndGet(it.candidatesTokenCount)
                mobileTotalTokens.addAndGet(it.totalTokenCount)
            }
            res.candidates?.firstOrNull()?.content?.parts?.joinToString("\n") { it.text ?: "" } ?: ""
        }
    }

    @Serializable
    data class GenerateContentRequest(
        @SerialName("system_instruction") val systemInstruction: ContentBlock? = null,
        val contents: List<ContentBlock>,
        val generationConfig: GenerationConfig? = null
    )

    @Serializable
    data class ContentBlock(val role: String? = null, val parts: List<Part>)

    @Serializable
    data class Part(val text: String? = null, @SerialName("inline_data") val inlineData: InlineData? = null)

    @Serializable
    data class InlineData(@SerialName("mime_type") val mimeType: String, val data: String)

    @Serializable
    data class GenerationConfig(val temperature: Double = 0.0, val maxOutputTokens: Int = 8192)

    @Serializable
    data class GenerateContentResponse(val candidates: List<Candidate>? = null, val usageMetadata: UsageMetadata? = null)

    @Serializable
    data class UsageMetadata(val promptTokenCount: Int = 0, val candidatesTokenCount: Int = 0, val totalTokenCount: Int = 0)

    @Serializable
    data class Candidate(val content: ContentBlock? = null)

    companion object {
        val GEMINI_SYSTEM_PROMPT = """You are an uncompromising, bit-level OCR code extraction engine. Extract ALL text and code visible in the editor frame exactly as typed. Maintain all triple backticks (```) and language identifiers. Preserve all parser comments. Never abbreviate, truncate or summarize. Use standard ASCII spaces. Only output raw document contents.""".trimIndent()
    }
}

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

/**
 * Module D: Gemini Cloud Extraction Client for Video File API and Multimodal OCR.
 *
 * Implements:
 * 1. Resumable Upload to Gemini File API (https://generativelanguage.googleapis.com/upload/v1beta/files).
 * 2. Polling loop awaiting ACTIVE file state.
 * 3. Exact system prompt inference with gemini-2.5-flash / gemini-1.5-pro.
 * 4. Automatic cleanup/deletion of remote video files.
 */
class GeminiApiService(
    private val apiKeyProvider: () -> String
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    /**
     * Uploads an MP4 video segment to the Gemini File API via the 2-step resumable protocol.
     */
    suspend fun uploadVideo(file: File, displayName: String = file.name): GeminiFile = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        if (apiKey.isEmpty()) {
            throw IllegalStateException("Gemini API Key is not set. Please provide a valid Gemini API Key.")
        }

        val fileSize = file.length()
        Log.i(TAG, "Uploading ${file.name} (${fileSize / 1024} KB) to Gemini File API...")

        // Step 1: Initialize Resumable Upload Session
        val initUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files?key=$apiKey"
        val metadataJson = """{"file": {"display_name": "$displayName"}}"""

        val initRequest = Request.Builder()
            .url(initUrl)
            .addHeader("X-Goog-Upload-Protocol", "resumable")
            .addHeader("X-Goog-Upload-Command", "start")
            .addHeader("X-Goog-Upload-Header-Content-Length", fileSize.toString())
            .addHeader("X-Goog-Upload-Header-Content-Type", "video/mp4")
            .post(metadataJson.toRequestBody("application/json".toMediaType()))
            .build()

        val uploadUrl = httpClient.newCall(initRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to initiate Gemini upload: HTTP ${response.code} - ${response.body?.string()}")
            }
            response.header("X-Goog-Upload-URL")
                ?: throw IOException("Missing X-Goog-Upload-URL header in Gemini upload response")
        }

        // Step 2: Upload Raw MP4 Video Bytes
        val uploadRequestBody = file.asRequestBody("video/mp4".toMediaType())
        val uploadRequest = Request.Builder()
            .url(uploadUrl)
            .addHeader("Content-Length", fileSize.toString())
            .addHeader("X-Goog-Upload-Offset", "0")
            .addHeader("X-Goog-Upload-Command", "upload, finalize")
            .post(uploadRequestBody)
            .build()

        val geminiFile = httpClient.newCall(uploadRequest).execute().use { response ->
            val respBody = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw IOException("Failed to upload video bytes to Gemini: HTTP ${response.code} - $respBody")
            }
            val uploadResponse = json.decodeFromString<FileUploadResponse>(respBody)
            uploadResponse.file
        }

        Log.i(TAG, "Uploaded video successfully. Remote Name: ${geminiFile.name}, State: ${geminiFile.state}")
        geminiFile
    }

    /**
     * Polls the Gemini File API until the video transitions from PROCESSING to ACTIVE.
     */
    suspend fun pollUntilActive(
        fileName: String,
        timeoutMs: Long = 180_000L,
        pollIntervalMs: Long = 3000L
    ): GeminiFile = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        val startTime = System.currentTimeMillis()
        val getUrl = "https://generativelanguage.googleapis.com/v1beta/$fileName?key=$apiKey"

        while (System.currentTimeMillis() - startTime < timeoutMs) {
            val request = Request.Builder().url(getUrl).get().build()
            val file = httpClient.newCall(request).execute().use { response ->
                val body = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    throw IOException("Failed to check file status: HTTP ${response.code} - $body")
                }
                json.decodeFromString<GeminiFile>(body)
            }

            Log.d(TAG, "File $fileName state: ${file.state}")
            when (file.state) {
                "ACTIVE" -> return@withContext file
                "FAILED" -> throw IllegalStateException("Gemini video processing failed for $fileName")
                else -> {
                    delay(pollIntervalMs)
                }
            }
        }

        throw IllegalStateException("Timed out waiting for file $fileName to become ACTIVE")
    }

    /**
     * Dispatches the segment to Gemini with the EXACT system instructions from Section 3.
     */
    suspend fun extractCodeFromSegment(
        fileUri: String,
        segmentIndex: Int,
        startLine: Int,
        endLine: Int,
        modelName: String = "gemini-2.5-flash"
    ): String = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        val generateUrl = "https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey"

        val requestPayload = GenerateContentRequest(
            systemInstruction = ContentBlock(
                parts = listOf(Part(text = GEMINI_SYSTEM_PROMPT))
            ),
            contents = listOf(
                ContentBlock(
                    parts = listOf(
                        Part(
                            fileData = FileData(
                                mimeType = "video/mp4",
                                fileUri = fileUri
                            )
                        ),
                        Part(
                            text = "Extract the complete document content displayed in this video segment " +
                                    "(Lines approximately $startLine through $endLine). " +
                                    "Follow all instructions precisely."
                        )
                    )
                )
            ),
            generationConfig = GenerationConfig(
                temperature = 0.0,
                maxOutputTokens = 8192
            )
        )

        val jsonBody = json.encodeToString(GenerateContentRequest.serializer(), requestPayload)
        val request = Request.Builder()
            .url(generateUrl)
            .post(jsonBody.toRequestBody("application/json".toMediaType()))
            .build()

        val extractedText = httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw IOException("Gemini generateContent error: HTTP ${response.code} - $body")
            }
            val result = json.decodeFromString<GenerateContentResponse>(body)
            result.candidates?.firstOrNull()?.content?.parts?.joinToString("\n") { it.text ?: "" } ?: ""
        }

        Log.i(TAG, "Successfully extracted ${extractedText.lines().size} lines from segment $segmentIndex.")
        extractedText
    }

    /**
     * Deletes the uploaded video file from the Gemini File API.
     */
    suspend fun deleteRemoteFile(fileName: String): Boolean = withContext(Dispatchers.IO) {
        val apiKey = apiKeyProvider().trim()
        val deleteUrl = "https://generativelanguage.googleapis.com/v1beta/$fileName?key=$apiKey"
        val request = Request.Builder().url(deleteUrl).delete().build()

        try {
            httpClient.newCall(request).execute().use { response ->
                val success = response.isSuccessful
                Log.i(TAG, "Deleted remote Gemini file $fileName (Success: $success)")
                success
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not delete remote Gemini file $fileName", e)
            false
        }
    }

    // --- Data Models for Gemini REST API ---

    @Serializable
    data class FileUploadResponse(
        val file: GeminiFile
    )

    @Serializable
    data class GeminiFile(
        val name: String,
        @SerialName("display_name") val displayName: String? = null,
        val mimeType: String? = null,
        val sizeBytes: String? = null,
        val state: String? = null,
        val uri: String? = null
    )

    @Serializable
    data class GenerateContentRequest(
        @SerialName("system_instruction") val systemInstruction: ContentBlock? = null,
        val contents: List<ContentBlock>,
        val generationConfig: GenerationConfig? = null
    )

    @Serializable
    data class ContentBlock(
        val role: String? = null,
        val parts: List<Part>
    )

    @Serializable
    data class Part(
        val text: String? = null,
        @SerialName("file_data") val fileData: FileData? = null
    )

    @Serializable
    data class FileData(
        @SerialName("mime_type") val mimeType: String,
        @SerialName("file_uri") val fileUri: String
    )

    @Serializable
    data class GenerationConfig(
        val temperature: Double = 0.0,
        val maxOutputTokens: Int = 8192
    )

    @Serializable
    data class GenerateContentResponse(
        val candidates: List<Candidate>? = null
    )

    @Serializable
    data class Candidate(
        val content: ContentBlock? = null
    )

    companion object {
        private const val TAG = "GeminiApiService"

        /**
         * The exact system instructions mandated in Section 3 of the Technical Specifications.
         */
        val GEMINI_SYSTEM_PROMPT = """
You are an uncompromising, bit-level OCR code extraction engine.
You are given a 30fps screen-recorded MP4 video showing a document being paginated line by line.

CRITICAL INSTRUCTIONS:
1. Extract ALL text and code visible in the editor exactly as typed.
2. Maintain all triple backticks (```) for code blocks and their exact language identifiers (json, tsx, typescript, css, html, etc.).
3. Preserve all parser comments verbatim, including:
   <!-- CODESCAN_FILE_START path="..." type="..." size="..." lines="..." chars="..." -->
   <!-- CODESCAN_FILE_END -->
4. Never abbreviate, truncate, summarize, or insert placeholders (e.g., no "// ... rest of code").
5. Do not replace spaces with  . Use standard ASCII spaces for indentation.
6. Only output the raw document contents. Do not include introductory or conversational filler.
""".trimIndent()
    }
}

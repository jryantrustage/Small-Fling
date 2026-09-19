package com.matrixcapture.app.ocr

import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Base64
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.matrixcapture.app.gemini.GeminiApiService
import com.matrixcapture.app.network.FrameUploadClient
import com.matrixcapture.app.service.SegmentRecorderService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class OcrEngineType { MLKIT, FASTAPI_SERVER, HYBRID, GEMINI_CLOUD, OLLAMA_LOCAL }
typealias EngineType = OcrEngineType
typealias EngineMode = com.matrixcapture.app.data.EngineMode

data class BoundingBox(val left: Int = 0, val top: Int = 0, val right: Int = 0, val bottom: Int = 0) {
    val centerY: Int get() = (top + bottom) / 2
    val height: Int get() = (bottom - top).coerceAtLeast(0)
    val width: Int get() = (right - left).coerceAtLeast(0)
}

data class OcrLine(
    val text: String,
    val lineNumber: Int? = text.trim().filter { it.isDigit() }.toIntOrNull(),
    val box: BoundingBox = BoundingBox(),
    val confidence: Float = 1.0f
)

data class OcrBlock(
    val text: String,
    val lines: List<OcrLine> = emptyList(),
    val box: BoundingBox = BoundingBox()
)

data class OcrResult(
    val fullText: String = "",
    val blocks: List<OcrBlock> = emptyList(),
    val lines: List<OcrLine> = blocks.flatMap { it.lines },
    val topLine: Int = lines.mapNotNull { it.lineNumber }.minOrNull() ?: 0,
    val bottomLine: Int = lines.mapNotNull { it.lineNumber }.maxOrNull() ?: 0,
    val confidence: Float = 1.0f,
    val engineUsed: OcrEngineType = OcrEngineType.MLKIT
)

interface OcrEngine {
    val engineType: OcrEngineType
    suspend fun getEngineType(): EngineType = engineType
    val engineMode: EngineMode get() = when (engineType) {
        OcrEngineType.GEMINI_CLOUD, OcrEngineType.FASTAPI_SERVER -> EngineMode.CLOUD_GEMINI
        OcrEngineType.OLLAMA_LOCAL, OcrEngineType.MLKIT -> EngineMode.LOCAL_OLLAMA
        OcrEngineType.HYBRID -> EngineMode.HYBRID_AUTO
    }
    suspend fun getEngineMode(): EngineMode = engineMode
    suspend fun recognizeText(bitmap: Bitmap): OcrResult
    suspend fun extractText(bitmap: Bitmap, topLine: Int = 0, bottomLine: Int = 0): Result<String>
    fun close() {}
}

data class OcrEngineConfig(
    val type: OcrEngineType = OcrEngineType.MLKIT,
    val serverHost: String = "192.168.86.83:8000",
    val ollamaHost: String = "${serverHost.substringBefore(":")}:11434",
    val timeoutMs: Long = 10000L
)

class MlKitOcrEngine : OcrEngine {
    override val engineType: OcrEngineType = OcrEngineType.MLKIT
    @Volatile private var recognizer: com.google.mlkit.vision.text.TextRecognizer? = null

    private suspend fun obtainRecognizer(): com.google.mlkit.vision.text.TextRecognizer = withContext(Dispatchers.Default) {
        recognizer ?: synchronized(this@MlKitOcrEngine) {
            recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }
        }
    }

    init {
        kotlinx.coroutines.CoroutineScope(Dispatchers.Default).launch { obtainRecognizer() }
    }

    override suspend fun getEngineType(): EngineType = OcrEngineType.MLKIT

    override suspend fun extractText(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> = runCatching {
        val result = recognizeText(bitmap)
        val lines = if (topLine > 0 || bottomLine > 0) {
            result.lines.filter { line ->
                val num = line.lineNumber
                num == null || ((topLine <= 0 || num >= topLine) && (bottomLine <= 0 || num <= bottomLine))
            }
        } else result.lines
        if (lines.isNotEmpty()) lines.joinToString("\n") { it.text } else result.fullText
    }

    override suspend fun recognizeText(bitmap: Bitmap): OcrResult = withContext(Dispatchers.Default) {
        val client = obtainRecognizer()
        val image = InputImage.fromBitmap(bitmap, 0)
        suspendCancellableCoroutine { cont ->
            client.process(image)
                .addOnSuccessListener { visionText ->
                    val blocks = visionText.textBlocks.map { b ->
                        val lines = b.lines.map { l ->
                            val r = l.boundingBox ?: Rect()
                            OcrLine(l.text, box = BoundingBox(r.left, r.top, r.right, r.bottom), confidence = l.confidence ?: 1.0f)
                        }
                        val br = b.boundingBox ?: Rect()
                        OcrBlock(b.text, lines, BoundingBox(br.left, br.top, br.right, br.bottom))
                    }
                    if (cont.isActive) cont.resume(OcrResult(visionText.text, blocks, engineUsed = OcrEngineType.MLKIT))
                }
                .addOnFailureListener { e ->
                    if (cont.isActive) cont.resumeWithException(e)
                }
        }
    }

    override fun close() {
        recognizer?.close()
        recognizer = null
    }
}

class ServerOcrEngine(var serverHost: String = "192.168.86.83:8000") : OcrEngine {
    override val engineType: OcrEngineType = OcrEngineType.FASTAPI_SERVER

    override suspend fun getEngineType(): EngineType = OcrEngineType.FASTAPI_SERVER

    override suspend fun extractText(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> = runCatching {
        val client = FrameUploadClient(serverHost)
        val res = client.uploadFrame(bitmap = bitmap, topLine = topLine, bottomLine = bottomLine, pageIndex = 1, sync = true)
        if (!res.success && res.message.isBlank()) {
            throw IllegalStateException("Server OCR failed: ${res.message}")
        }
        res.message
    }

    override suspend fun recognizeText(bitmap: Bitmap): OcrResult {
        val client = FrameUploadClient(serverHost)
        val res = client.uploadFrame(bitmap = bitmap, topLine = 0, bottomLine = 0, pageIndex = 1, sync = true)
        val dummyLines = if (res.topLine > 0 && res.bottomLine >= res.topLine) {
            (res.topLine..res.bottomLine).map { OcrLine(it.toString(), it) }
        } else emptyList()
        return OcrResult(
            fullText = res.message,
            blocks = listOf(OcrBlock(res.message, dummyLines)),
            topLine = res.topLine,
            bottomLine = res.bottomLine,
            confidence = if (res.success) 1.0f else 0.0f,
            engineUsed = OcrEngineType.FASTAPI_SERVER
        )
    }
}

class HybridOcrEngine(private val local: MlKitOcrEngine = MlKitOcrEngine(), private val remote: ServerOcrEngine = ServerOcrEngine()) : OcrEngine {
    override val engineType: OcrEngineType = OcrEngineType.HYBRID

    override suspend fun getEngineType(): EngineType = OcrEngineType.HYBRID

    override suspend fun extractText(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> = runCatching {
        local.extractText(bitmap, topLine, bottomLine).getOrElse {
            remote.extractText(bitmap, topLine, bottomLine).getOrThrow()
        }
    }

    override suspend fun recognizeText(bitmap: Bitmap): OcrResult {
        return try {
            val localRes = local.recognizeText(bitmap)
            if (localRes.lines.isNotEmpty() && localRes.topLine > 0) localRes
            else remote.recognizeText(bitmap)
        } catch (_: Exception) {
            remote.recognizeText(bitmap)
        }
    }

    override fun close() {
        local.close()
        remote.close()
    }
}

class GeminiCloudEngine(
    private val apiKeyProvider: () -> String = { SegmentRecorderService.apiKey },
    var modelName: String = "gemini-2.5-flash",
    private val fallbackLocalEngine: MlKitOcrEngine = MlKitOcrEngine()
) : OcrEngine {
    override val engineType: OcrEngineType = OcrEngineType.GEMINI_CLOUD
    private val apiService by lazy {
        SegmentRecorderService.instance?.getGeminiApiService() ?: GeminiApiService(apiKeyProvider)
    }

    override suspend fun getEngineType(): EngineType = OcrEngineType.GEMINI_CLOUD

    override suspend fun extractText(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> = runCatching {
        val apiKey = apiKeyProvider().trim()
        if (apiKey.isEmpty()) {
            return@runCatching fallbackLocalEngine.extractText(bitmap, topLine, bottomLine).getOrThrow()
        }
        apiService.extractCodeFromBitmap(bitmap, topLine, bottomLine, modelName)
    }

    override suspend fun recognizeText(bitmap: Bitmap): OcrResult {
        return try {
            val text = extractText(bitmap, 0, 0).getOrThrow()
            val rawLines = text.lines().filter { it.isNotBlank() }
            val ocrLines = rawLines.mapIndexed { idx, lineText ->
                val num = lineText.trim().takeWhile { it.isDigit() }.toIntOrNull()
                OcrLine(
                    text = lineText,
                    lineNumber = num,
                    box = BoundingBox(0, idx * 32, bitmap.width, (idx + 1) * 32),
                    confidence = 0.98f
                )
            }
            val tLine = ocrLines.mapNotNull { it.lineNumber }.minOrNull() ?: 0
            val bLine = ocrLines.mapNotNull { it.lineNumber }.maxOrNull() ?: 0
            OcrResult(
                fullText = text,
                blocks = listOf(OcrBlock(text, ocrLines)),
                lines = ocrLines,
                topLine = tLine,
                bottomLine = bLine,
                confidence = 0.98f,
                engineUsed = OcrEngineType.GEMINI_CLOUD
            )
        } catch (_: Exception) {
            fallbackLocalEngine.recognizeText(bitmap)
        }
    }

    override fun close() {
        fallbackLocalEngine.close()
    }
}

class OllamaLocalEngine(
    var ollamaHost: String = "192.168.86.83:11434",
    var modelName: String = "minicpm-v",
    var timeoutSeconds: Long = 5L,
    private val cloudFallback: GeminiCloudEngine = GeminiCloudEngine(),
    private val mlkitFallback: MlKitOcrEngine = MlKitOcrEngine()
) : OcrEngine {
    override val engineType: OcrEngineType = OcrEngineType.OLLAMA_LOCAL
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
        .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
        .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
        .build()

    override suspend fun getEngineType(): EngineType = OcrEngineType.OLLAMA_LOCAL

    private fun isGeminiConfigured(): Boolean = SegmentRecorderService.apiKey.trim().isNotEmpty()

    override suspend fun extractText(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> {
        return try {
            withTimeout(timeoutSeconds * 1000L) {
                performOllamaExtraction(bitmap, topLine, bottomLine).getOrThrow()
            }.let { Result.success(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Ollama local execution failed or timed out (>5s: ${e.message}). Triggering fallback...")
            if (isGeminiConfigured()) {
                Log.i(TAG, "Falling back to Gemini Cloud API")
                cloudFallback.extractText(bitmap, topLine, bottomLine)
            } else {
                Log.i(TAG, "Gemini not configured, falling back to ML Kit")
                mlkitFallback.extractText(bitmap, topLine, bottomLine)
            }
        }
    }

    private suspend fun performOllamaExtraction(bitmap: Bitmap, topLine: Int, bottomLine: Int): Result<String> = runCatching {
        withContext(Dispatchers.IO) {
            val baos = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
            val base64Img = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

            val prompt = if (topLine > 0 && bottomLine >= topLine) {
                "Extract code lines $topLine to $bottomLine verbatim. Enforce strict structured output: 'LINE_NUM: code_content' line by line with no markdown code blocks or explanations."
            } else {
                "Extract all visible code lines verbatim with gutter numbers. Enforce strict structured output: 'LINE_NUM: code_content' line by line with no markdown code blocks or explanations."
            }

            val rootObj = JSONObject().apply {
                put("model", modelName)
                put("prompt", prompt)
                put("images", JSONArray().apply { put(base64Img) })
                put("stream", true)
                put("options", JSONObject().apply {
                    put("temperature", 0.05)
                    put("num_predict", 1024)
                })
            }

            val targetUrl = if (ollamaHost.startsWith("http://") || ollamaHost.startsWith("https://")) {
                "${ollamaHost.trimEnd('/')}/api/generate"
            } else {
                "http://${ollamaHost.trimEnd('/')}/api/generate"
            }

            val request = Request.Builder()
                .url(targetUrl)
                .post(rootObj.toString().toRequestBody("application/json".toMediaType()))
                .build()

            val fullTextBuilder = StringBuilder()
            httpClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    val errBody = resp.body?.string() ?: ""
                    throw IOException("Ollama HTTP ${resp.code}: $errBody")
                }

                val stream = resp.body?.byteStream() ?: throw IOException("Empty response body")
                val reader = BufferedReader(InputStreamReader(stream))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    val trimmed = line?.trim() ?: continue
                    if (trimmed.isEmpty()) continue
                    try {
                        val chunk = JSONObject(trimmed)
                        val token = chunk.optString("response", "")
                        if (token.isNotEmpty()) {
                            fullTextBuilder.append(token)
                        }
                        if (chunk.optBoolean("done", false)) {
                            break
                        }
                    } catch (_: Exception) {}
                }
            }

            val res = fullTextBuilder.toString().trim()
            if (res.isEmpty()) throw IOException("Ollama returned empty response")
            res
        }
    }

    override suspend fun recognizeText(bitmap: Bitmap): OcrResult {
        return try {
            withTimeout(timeoutSeconds * 1000L) {
                val text = performOllamaExtraction(bitmap, 0, 0).getOrThrow()
                val rawLines = text.lines().filter { it.isNotBlank() }
                val lineRegex = Regex("""^\s*(\d+)\s*[:|]\s?(.*)$""")
                val ocrLines = rawLines.mapIndexed { idx, lineText ->
                    val match = lineRegex.find(lineText)
                    val num = match?.groupValues?.get(1)?.toIntOrNull() ?: lineText.trim().takeWhile { it.isDigit() }.toIntOrNull()
                    val codeContent = if (match != null) match.groupValues[2] else lineText
                    OcrLine(
                        text = codeContent,
                        lineNumber = num,
                        box = BoundingBox(0, idx * 32, bitmap.width, (idx + 1) * 32),
                        confidence = 0.95f
                    )
                }
                val tLine = ocrLines.mapNotNull { it.lineNumber }.minOrNull() ?: 0
                val bLine = ocrLines.mapNotNull { it.lineNumber }.maxOrNull() ?: 0
                OcrResult(
                    fullText = text,
                    blocks = listOf(OcrBlock(text, ocrLines)),
                    lines = ocrLines,
                    topLine = tLine,
                    bottomLine = bLine,
                    confidence = 0.95f,
                    engineUsed = OcrEngineType.OLLAMA_LOCAL
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Ollama local recognizeText failed or timed out (>5s: ${e.message}). Triggering fallback...")
            if (isGeminiConfigured()) {
                Log.i(TAG, "Falling back to Gemini Cloud API for recognizeText")
                cloudFallback.recognizeText(bitmap)
            } else {
                Log.i(TAG, "Gemini not configured, falling back to ML Kit for recognizeText")
                mlkitFallback.recognizeText(bitmap)
            }
        }
    }

    override fun close() {
        cloudFallback.close()
        mlkitFallback.close()
    }

    companion object {
        private const val TAG = "OllamaLocalEngine"
    }
}

class OcrEngineSelector(initialConfig: OcrEngineConfig = OcrEngineConfig()) {
    private val _config = MutableStateFlow(initialConfig)
    val config = _config.asStateFlow()

    @Volatile
    var activeEngine: OcrEngine = createEngine(initialConfig)
        private set

    fun updateConfig(newConfig: OcrEngineConfig) {
        if (_config.value != newConfig) {
            activeEngine.close()
            activeEngine = createEngine(newConfig)
            _config.value = newConfig
        }
    }

    fun setEngineType(type: OcrEngineType) = updateConfig(_config.value.copy(type = type))
    fun setEngineMode(mode: EngineMode) = setEngineType(mode.toOcrEngineType())
    fun setServerHost(host: String) = updateConfig(_config.value.copy(serverHost = host, ollamaHost = "${host.substringBefore(":")}:11434"))

    companion object {
        fun createEngine(config: OcrEngineConfig): OcrEngine = when (config.type) {
            OcrEngineType.MLKIT -> MlKitOcrEngine()
            OcrEngineType.FASTAPI_SERVER -> ServerOcrEngine(config.serverHost)
            OcrEngineType.HYBRID -> HybridOcrEngine(MlKitOcrEngine(), ServerOcrEngine(config.serverHost))
            OcrEngineType.GEMINI_CLOUD -> GeminiCloudEngine()
            OcrEngineType.OLLAMA_LOCAL -> OllamaLocalEngine(config.ollamaHost)
        }
    }
}

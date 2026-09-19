package com.matrixcapture.app.data

import android.content.Context
import android.content.SharedPreferences
import com.matrixcapture.app.ocr.OcrEngineType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class PipelineMode(val label: String, val badge: String) {
    CLOUD_GEMINI("Cloud (Gemini)", "CLOUD"),
    LOCAL_PIPELINE("Local (ML Kit + Ollama)", "LOCAL");

    fun toEngineMode(): EngineMode = when (this) {
        CLOUD_GEMINI -> EngineMode.CLOUD_GEMINI
        LOCAL_PIPELINE -> EngineMode.LOCAL_OLLAMA
    }

    companion object {
        fun fromString(str: String?): PipelineMode =
            entries.firstOrNull { it.name.equals(str, true) || it.badge.equals(str, true) } ?: CLOUD_GEMINI
    }
}

enum class EngineMode(val label: String) {
    CLOUD_GEMINI("Cloud (Gemini)"),
    LOCAL_OLLAMA("Local (Ollama)"),
    HYBRID_AUTO("Hybrid (Auto)");

    fun toOcrEngineType(): OcrEngineType = when (this) {
        CLOUD_GEMINI -> OcrEngineType.GEMINI_CLOUD
        LOCAL_OLLAMA -> OcrEngineType.OLLAMA_LOCAL
        HYBRID_AUTO -> OcrEngineType.HYBRID
    }

    companion object {
        fun fromString(str: String?): EngineMode = entries.firstOrNull {
            it.name.equals(str, true) ||
            (str?.contains("cloud", true) == true && it == CLOUD_GEMINI) ||
            (str?.contains("ollama", true) == true && it == LOCAL_OLLAMA) ||
            (str?.contains("hybrid", true) == true && it == HYBRID_AUTO)
        } ?: CLOUD_GEMINI
    }
}

class SettingsRepository private constructor(context: Context) {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _pipelineMode = MutableStateFlow(
        PipelineMode.fromString(prefs.getString(KEY_PIPELINE_MODE, PipelineMode.CLOUD_GEMINI.name))
    )
    val pipelineMode: StateFlow<PipelineMode> = _pipelineMode.asStateFlow()

    private val _engineMode = MutableStateFlow(
        EngineMode.fromString(prefs.getString(KEY_ENGINE_MODE, EngineMode.CLOUD_GEMINI.name))
    )
    val engineMode: StateFlow<EngineMode> = _engineMode.asStateFlow()

    private val _serverHost = MutableStateFlow(
        prefs.getString(KEY_SERVER_HOST, "192.168.86.83:8000") ?: "192.168.86.83:8000"
    )
    val serverHost: StateFlow<String> = _serverHost.asStateFlow()

    fun setPipelineMode(mode: PipelineMode) {
        if (_pipelineMode.value != mode) {
            _pipelineMode.value = mode
            prefs.edit().putString(KEY_PIPELINE_MODE, mode.name).apply()
            setEngineMode(mode.toEngineMode())
        }
    }

    fun togglePipelineMode(): PipelineMode {
        val next = if (_pipelineMode.value == PipelineMode.CLOUD_GEMINI) PipelineMode.LOCAL_PIPELINE else PipelineMode.CLOUD_GEMINI
        setPipelineMode(next)
        return next
    }

    fun setEngineMode(mode: EngineMode) {
        if (_engineMode.value != mode) {
            _engineMode.value = mode
            prefs.edit().putString(KEY_ENGINE_MODE, mode.name).apply()
        }
    }

    fun toggleEngineMode(): EngineMode {
        val nextMode = when (_engineMode.value) {
            EngineMode.CLOUD_GEMINI -> EngineMode.LOCAL_OLLAMA
            EngineMode.LOCAL_OLLAMA -> EngineMode.HYBRID_AUTO
            EngineMode.HYBRID_AUTO -> EngineMode.CLOUD_GEMINI
        }
        setEngineMode(nextMode)
        return nextMode
    }

    fun setServerHost(host: String) {
        if (_serverHost.value != host) {
            _serverHost.value = host
            prefs.edit().putString(KEY_SERVER_HOST, host).apply()
        }
    }

    companion object {
        private const val PREFS_NAME = "matrix_capture_prefs"
        private const val KEY_PIPELINE_MODE = "pipeline_mode"
        private const val KEY_ENGINE_MODE = "engine_mode"
        private const val KEY_SERVER_HOST = "server_host"

        @Volatile
        private var INSTANCE: SettingsRepository? = null

        fun getInstance(context: Context): SettingsRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SettingsRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}

package com.matrixcapture.app.service

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.*
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.matrixcapture.app.network.FrameUploadClient
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class FloatingOverlayService : Service(), LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {
    private lateinit var windowManager: WindowManager
    private var composeView: ComposeView? = null
    private lateinit var layoutParams: WindowManager.LayoutParams
    private var wakeLock: PowerManager.WakeLock? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var telemetryJob: Job? = null
    private var lastExecutedCommand: String? = null
    private val lifecycleRegistry = LifecycleRegistry(this)
    private val savedStateRegistryController = SavedStateRegistryController.create(this)
    private val store = ViewModelStore()

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore get() = store
    override val savedStateRegistry: SavedStateRegistry get() = savedStateRegistryController.savedStateRegistry
    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        runCatching {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "MatrixCapture:OverlayWakeLock"
                )
            }
            if (wakeLock?.isHeld == false) wakeLock?.acquire()
        }
    }

    private fun releaseWakeLock() {
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        savedStateRegistryController.performRestore(null)
        listOf(Lifecycle.Event.ON_CREATE, Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME).forEach(lifecycleRegistry::handleLifecycleEvent)
        acquireWakeLock()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        initOverlayView()
        _isOverlayRunning.value = true

        telemetryJob = serviceScope.launch {
            val uploadClient = getUploadClient(this@FloatingOverlayService)
            while (isActive) {
                delay(1000)
                try {
                    val pState = DesktopPaginationService.telemetry.value
                    val isRunning = DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running
                    val geminiApi = SegmentRecorderService.instance?.getGeminiApiService()
                    val dev = DesktopPaginationService.deviceModel.value.resolve()
                    val isOnline = uploadClient.sendTelemetry(
                        FrameUploadClient.TelemetryData(
                            deviceId = "${dev.displayName} Desktop (HUD Active)",
                            isPacing = isRunning,
                            currentPage = pState.currentPage,
                            currentTopLine = pState.currentTopLine,
                            currentBottomLine = pState.currentBottomLine,
                            targetTotalLines = pState.targetTotalLines,
                            dwellCountdownMs = pState.dwellRemainingMs.toInt(),
                            phase = pState.phase,
                            activeStep = pState.activeStep,
                            source = "hud",
                            statusMessage = pState.statusMessage,
                            mobilePromptTokens = geminiApi?.mobilePromptTokens?.get() ?: 0,
                            mobileCandidatesTokens = geminiApi?.mobileCandidatesTokens?.get() ?: 0,
                            mobileTotalTokens = geminiApi?.mobileTotalTokens?.get() ?: 0,
                            autoTuneFactor = pState.autoTuneFactor,
                            linePitchPx = pState.linePitchPx,
                            bottomToTopError = pState.bottomToTopError,
                            wrappedLinesDetected = pState.wrappedLinesDetected
                        )
                    )
                    isBackendOnline.value = isOnline
                    uploadClient.fetchOrchestrationState().getOrNull()?.let { ro ->
                        remoteOrchestration.value = ro
                        val cmdKey = "${ro.command}_${ro.updatedAt.ifEmpty { ro.stepLabel }}"
                        if (ro.command != "NONE" && lastExecutedCommand != cmdKey) {
                            lastExecutedCommand = cmdKey
                            when (ro.command) {
                                "PAUSE" -> DesktopPaginationService.instance?.pausePagination()
                                "RESUME" -> DesktopPaginationService.instance?.resumePagination()
                                "END" -> DesktopPaginationService.instance?.stopPagination()
                                "RESTART" -> serviceScope.launch { DesktopPaginationService.instance?.restartFromBeginning() }
                                "CTRL_END" -> serviceScope.launch { DesktopPaginationService.instance?.dispatchKeyCombination(0, 113, 123) }
                                "CTRL_HOME" -> serviceScope.launch { DesktopPaginationService.instance?.dispatchKeyCombination(0, 113, 122) }
                                "CALIBRATE" -> serviceScope.launch { DesktopPaginationService.instance?.performInstantCalibration() }
                            }
                        }
                    }
                } catch (e: Exception) {
                    isBackendOnline.value = false
                    Log.w(TAG, "HUD telemetry error: ${e.message}")
                }
            }
        }
    }

    @SuppressLint("RtlHardcoded")
    private fun initOverlayView() {
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        // Minimal non-focusable pill anchored at top-right chrome margin (y = 8px), well above the editor viewport (y: 280..960)
        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 16
            y = 8
        }

        composeView = ComposeView(this).apply {
            setViewTreeLifecycleOwner(this@FloatingOverlayService)
            setViewTreeViewModelStoreOwner(this@FloatingOverlayService)
            setViewTreeSavedStateRegistryOwner(this@FloatingOverlayService)
            setContent {
                MinimalHudPill(
                    onDrag = { dx, dy ->
                        this@FloatingOverlayService.layoutParams.x -= dx.toInt()
                        this@FloatingOverlayService.layoutParams.y = (this@FloatingOverlayService.layoutParams.y + dy.toInt()).coerceIn(0, 180)
                        windowManager.updateViewLayout(this@apply, this@FloatingOverlayService.layoutParams)
                    },
                    onClose = { stopSelf() }
                )
            }
        }
        windowManager.addView(composeView, layoutParams)
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        telemetryJob?.cancel()
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                getUploadClient(this@FloatingOverlayService).sendTelemetry(
                    FrameUploadClient.TelemetryData(
                        deviceId = "Pixel Desktop (Standby)",
                        isPacing = false,
                        phase = "STANDBY",
                        statusMessage = "HUD Closed"
                    )
                )
            }.also { serviceScope.cancel() }
        }
        listOf(Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_DESTROY).forEach(lifecycleRegistry::handleLifecycleEvent)
        store.clear()
        composeView?.let { windowManager.removeView(it) }
        composeView = null
        _isOverlayRunning.value = false
        instance = null
    }

    companion object {
        private const val TAG = "FloatingOverlayService"
        var instance: FloatingOverlayService? = null; private set
        private val _isOverlayRunning = MutableStateFlow(false)
        val isOverlayRunning = _isOverlayRunning.asStateFlow()
        val isBackendOnline = MutableStateFlow(false)
        val remoteOrchestration = MutableStateFlow<FrameUploadClient.OrchestrationState?>(null)

        fun getUploadClient(ctx: Context): FrameUploadClient {
            val prefs = ctx.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
            return FrameUploadClient(prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000")
        }

        fun start(context: Context) = context.startService(Intent(context, FloatingOverlayService::class.java))
        fun stop(context: Context) = context.stopService(Intent(context, FloatingOverlayService::class.java))
    }
}

@Composable
fun MinimalHudPill(onDrag: (Float, Float) -> Unit, onClose: () -> Unit) {
    val paginationState by DesktopPaginationService.paginationState.collectAsState()
    val telemetry by DesktopPaginationService.telemetry.collectAsState()
    val currentPage by DesktopPaginationService.currentPage.collectAsState()
    val remoteOrch by FloatingOverlayService.remoteOrchestration.collectAsState()
    val isOnline by FloatingOverlayService.isBackendOnline.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val isRunning = paginationState == DesktopPaginationService.PaginationState.Running || remoteOrch?.status == "RUNNING"
    val isPaused = paginationState == DesktopPaginationService.PaginationState.Paused || remoteOrch?.status == "PAUSED"
    val dotColor = when {
        isRunning -> Color(0xFF00FF9D)
        isPaused -> Color(0xFFD29922)
        isOnline -> Color(0xFF58A6FF)
        else -> Color(0xFF8B949E)
    }

    val pageNum = if (telemetry.currentPage > 0) telemetry.currentPage else currentPage
    val lineRange = if (telemetry.currentTopLine > 0) "Ln ${telemetry.currentTopLine}→${telemetry.currentBottomLine}" else "Ready"

    fun sendCmd(cmd: String, localAction: () -> Unit = {}) {
        coroutineScope.launch {
            FloatingOverlayService.getUploadClient(context).sendOrchestrationCommand(cmd, "hud")
            localAction()
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.92f)),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier
            .pointerInput(Unit) {
                detectDragGestures { change, dragAmount ->
                    change.consume()
                    onDrag(dragAmount.x, dragAmount.y)
                }
            }
            .border(1.dp, dotColor.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(dotColor))
            Text(
                "P$pageNum • $lineRange",
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )

            // Play / Pause toggle
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(if (isRunning) Color(0xFFD29922) else Color(0xFF00FF9D))
                    .clickable {
                        if (isRunning) {
                            sendCmd("PAUSE") { DesktopPaginationService.instance?.pausePagination() }
                        } else if (isPaused) {
                            sendCmd("RESUME") { DesktopPaginationService.instance?.resumePagination() }
                        } else {
                            sendCmd("RUN_DAG_CAPTURE")
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isRunning) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isRunning) "Pause" else "Run",
                    tint = Color.Black,
                    modifier = Modifier.size(13.dp)
                )
            }

            // Stop button when active
            if (isRunning || isPaused) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFDA3633))
                        .clickable {
                            sendCmd("END") { DesktopPaginationService.instance?.stopPagination() }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Stop,
                        contentDescription = "Stop",
                        tint = Color.White,
                        modifier = Modifier.size(13.dp)
                    )
                }
            }

            // Close pill button
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .clickable { onClose() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close HUD",
                    tint = Color(0xFF8B949E),
                    modifier = Modifier.size(13.dp)
                )
            }
        }
    }
}

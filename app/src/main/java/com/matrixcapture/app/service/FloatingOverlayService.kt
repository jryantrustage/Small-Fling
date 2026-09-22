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
import android.view.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.*
import androidx.savedstate.*
import com.matrixcapture.app.data.EngineMode
import com.matrixcapture.app.data.PipelineMode
import com.matrixcapture.app.data.SettingsRepository
import com.matrixcapture.app.network.FrameUploadClient
import com.matrixcapture.app.ocr.OcrEngineType
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
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP, "MatrixCapture:OverlayWakeLock")
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(120 * 60 * 1000L)
                Log.i(TAG, "Screen WakeLock acquired in FloatingOverlayService.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock in FloatingOverlayService", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i(TAG, "Screen WakeLock released in FloatingOverlayService.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release wake lock in FloatingOverlayService", e)
        }
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
        Log.i(TAG, "FloatingOverlayService created and HUD initialized.")

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
                            deviceId = "${dev.displayName} Desktop (HUD Active)", isPacing = isRunning,
                            currentPage = pState.currentPage, currentTopLine = pState.currentTopLine,
                            currentBottomLine = pState.currentBottomLine, targetTotalLines = pState.targetTotalLines,
                            dwellCountdownMs = pState.dwellRemainingMs.toInt(), phase = pState.phase,
                            activeStep = pState.activeStep, source = "hud", statusMessage = pState.statusMessage,
                            mobilePromptTokens = geminiApi?.mobilePromptTokens?.get() ?: 0,
                            mobileCandidatesTokens = geminiApi?.mobileCandidatesTokens?.get() ?: 0,
                            mobileTotalTokens = geminiApi?.mobileTotalTokens?.get() ?: 0,
                            autoTuneFactor = pState.autoTuneFactor, linePitchPx = pState.linePitchPx,
                            bottomToTopError = pState.bottomToTopError, wrappedLinesDetected = pState.wrappedLinesDetected
                        )
                    )
                    isBackendOnline.value = isOnline
                    uploadClient.fetchOrchestrationState().getOrNull()?.let { ro ->
                        remoteOrchestration.value = ro
                        val cmdKey = "${ro.command}_${ro.updatedAt.ifEmpty { ro.stepLabel }}"
                        if (ro.command != "NONE" && lastExecutedCommand != cmdKey) {
                            lastExecutedCommand = cmdKey
                            Log.i(TAG, "HUD executing remote command: ${ro.command} (source=${ro.source}, key=$cmdKey)")
                            when (ro.command) {
                                "CAPTURE_DESKTOP" -> {
                                    serviceScope.launch {
                                        DesktopPaginationService.updateStatus("Remote: Capturing desktop screen...")
                                        val ps = DesktopPaginationService.instance
                                        val dId = ps?.resolveTargetDisplayId() ?: 0
                                        val snap = ps?.captureScreenshot(dId)
                                            ?: SegmentRecorderService.instance?.getCaptureManager()?.captureSettledSnapshot()
                                            ?: DesktopPaginationService.latestCapturedBitmap
                                        if (snap != null) {
                                            DesktopPaginationService.latestCapturedBitmap = snap
                                            val resolvedDevice = DesktopPaginationService.deviceModel.value.resolve()
                                            val top = if (pState.currentTopLine > 0) pState.currentTopLine else 1
                                            val bot = if (pState.currentBottomLine > 0) pState.currentBottomLine else resolvedDevice.linesPerPage
                                            val page = if (pState.currentPage > 0) pState.currentPage else 1
                                            val res = uploadClient.uploadFrame(snap, top, bot, page, sync = true)
                                            DesktopPaginationService.updateStatus("Desktop Captured ✔ (Ln ${res.topLine}-${res.bottomLine})")
                                            Log.i(TAG, "Remote capture uploaded: ${res.success}, lines=${res.topLine}-${res.bottomLine}")
                                        }
                                    }
                                }
                                "BEGIN_AUTO_FLIPPING", "BEGIN" -> {
                                    DesktopPaginationService.instance?.startPacingEngine(totalLines = pState.targetTotalLines)
                                }
                                "PAUSE" -> DesktopPaginationService.instance?.pausePagination()
                                "RESUME" -> DesktopPaginationService.instance?.resumePagination()
                                "END" -> DesktopPaginationService.instance?.stopPagination()
                                "RESTART" -> serviceScope.launch { DesktopPaginationService.instance?.restartFromBeginning() }
                            }
                        }
                    }
                    Log.d(TAG, "HUD telemetry sent: Pg=${pState.currentPage}, Ln=${pState.currentTopLine}-${pState.currentBottomLine}, Pacing=$isRunning, Online=$isOnline")
                } catch (e: Exception) {
                    isBackendOnline.value = false
                    Log.w(TAG, "Failed to send telemetry update: ${e.message}")
                }
            }
        }
    }

    fun setOverlayFocusable(focusable: Boolean) {
        try {
            val flag = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            layoutParams.flags = if (focusable) layoutParams.flags and flag.inv() else layoutParams.flags or flag
            composeView?.let { windowManager.updateViewLayout(it, layoutParams) }
            Log.i(TAG, "Overlay focusable set to $focusable")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update overlay focusable", e)
        }
    }

    @SuppressLint("RtlHardcoded")
    private fun initOverlayView() {
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = 40; y = 120 }

        composeView = ComposeView(this).apply {
            setViewTreeLifecycleOwner(this@FloatingOverlayService)
            setViewTreeViewModelStoreOwner(this@FloatingOverlayService)
            setViewTreeSavedStateRegistryOwner(this@FloatingOverlayService)
            setContent {
                FloatingHudOverlay(
                    onDrag = { dx, dy ->
                        this@FloatingOverlayService.layoutParams.x += dx.toInt()
                        this@FloatingOverlayService.layoutParams.y += dy.toInt()
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
        Log.i(TAG, "FloatingOverlayService onDestroy. Releasing resources and sending standby telemetry...")
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                getUploadClient(this@FloatingOverlayService).sendTelemetry(
                    FrameUploadClient.TelemetryData(deviceId = "Pixel 10 Desktop (Standby)", isPacing = false, phase = "STANDBY", statusMessage = "Pacer Standby / Closed")
                )
            }.also { serviceScope.cancel() }
        }
        listOf(Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_DESTROY).forEach(lifecycleRegistry::handleLifecycleEvent)
        store.clear()
        composeView?.let { windowManager.removeView(it) }
        composeView = null
        _isOverlayRunning.value = false
        instance = null
        Log.i(TAG, "FloatingOverlayService destroyed successfully.")
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
fun FloatingHudOverlay(onDrag: (Float, Float) -> Unit, onClose: () -> Unit) {
    var isExpanded by remember { mutableStateOf(false) }
    val paginationState by DesktopPaginationService.paginationState.collectAsState()
    val telemetry by DesktopPaginationService.telemetry.collectAsState()
    val currentPage by DesktopPaginationService.currentPage.collectAsState()
    val calculatedTotalLines by DesktopPaginationService.calculatedTotalLines.collectAsState()
    val dwellRemainingMs by DesktopPaginationService.dwellCountdownMs.collectAsState()
    val remoteOrch by FloatingOverlayService.remoteOrchestration.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val settingsRepo = remember { SettingsRepository.getInstance(context) }
    val pipelineMode by settingsRepo.pipelineMode.collectAsState()
    val engineMode by settingsRepo.engineMode.collectAsState()
    val isCloud = pipelineMode == PipelineMode.CLOUD_GEMINI
    val pipeCol = if (isCloud) Color(0xFF79C0FF) else Color(0xFF00FF9D)

    Box(modifier = Modifier.pointerInput(Unit) { detectDragGestures { change, dragAmount -> change.consume(); onDrag(dragAmount.x, dragAmount.y) } }) {
        if (!isExpanded) {
            Card(
                onClick = { isExpanded = true },
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.94f)),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(24.dp)).padding(2.dp)
            ) {
                Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(if (paginationState == DesktopPaginationService.PaginationState.Running) Color(0xFF00FF9D) else Color(0xFF8B949E)))
                    Text("Pg #${if (telemetry.currentPage > 0) telemetry.currentPage else currentPage}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Text(if (telemetry.currentTopLine > 0) "Ln ${telemetry.currentTopLine}-${telemetry.currentBottomLine}" else "Ln: Awaiting Capture", color = if (telemetry.currentTopLine > 0) Color(0xFF00FF9D) else Color(0xFF8B949E), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Box(
                        modifier = Modifier
                            .border(1.dp, pipeCol.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                            .background(pipeCol.copy(alpha = 0.15f))
                            .clickable {
                                val next = settingsRepo.togglePipelineMode()
                                Log.i("FloatingOverlayService", "HUD pill toggled pipeline mode: ${next.label}")
                                coroutineScope.launch {
                                    FloatingOverlayService.getUploadClient(context).setServerPipelineMode(if (next == PipelineMode.CLOUD_GEMINI) "cloud" else "local")
                                }
                            }
                            .padding(horizontal = 5.dp, vertical = 1.dp)
                    ) {
                        Text(if (isCloud) "☁️ CLOUD" else "⚡ LOCAL", color = pipeCol, fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                    }
                    if (dwellRemainingMs > 0) Text("${dwellRemainingMs}ms", color = Color(0xFF58A6FF), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                    Icon(Icons.Default.OpenInFull, "Expand", tint = Color.LightGray, modifier = Modifier.size(14.dp))
                }
            }
        } else {
            var showSettings by remember { mutableStateOf(false) }
            var isCapturing by remember { mutableStateOf(false) }
            var isAligningNext by remember { mutableStateOf(false) }
            var isGettingNextLine by remember { mutableStateOf(false) }
            val displayPage = if (telemetry.currentPage > 0) telemetry.currentPage else (if (currentPage > 0) currentPage else 1)
            val devModel by DesktopPaginationService.deviceModel.collectAsState()
            val resolvedDevice = devModel.resolve()
            val topLn = if (telemetry.currentTopLine > 0) telemetry.currentTopLine else 1
            val botLn = if (telemetry.currentBottomLine > 0) telemetry.currentBottomLine else resolvedDevice.linesPerPage
            val targetVal = if (telemetry.targetTotalLines > 0) telemetry.targetTotalLines else (if (calculatedTotalLines > 0) calculatedTotalLines else 0)
            val isRunning = paginationState is DesktopPaginationService.PaginationState.Running
            val isPaused = paginationState is DesktopPaginationService.PaginationState.Paused

            fun sendCmd(cmd: String, action: () -> Unit) = coroutineScope.launch {
                Log.i("FloatingOverlayService", "HUD sending orchestration command: $cmd")
                FloatingOverlayService.getUploadClient(context).sendOrchestrationCommand(cmd, "hud")
                action()
            }

            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.96f)), shape = RoundedCornerShape(16.dp), modifier = Modifier.width(330.dp).border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(16.dp))) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            val (badgeTxt, badgeCol) = when {
                                isRunning -> "RUNNING" to Color(0xFF00FF9D)
                                isPaused -> "PAUSED" to Color(0xFFE3B341)
                                else -> "IDLE" to Color(0xFF8B949E)
                            }
                            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(badgeCol))
                            Text("MATRIX HUD", color = Color(0xFF00FF9D), fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp)
                            Box(modifier = Modifier.border(1.dp, badgeCol.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).background(badgeCol.copy(alpha = 0.1f)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                                Text(badgeTxt, color = badgeCol, fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                            }
                            Box(
                                modifier = Modifier
                                    .border(1.dp, pipeCol.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                                    .background(pipeCol.copy(alpha = 0.15f))
                                    .clickable {
                                        val next = settingsRepo.togglePipelineMode()
                                        Log.i("FloatingOverlayService", "HUD header toggled pipeline mode: ${next.label}")
                                        coroutineScope.launch {
                                            FloatingOverlayService.getUploadClient(context).setServerPipelineMode(if (next == PipelineMode.CLOUD_GEMINI) "cloud" else "local")
                                        }
                                    }
                                    .padding(horizontal = 5.dp, vertical = 2.dp)
                            ) {
                                Text(if (isCloud) "☁️ CLOUD" else "⚡ LOCAL", color = pipeCol, fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(onClick = { showSettings = !showSettings }, modifier = Modifier.size(26.dp)) { Icon(Icons.Default.Settings, "Settings", tint = if (showSettings) Color(0xFF00FF9D) else Color.LightGray, modifier = Modifier.size(15.dp)) }
                            IconButton(onClick = { isExpanded = false }, modifier = Modifier.size(26.dp)) { Icon(Icons.Default.CloseFullscreen, "Minimize", tint = Color.LightGray, modifier = Modifier.size(15.dp)) }
                            IconButton(onClick = onClose, modifier = Modifier.size(26.dp)) { Icon(Icons.Default.Close, "Close", tint = Color(0xFFFF7B72), modifier = Modifier.size(15.dp)) }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Column(modifier = Modifier.fillMaxWidth().background(Color(0xFF161B22), RoundedCornerShape(10.dp)).border(1.dp, Color(0xFF30363D), RoundedCornerShape(10.dp)).padding(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("Page $displayPage", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            Text("Ln $topLn → $botLn", color = Color(0xFF00FF9D), fontSize = 15.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                        remoteOrch?.stepLabel?.takeIf { it.isNotEmpty() }?.let {
                            Spacer(modifier = Modifier.height(3.dp))
                            Text("DAG: $it", color = Color(0xFFFFA657), fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                        if (telemetry.statusMessage.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(telemetry.statusMessage, color = Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace, maxLines = 1)
                        }
                        if (dwellRemainingMs > 0) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("DWELL FREEZE", color = Color(0xFF58A6FF), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                                Text("${dwellRemainingMs}ms", color = Color(0xFF58A6FF), fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            LinearProgressIndicator(
                                progress = { (dwellRemainingMs.toFloat() / DesktopPaginationService.DWELL_TIME_MS).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
                                color = Color(0xFF58A6FF), trackColor = Color(0xFF21262D)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        when {
                            !isRunning && !isPaused -> {
                                Button(
                                    onClick = { sendCmd("BEGIN_AUTO_FLIPPING") { DesktopPaginationService.instance?.startPacingEngine(totalLines = targetVal) } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().height(42.dp)
                                ) {
                                    Icon(Icons.Default.PlayArrow, null, tint = Color.Black, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("begin Auto Flipping", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace)
                                }
                            }
                            isRunning -> {
                                Button(
                                    onClick = { sendCmd("PAUSE") { DesktopPaginationService.instance?.pausePagination() } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE3B341)), shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f).height(42.dp)
                                ) {
                                    Icon(Icons.Default.Pause, null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("PAUSE", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                }
                                Button(
                                    onClick = { sendCmd("END") { DesktopPaginationService.instance?.stopPagination() } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72)), shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f).height(42.dp)
                                ) {
                                    Icon(Icons.Default.Stop, null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("END", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                }
                            }
                            else -> {
                                Button(
                                    onClick = { sendCmd("RESUME") { DesktopPaginationService.instance?.resumePagination() } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)), shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f).height(42.dp)
                                ) {
                                    Icon(Icons.Default.PlayArrow, null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("RESUME", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                }
                                Button(
                                    onClick = { sendCmd("END") { DesktopPaginationService.instance?.stopPagination() } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72)), shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f).height(42.dp)
                                ) {
                                    Icon(Icons.Default.Stop, null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("END", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Button(
                            onClick = {
                                isCapturing = true
                                Log.i("FloatingOverlayService", "capture desktop mode clicked in HUD")
                                coroutineScope.launch {
                                    DesktopPaginationService.updateStatus("Capturing desktop screen...")
                                    val ps = DesktopPaginationService.instance
                                    val dId = ps?.resolveTargetDisplayId() ?: 0
                                    val snapshot = ps?.captureScreenshot(dId) ?: SegmentRecorderService.instance?.getCaptureManager()?.captureSettledSnapshot() ?: DesktopPaginationService.latestCapturedBitmap
                                    if (snapshot != null) {
                                        DesktopPaginationService.latestCapturedBitmap = snapshot
                                        val pMode = if (pipelineMode == PipelineMode.CLOUD_GEMINI) "cloud" else "local"
                                        val res = FloatingOverlayService.getUploadClient(context).uploadFrame(snapshot, topLn, botLn, displayPage, sync = true, pipelineMode = pMode, modelTarget = if (pMode == "cloud") "gemini" else "ollama")
                                        DesktopPaginationService.updateStatus(if (res.success) "Desktop Captured ✔ (Ln ${res.topLine}-${res.bottomLine})" else "Upload Failed: ${res.message}")
                                        Log.i("FloatingOverlayService", "Desktop capture uploaded: success=${res.success}, lines=${res.topLine}-${res.bottomLine}")
                                    }
                                    delay(500)
                                    isCapturing = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB)), shape = RoundedCornerShape(8.dp), modifier = Modifier.weight(1.1f).height(38.dp),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                        ) {
                            Text(if (isCapturing) "..." else "capture desktop mode", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, maxLines = 1)
                        }

                        Button(
                            onClick = {
                                isGettingNextLine = true
                                Log.i("FloatingOverlayService", "Get line number of next clicked in HUD")
                                coroutineScope.launch {
                                    DesktopPaginationService.updateStatus("Fetching next line...")
                                    val client = FloatingOverlayService.getUploadClient(context)
                                    val res = client.getNextPageLine()
                                    res.onSuccess { nextLn ->
                                        DesktopPaginationService.updateStatus("Next Line: Ln $nextLn")
                                    }.onFailure { err ->
                                        DesktopPaginationService.updateStatus("Next Ln Err: ${err.message}")
                                    }
                                    delay(400)
                                    isGettingNextLine = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF388BFD).copy(alpha = 0.25f)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF58A6FF)),
                            shape = RoundedCornerShape(8.dp), modifier = Modifier.weight(1f).height(38.dp),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                        ) {
                            Text(if (isGettingNextLine) "..." else "Get line number of next", color = Color(0xFF79C0FF), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, maxLines = 1)
                        }
                    }

                    if (isPaused || (!isRunning && displayPage > 1)) {
                        Spacer(modifier = Modifier.height(6.dp))
                        OutlinedButton(
                            onClick = { sendCmd("RESTART") { coroutineScope.launch { DesktopPaginationService.instance?.restartFromBeginning() } } },
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF58A6FF).copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth().height(34.dp), contentPadding = PaddingValues(0.dp)
                        ) {
                            Icon(Icons.Default.Refresh, null, tint = Color(0xFF58A6FF), modifier = Modifier.size(13.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Restart from Beginning", color = Color(0xFF58A6FF), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                        }
                    }

                    AnimatedVisibility(visible = showSettings) {
                        val activeEngine = SegmentRecorderService.instance?.getGutterTracker()?.ocrEngine?.engineType ?: OcrEngineType.MLKIT
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(top = 10.dp).background(Color(0xFF161B22), RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF30363D), RoundedCornerShape(8.dp)).padding(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("ADVANCED HUD CONTROLS", color = Color(0xFF8B949E), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(Color(0xFF21262D))
                                        .border(1.dp, pipeCol.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                                        .clickable {
                                            val next = settingsRepo.togglePipelineMode()
                                            Log.i("FloatingOverlayService", "HUD settings drawer toggled pipeline mode: ${next.label}")
                                            coroutineScope.launch {
                                                FloatingOverlayService.getUploadClient(context).setServerPipelineMode(if (next == PipelineMode.CLOUD_GEMINI) "cloud" else "local")
                                            }
                                        }
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text("PIPELINE: ${pipelineMode.badge}", color = pipeCol, fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                                }
                            }
                            Button(
                                onClick = {
                                    isAligningNext = true
                                    Log.i("FloatingOverlayService", "Align & Next Page triggered from HUD")
                                    coroutineScope.launch {
                                        DesktopPaginationService.updateStatus("Fetching next line...")
                                        val client = FloatingOverlayService.getUploadClient(context)
                                        val targetTopLine = client.getNextPageLine().getOrNull() ?: (if (botLn > 0) botLn + 1 else 1)
                                        val pagination = DesktopPaginationService.instance
                                        val snapshot = pagination?.alignAndCaptureNextPage(targetTopLine, pagination.resolveTargetDisplayId())
                                        if (snapshot != null) {
                                            DesktopPaginationService.latestCapturedBitmap = snapshot
                                            val nextPage = displayPage + 1
                                            val curTop = DesktopPaginationService.telemetry.value.currentTopLine
                                            val curBot = DesktopPaginationService.telemetry.value.currentBottomLine
                                            val actualTop = if (curTop > 0) curTop else targetTopLine
                                            val actualBot = if (curBot > actualTop) curBot else (actualTop + 44)
                                            client.uploadFrame(snapshot, actualTop, actualBot, nextPage, true)
                                            DesktopPaginationService.updateStatus("Page $nextPage (Ln $actualTop-$actualBot) Aligned & Uploaded ✔")
                                            Log.i("FloatingOverlayService", "Page $nextPage (Ln $actualTop-$actualBot) aligned and uploaded to server.")
                                        }
                                        delay(400)
                                        isAligningNext = false
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636)), shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().height(32.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Text(if (isAligningNext) "Aligning..." else "Next Pg & Align to Top", color = Color.White, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            }
                            if (targetVal > 0) Text("Target Document Length: $targetVal lines", color = Color(0xFF00FF9D), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }
    }
}

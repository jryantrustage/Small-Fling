package com.matrixcapture.app.service

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
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

/**
 * Floating Overlay Service for MatrixCapture.
 *
 * Displays a lightweight, non-jumping, draggable HUD providing real-time telemetry:
 * 1. Accessibility controls (status & direct settings shortcut)
 * 2. Start Settled capture button
 * 3. Line# seeker input with "GO" button and quick steppers
 * 4. Fixed-height dwell freeze indicator (zero jumping)
 */
class FloatingOverlayService : Service(), LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {

    private lateinit var windowManager: WindowManager
    private var composeView: ComposeView? = null
    private lateinit var layoutParams: WindowManager.LayoutParams
    private var wakeLock: PowerManager.WakeLock? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var telemetryJob: Job? = null

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "MatrixCapture:OverlayWakeLock"
                )
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(120 * 60 * 1000L) // 120 min timeout
                Log.i("FloatingOverlayService", "Screen WakeLock acquired in FloatingOverlayService.")
            }
        } catch (e: Exception) {
            Log.e("FloatingOverlayService", "Failed to acquire wake lock in FloatingOverlayService", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i("FloatingOverlayService", "Screen WakeLock released in FloatingOverlayService.")
            }
        } catch (e: Exception) {
            Log.e("FloatingOverlayService", "Failed to release wake lock in FloatingOverlayService", e)
        }
    }

    private val lifecycleRegistry = LifecycleRegistry(this)
    private val savedStateRegistryController = SavedStateRegistryController.create(this)
    private val store = ViewModelStore()

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore get() = store
    override val savedStateRegistry: SavedStateRegistry get() = savedStateRegistryController.savedStateRegistry

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        savedStateRegistryController.performRestore(null)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)

        acquireWakeLock()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        initOverlayView()
        _isOverlayRunning.value = true

        // Persistent foreground telemetry dispatch directly to FastAPI server
        telemetryJob = serviceScope.launch {
            val prefs = getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
            val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
            val uploadClient = FrameUploadClient(serverHost)

            while (isActive) {
                delay(1000)
                try {
                    val pState = DesktopPaginationService.telemetry.value
                    val isRunning = DesktopPaginationService.paginationState.value == DesktopPaginationService.PaginationState.Running
                    val geminiApi = SegmentRecorderService.instance?.getGeminiApiService()
                    val pTokens = geminiApi?.mobilePromptTokens?.get() ?: 0
                    val cTokens = geminiApi?.mobileCandidatesTokens?.get() ?: 0
                    val tTokens = geminiApi?.mobileTotalTokens?.get() ?: 0

                    val ok = uploadClient.sendTelemetry(
                        FrameUploadClient.TelemetryData(
                            deviceId = "Pixel 10 Desktop (HUD Active)",
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
                            mobilePromptTokens = pTokens,
                            mobileCandidatesTokens = cTokens,
                            mobileTotalTokens = tTokens,
                            autoTuneFactor = pState.autoTuneFactor,
                            linePitchPx = pState.linePitchPx,
                            bottomToTopError = pState.bottomToTopError,
                            wrappedLinesDetected = pState.wrappedLinesDetected
                        )
                    )
                    isBackendOnline.value = ok

                    val remoteRes = uploadClient.fetchOrchestrationState()
                    if (remoteRes.isSuccess) {
                        remoteRes.getOrNull()?.let { remoteOrchestration.value = it }
                    }
                } catch (e: Exception) {
                    isBackendOnline.value = false
                }
            }
        }
    }

    fun setOverlayFocusable(focusable: Boolean) {
        try {
            if (focusable) {
                layoutParams.flags = layoutParams.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
            } else {
                layoutParams.flags = layoutParams.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            }
            composeView?.let { windowManager.updateViewLayout(it, layoutParams) }
        } catch (e: Exception) {
            Log.e("FloatingOverlayService", "Failed to update overlay focusable", e)
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

        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 40
            y = 120
        }

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

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                val uploadClient = FrameUploadClient(serverHost)
                uploadClient.sendTelemetry(
                    FrameUploadClient.TelemetryData(
                        deviceId = "Pixel 10 Desktop (Standby)",
                        isPacing = false,
                        phase = "STANDBY",
                        statusMessage = "Pacer Standby / Closed"
                    )
                )
            } catch (_: Exception) {
            } finally {
                serviceScope.cancel()
            }
        }

        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        store.clear()

        composeView?.let {
            windowManager.removeView(it)
        }
        composeView = null
        _isOverlayRunning.value = false
        instance = null
    }

    companion object {
        var instance: FloatingOverlayService? = null
            private set

        private val _isOverlayRunning = MutableStateFlow(false)
        val isOverlayRunning = _isOverlayRunning.asStateFlow()

        val isBackendOnline = MutableStateFlow(false)
        val remoteOrchestration = MutableStateFlow<FrameUploadClient.OrchestrationState?>(null)

        fun start(context: Context) {
            val intent = Intent(context, FloatingOverlayService::class.java)
            context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, FloatingOverlayService::class.java)
            context.stopService(intent)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloatingHudOverlay(
    onDrag: (Float, Float) -> Unit,
    onClose: () -> Unit
) {
    var isExpanded by remember { mutableStateOf(false) }

    val segments by SegmentRecorderService.segmentDetails.collectAsState()
    val recorderState by (SegmentRecorderService.instance?.serviceState ?: MutableStateFlow(SegmentRecorderService.RecorderState())).collectAsState()
    val paginationState by DesktopPaginationService.paginationState.collectAsState()
    val telemetry by DesktopPaginationService.telemetry.collectAsState()
    val currentPage by DesktopPaginationService.currentPage.collectAsState()
    val calculatedTotalLines by DesktopPaginationService.calculatedTotalLines.collectAsState()
    val dwellRemainingMs by DesktopPaginationService.dwellCountdownMs.collectAsState()
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()
    val isAccessibilityActive by DesktopPaginationService.isServiceActive.collectAsState()
    val isBackendOnline by FloatingOverlayService.isBackendOnline.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    // Line Seeker state
    var seekLineText by remember { mutableStateOf("") }
    var isSeeking by remember { mutableStateOf(false) }
    var isCapturingCurrentScreen by remember { mutableStateOf(false) }

    val remoteOrch by FloatingOverlayService.remoteOrchestration.collectAsState()

    Box(
        modifier = Modifier
            .pointerInput(Unit) {
                detectDragGestures { change, dragAmount ->
                    change.consume()
                    onDrag(dragAmount.x, dragAmount.y)
                }
            }
    ) {
        if (!isExpanded) {
            // Minimized Floating Pill Badge
            Card(
                onClick = { isExpanded = true },
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.94f)),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(24.dp))
                    .padding(2.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (paginationState == DesktopPaginationService.PaginationState.Running) Color(0xFF00FF9D) else Color(0xFF8B949E))
                    )
                    Text(
                        text = "Pg #${if (telemetry.currentPage > 0) telemetry.currentPage else currentPage}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = if (telemetry.currentTopLine > 0) "Ln ${telemetry.currentTopLine}-${telemetry.currentBottomLine}" else "Ln: Awaiting Capture",
                        color = if (telemetry.currentTopLine > 0) Color(0xFF00FF9D) else Color(0xFF8B949E),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    if (remoteOrch != null && !remoteOrch?.invokedBy.isNullOrEmpty()) {
                        Text(
                            text = "${remoteOrch?.invokedBy}",
                            color = Color(0xFF79C0FF),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    if (dwellRemainingMs > 0) {
                        Text(
                            text = "${dwellRemainingMs}ms",
                            color = Color(0xFF58A6FF),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Icon(
                        Icons.Default.OpenInFull,
                        contentDescription = "Expand",
                        tint = Color.LightGray,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        } else {
            // Expanded HUD Window - Minimalist "Less is More" Design with Unified Orchestration
            var showSettings by remember { mutableStateOf(false) }
            var isCapturing by remember { mutableStateOf(false) }
            var isAligningNext by remember { mutableStateOf(false) }

            val displayPage = if (telemetry.currentPage > 0) telemetry.currentPage else (if (currentPage > 0) currentPage else 1)
            val topLn = if (telemetry.currentTopLine > 0) telemetry.currentTopLine else 1
            val botLn = if (telemetry.currentBottomLine > 0) telemetry.currentBottomLine else 44
            val targetVal = if (telemetry.targetTotalLines > 0) telemetry.targetTotalLines else (if (calculatedTotalLines > 0) calculatedTotalLines else 0)

            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.96f)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .width(320.dp)
                    .border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    // Title Bar with Drag & Window Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when (paginationState) {
                                            is DesktopPaginationService.PaginationState.Running -> Color(0xFF00FF9D)
                                            is DesktopPaginationService.PaginationState.Paused -> Color(0xFFE3B341)
                                            else -> Color(0xFF8B949E)
                                        }
                                    )
                            )
                            Text(
                                text = "MATRIX HUD",
                                color = Color(0xFF00FF9D),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 1.sp
                            )
                            // Clean Status Badge
                            val statusBadgeText = when (paginationState) {
                                is DesktopPaginationService.PaginationState.Running -> "RUNNING"
                                is DesktopPaginationService.PaginationState.Paused -> "PAUSED"
                                else -> "IDLE"
                            }
                            val statusBadgeColor = when (paginationState) {
                                is DesktopPaginationService.PaginationState.Running -> Color(0xFF00FF9D)
                                is DesktopPaginationService.PaginationState.Paused -> Color(0xFFE3B341)
                                else -> Color(0xFF8B949E)
                            }
                            Box(
                                modifier = Modifier
                                    .border(1.dp, statusBadgeColor.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                                    .background(statusBadgeColor.copy(alpha = 0.1f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = statusBadgeText,
                                    color = statusBadgeColor,
                                    fontSize = 9.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            if (remoteOrch != null && !remoteOrch?.invokedBy.isNullOrEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .border(1.dp, Color(0xFF30363D), RoundedCornerShape(4.dp))
                                        .background(Color(0xFF21262D))
                                        .padding(horizontal = 5.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "${remoteOrch?.invokedBy}",
                                        color = Color(0xFF79C0FF),
                                        fontSize = 9.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(onClick = { showSettings = !showSettings }, modifier = Modifier.size(26.dp)) {
                                Icon(
                                    Icons.Default.Settings,
                                    contentDescription = "Settings",
                                    tint = if (showSettings) Color(0xFF00FF9D) else Color.LightGray,
                                    modifier = Modifier.size(15.dp)
                                )
                            }
                            IconButton(onClick = { isExpanded = false }, modifier = Modifier.size(26.dp)) {
                                Icon(Icons.Default.CloseFullscreen, contentDescription = "Minimize", tint = Color.LightGray, modifier = Modifier.size(15.dp))
                            }
                            IconButton(onClick = onClose, modifier = Modifier.size(26.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFFFF7B72), modifier = Modifier.size(15.dp))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Hero Telemetry: Page # • Ln X → Y
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF161B22), RoundedCornerShape(10.dp))
                            .border(1.dp, Color(0xFF30363D), RoundedCornerShape(10.dp))
                            .padding(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Page $displayPage",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "Ln $topLn → $botLn",
                                color = Color(0xFF00FF9D),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        if (remoteOrch != null && !remoteOrch?.stepLabel.isNullOrEmpty()) {
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = "DAG: ${remoteOrch?.stepLabel}",
                                color = Color(0xFFFFA657),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        if (telemetry.statusMessage.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = telemetry.statusMessage,
                                color = Color(0xFF8B949E),
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1
                            )
                        }

                        // Dwell Freeze Countdown Bar
                        if (dwellRemainingMs > 0) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "DWELL FREEZE",
                                    color = Color(0xFF58A6FF),
                                    fontSize = 9.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${dwellRemainingMs}ms",
                                    color = Color(0xFF58A6FF),
                                    fontSize = 9.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            LinearProgressIndicator(
                                progress = { (dwellRemainingMs.toFloat() / DesktopPaginationService.DWELL_TIME_MS).coerceIn(0f, 1f) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp)),
                                color = Color(0xFF58A6FF),
                                trackColor = Color(0xFF21262D)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Synchronized Orchestration Controls: [Begin] / [Pause] / [Resume] / [End]
                    val isRunning = paginationState is DesktopPaginationService.PaginationState.Running
                    val isPaused = paginationState is DesktopPaginationService.PaginationState.Paused

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (!isRunning && !isPaused) {
                            // [Begin] Button
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        uploadClient.sendOrchestrationCommand("BEGIN", "hud")
                                        val pService = DesktopPaginationService.instance
                                        pService?.startPacingEngine(totalLines = targetVal)
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1.4f)
                                    .height(42.dp)
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.Black, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("BEGIN", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace)
                            }
                        } else if (isRunning) {
                            // [Pause] Button
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        uploadClient.sendOrchestrationCommand("PAUSE", "hud")
                                        DesktopPaginationService.instance?.pausePagination()
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE3B341)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(Icons.Default.Pause, contentDescription = null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("PAUSE", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            }

                            // [End] Button
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        uploadClient.sendOrchestrationCommand("END", "hud")
                                        DesktopPaginationService.instance?.stopPagination()
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("END", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            }
                        } else {
                            // [Resume] Button
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        uploadClient.sendOrchestrationCommand("RESUME", "hud")
                                        DesktopPaginationService.instance?.resumePagination()
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("RESUME", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            }

                            // [End] Button
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        uploadClient.sendOrchestrationCommand("END", "hud")
                                        DesktopPaginationService.instance?.stopPagination()
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = null, tint = Color.Black, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("END", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            }
                        }

                        // [Capt] Single manual snapshot button
                        Button(
                            onClick = {
                                isCapturing = true
                                coroutineScope.launch {
                                    DesktopPaginationService.updateStatus("Capturing screen...")
                                    val activeService = SegmentRecorderService.instance
                                    val cm = activeService?.getCaptureManager()
                                    val snapshot = DesktopPaginationService.instance?.captureScreenshot()
                                        ?: cm?.captureSettledSnapshot()
                                        ?: DesktopPaginationService.latestCapturedBitmap

                                    if (snapshot != null) {
                                        DesktopPaginationService.latestCapturedBitmap = snapshot
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        val res = uploadClient.uploadFrame(
                                            bitmap = snapshot,
                                            topLine = topLn,
                                            bottomLine = botLn,
                                            pageIndex = displayPage,
                                            sync = true
                                        )
                                        if (res.success) {
                                            DesktopPaginationService.updateStatus("Page $displayPage Uploaded ✔ (Ln ${res.topLine}-${res.bottomLine})")
                                        } else {
                                            DesktopPaginationService.updateStatus("Upload Failed: ${res.message}")
                                        }
                                    }
                                    delay(500)
                                    isCapturing = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB)),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(0.9f)
                                .height(42.dp)
                        ) {
                            Text(if (isCapturing) "..." else "CAPT", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                    }

                    // Restart button (when paused or idle)
                    if (isPaused || (!isRunning && displayPage > 1)) {
                        Spacer(modifier = Modifier.height(6.dp))
                        OutlinedButton(
                            onClick = {
                                coroutineScope.launch {
                                    val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                    val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                    val uploadClient = FrameUploadClient(serverHost)
                                    uploadClient.sendOrchestrationCommand("RESTART", "hud")
                                    DesktopPaginationService.instance?.restartFromBeginning()
                                }
                            },
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF58A6FF).copy(alpha = 0.5f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF58A6FF), modifier = Modifier.size(13.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Restart from Beginning", color = Color(0xFF58A6FF), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                        }
                    }

                    // Settings Drawer (Only revealed when ⚙️ gear icon is clicked)
                    AnimatedVisibility(visible = showSettings) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp)
                                .background(Color(0xFF161B22), RoundedCornerShape(8.dp))
                                .border(1.dp, Color(0xFF30363D), RoundedCornerShape(8.dp))
                                .padding(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("ADVANCED HUD CONTROLS", color = Color(0xFF8B949E), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)

                            // Align & Next Page Button
                            Button(
                                onClick = {
                                    isAligningNext = true
                                    coroutineScope.launch {
                                        DesktopPaginationService.updateStatus("Fetching next line...")
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        val nextLineRes = uploadClient.getNextPageLine()
                                        val targetTopLine = nextLineRes.getOrNull() ?: (if (botLn > 0) botLn + 1 else 1)

                                        val pagination = DesktopPaginationService.instance
                                        val targetDisplayId = pagination?.resolveTargetDisplayId() ?: 0
                                        val snapshot = pagination?.alignAndCaptureNextPage(targetTopLine, targetDisplayId)
                                        if (snapshot != null) {
                                            DesktopPaginationService.latestCapturedBitmap = snapshot
                                            val nextPage = displayPage + 1
                                            uploadClient.uploadFrame(snapshot, targetTopLine, targetTopLine + 44, nextPage, true)
                                            DesktopPaginationService.updateStatus("Page $nextPage Aligned & Uploaded ✔")
                                        }
                                        delay(400)
                                        isAligningNext = false
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636)),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.fillMaxWidth().height(32.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Text(if (isAligningNext) "Aligning..." else "Next Pg & Align to Top", color = Color.White, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            }

                            if (targetVal > 0) {
                                Text("Target Document Length: $targetVal lines", color = Color(0xFF00FF9D), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            }
                        }
                    }
                }
            }
        }
    }
}

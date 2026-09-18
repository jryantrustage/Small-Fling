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
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
 * - Current Page, Top Line, Bottom Line
 * - Live Settled Screenshot upload status to FastAPI Studio
 * - Non-jumping fixed-height Dwell Freeze indicator
 * - Auto-tune calibration & line error
 * - Pacing Controls (Start / Pause / Reset / Soft Keyboard)
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
                } catch (e: Exception) {
                    isBackendOnline.value = false
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
    }

    companion object {
        private val _isOverlayRunning = MutableStateFlow(false)
        val isOverlayRunning = _isOverlayRunning.asStateFlow()

        val isBackendOnline = MutableStateFlow(false)

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
    val isBackendOnline by FloatingOverlayService.isBackendOnline.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

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
                        text = if (telemetry.currentTopLine > 0) "Ln ${telemetry.currentTopLine}-${telemetry.currentBottomLine}" else "Ln Scanning...",
                        color = Color(0xFF00FF9D),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
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
            // Expanded HUD Window - Stable Fixed Width
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.96f)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .width(320.dp)
                    .border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(14.dp))
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
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
                                    .background(if (paginationState == DesktopPaginationService.PaginationState.Running) Color(0xFF00FF9D) else Color(0xFF8B949E))
                            )
                            Text(
                                text = if (paginationState == DesktopPaginationService.PaginationState.Running) "MATRIX PACER [ACTIVE]" else "MATRIX PACER [IDLE]",
                                color = if (paginationState == DesktopPaginationService.PaginationState.Running) Color(0xFF00FF9D) else Color(0xFF58A6FF),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(onClick = { isExpanded = false }, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.CloseFullscreen, contentDescription = "Minimize", tint = Color.LightGray, modifier = Modifier.size(16.dp))
                            }
                            IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFFFF7B72), modifier = Modifier.size(16.dp))
                            }
                        }
                    }

                    Divider(color = Color(0xFF30363D), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))

                    // Status & API Connection
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = telemetry.statusMessage.ifEmpty { "Ready" },
                            color = Color(0xFF58A6FF),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(if (isBackendOnline) Color(0xFF00FF9D) else Color(0xFFFF7B72))
                            )
                            Text(
                                text = if (isBackendOnline) "API ON" else "API OFF",
                                color = if (isBackendOnline) Color(0xFF00FF9D) else Color(0xFFFF7B72),
                                fontSize = 9.sp,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Page and Line Bounds
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Page: #${if (telemetry.currentPage > 0) telemetry.currentPage else currentPage} (Ln ${telemetry.currentTopLine}-${telemetry.currentBottomLine})",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Target: ${if (telemetry.targetTotalLines > 0) "${telemetry.targetTotalLines}" else (if (calculatedTotalLines > 0) "$calculatedTotalLines" else "Auto-Detect")}",
                            color = Color(0xFF00FF9D),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Auto-tuning & Pitch
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Auto-tune: ${String.format(java.util.Locale.US, "%.2f", telemetry.autoTuneFactor)}x (err: ${telemetry.bottomToTopError} ln)",
                            color = if (telemetry.bottomToTopError == 0) Color(0xFF00FF9D) else Color(0xFFFFA657),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Pitch: ${String.format(java.util.Locale.US, "%.1f", telemetry.linePitchPx)}px",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // STABLE FIXED-HEIGHT DWELL INDICATOR (Never causes HUD to jump)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (dwellRemainingMs > 0) "Dwell: ${dwellRemainingMs}ms" else "Dwell: Settled",
                            color = if (dwellRemainingMs > 0) Color(0xFF00FF9D) else Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.width(110.dp)
                        )
                        LinearProgressIndicator(
                            progress = {
                                if (dwellRemainingMs > 0) (dwellRemainingMs.toFloat() / 1500f).coerceIn(0f, 1f) else 0f
                            },
                            modifier = Modifier
                                .weight(1f)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = Color(0xFF00FF9D),
                            trackColor = Color(0xFF21262D)
                        )
                    }

                    Divider(color = Color(0xFF30363D), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))

                    // Live Settled Frame Upload Telemetry
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "CAPTURED FRAMES",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Uploaded: ${recorderState.completedSegmentsCount}",
                            color = Color(0xFF00FF9D),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Scrollable list of verified uploads
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 100.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (segments.isEmpty()) {
                            item {
                                Text(
                                    text = if (recorderState.isRecording) "Awaiting Page 1 dwell capture..." else "Pacer standby. Tap START PACER below.",
                                    color = Color(0xFF6E7681),
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        } else {
                            items(segments) { seg ->
                                FrameUploadRow(seg)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Row 1 Controls: Pause/Start & Calibrate
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (paginationState == DesktopPaginationService.PaginationState.Running) {
                            Button(
                                onClick = { DesktopPaginationService.instance?.stopPagination() },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD29922)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .weight(1.2f)
                                    .height(34.dp),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text("PAUSE PACER", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                            }
                        } else {
                            Button(
                                onClick = {
                                    val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                    val total = prefs.getInt("target_total_lines", 0)
                                    val host = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                    val client = FrameUploadClient(host)

                                    DesktopPaginationService.instance?.startPacingEngine(
                                        totalLines = total,
                                        dwellTimeMs = 1500L,
                                        phase = "SETTLED_CAPTURE_AND_UPLOAD",
                                        onFrameCaptureNeeded = { pageIndex, topLine, bottomLine ->
                                            val activeService = SegmentRecorderService.instance
                                            val cm = activeService?.getCaptureManager()
                                            val snapshot = cm?.captureSettledSnapshot()
                                            if (snapshot != null) {
                                                val ok = client.uploadFrame(snapshot, topLine, bottomLine, pageIndex)
                                                activeService.reportFrameUploaded(pageIndex, topLine, bottomLine, ok)
                                            } else {
                                                Log.w("FloatingOverlayService", "Settled snapshot was null on Page $pageIndex")
                                            }
                                        }
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .weight(1.2f)
                                    .height(34.dp),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text("START PACER", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                            }
                        }

                        Button(
                            onClick = {
                                CoroutineScope(Dispatchers.Default).launch {
                                    val activeService = SegmentRecorderService.instance
                                    val measured = DesktopPaginationService.instance?.performLineCalibration {
                                        val gState = activeService?.getGutterTracker()?.gutterState?.value
                                        if (gState != null && gState.currentBottomLine > 0) {
                                            DesktopPaginationService.GutterMetricsSnapshot(
                                                lowestLineNumber = gState.currentBottomLine,
                                                lowestLineBottomY = gState.lowestDetectedY,
                                                linePitchPx = gState.linePitchPx
                                            )
                                        } else null
                                    } ?: 0
                                    if (measured > 10) {
                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        prefs.edit().putInt("target_total_lines", measured).apply()
                                        val host = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val client = FrameUploadClient(host)
                                        val ok = client.resetServerState(measured)
                                        FloatingOverlayService.isBackendOnline.value = ok
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("CALIB", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Row 2 Controls: Reset, Stop, Soft Keyboard Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Button(
                            onClick = {
                                // Completely clear target_total_lines from SharedPreferences
                                val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                prefs.edit().putInt("target_total_lines", 0).apply()
                                val host = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                DesktopPaginationService.resetToStart(0)
                                CoroutineScope(Dispatchers.IO).launch {
                                    try {
                                        val client = FrameUploadClient(host)
                                        val ok = client.resetServerState(0)
                                        FloatingOverlayService.isBackendOnline.value = ok
                                    } catch (_: Exception) {
                                        FloatingOverlayService.isBackendOnline.value = false
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE36209)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1.1f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("RESET LN 1", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                        }

                        Button(
                            onClick = {
                                DesktopPaginationService.instance?.stopPagination()
                                SegmentRecorderService.instance?.stopWorkflow()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDA3633)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(0.9f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("STOP", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                        }

                        Button(
                            onClick = { DesktopPaginationService.instance?.toggleSoftKeyboard() },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isKeyboardSuppressed) Color(0xFF1F6FEB) else Color(0xFF30363D)
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text(if (isKeyboardSuppressed) "KB: HIDE" else "KB: AUTO", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FrameUploadRow(segment: SegmentRecorderService.SegmentDetail) {
    val statusColor = if (segment.status == SegmentRecorderService.SegmentStatus.EXTRACTED) Color(0xFF00FF9D) else Color(0xFFFF7B72)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF161B22), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Page #${segment.segmentIndex}: Lines ${segment.startLine}-${segment.endLine}",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = segment.statusMessage,
                    color = statusColor,
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace
                )
            }

            if (segment.markdownLineCount > 0) {
                Text(
                    text = "${segment.markdownLineCount} ln",
                    color = Color(0xFF00FF9D),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

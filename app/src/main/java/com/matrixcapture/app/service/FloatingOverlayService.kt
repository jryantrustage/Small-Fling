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
import com.matrixcapture.app.service.DesktopPaginationService
import com.matrixcapture.app.service.SegmentRecorderService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Floating Overlay Service for MatrixCapture.
 *
 * Displays a lightweight, draggable HUD on top of any active screen (Screen 0 or Screen 1)
 * providing real-time telemetry:
 * - Video count (active chunk and total chunks)
 * - Start line & end line for each video segment
 * - Overall document progress (start page, line # begin and end targeted)
 * - Gemini upload and inference status per segment
 * - Result markdown line count per video
 * - Final stitched total line count upon completion
 * - Compact controls (Pause / Resume / Stop / Expand / Collapse)
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
            val serverHost = prefs.getString("server_host", "10.0.2.2:8000") ?: "10.0.2.2:8000"
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

                    uploadClient.sendTelemetry(
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
                } catch (e: Exception) {
                    // Ignore transient network errors
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

        // Notify server that HUD has stopped/is standby
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                val serverHost = prefs.getString("server_host", "10.0.2.2:8000") ?: "10.0.2.2:8000"
                val uploadClient = FrameUploadClient(serverHost)
                uploadClient.sendTelemetry(
                    FrameUploadClient.TelemetryData(
                        deviceId = "Pixel 10 Desktop (Standby)",
                        isPacing = false,
                        phase = "STANDBY",
                        statusMessage = "Pacer Standby / Closed"
                    )
                )
            } catch (e: Exception) {
                // Ignore
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

    // Collect telemetry flows
    val segments by SegmentRecorderService.segmentDetails.collectAsState()
    val totalFinalLines by SegmentRecorderService.totalFinalLines.collectAsState()
    val recorderState by (SegmentRecorderService.instance?.serviceState ?: MutableStateFlow(SegmentRecorderService.RecorderState())).collectAsState()
    val paginationState by DesktopPaginationService.paginationState.collectAsState()
    val telemetry by DesktopPaginationService.telemetry.collectAsState()
    val currentPage by DesktopPaginationService.currentPage.collectAsState()
    val calculatedTotalLines by DesktopPaginationService.calculatedTotalLines.collectAsState()
    val dwellRemainingMs by DesktopPaginationService.dwellCountdownMs.collectAsState()
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()

    val isPaused = paginationState == DesktopPaginationService.PaginationState.Idle && recorderState.isRecording

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
                            .background(if (recorderState.isRecording) Color(0xFF00FF9D) else Color.Yellow)
                    )
                    Text(
                        text = "VID #${recorderState.currentSegmentIndex}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "LN: ${recorderState.currentStartLine}..",
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
            // Expanded HUD Window
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
                                    .background(if (recorderState.isRecording) Color(0xFF00FF9D) else Color(0xFF8B949E))
                            )
                            Text(
                                text = if (recorderState.isRecording) "MATRIX HUD [REC]" else "MATRIX HUD [TEST]",
                                color = if (recorderState.isRecording) Color(0xFF00FF9D) else Color(0xFF58A6FF),
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

                    // Overall Document Progress
                    Text(
                        text = "STATUS: ${telemetry.statusMessage.ifEmpty { "Idle" }}",
                        color = Color(0xFF58A6FF),
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Page: ${if (telemetry.currentPage > 0) telemetry.currentPage else currentPage} (Ln ${telemetry.currentTopLine}-${telemetry.currentBottomLine})",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Target: ${if (telemetry.targetTotalLines > 0) telemetry.targetTotalLines else (if (calculatedTotalLines > 0) calculatedTotalLines else 9487)}",
                            color = Color(0xFF00FF9D),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    if (telemetry.segmentTargetLines > 0) {
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = "Chunk Progress: ${telemetry.segmentProgressLines}/${telemetry.segmentTargetLines} lines",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(2.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Auto-tune: ${String.format(java.util.Locale.US, "%.2f", telemetry.autoTuneFactor)}x (err: ${telemetry.bottomToTopError} ln)",
                            color = if (telemetry.bottomToTopError == 0) Color(0xFF00FF9D) else Color(0xFFFFA657),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        if (telemetry.wrappedLinesDetected > 0) {
                            Text(
                                text = "Wrapped: ${telemetry.wrappedLinesDetected}",
                                color = Color(0xFFD29922),
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }

                    // Dwell Timer
                    if (dwellRemainingMs > 0) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "1.5s Dwell Freeze: ${dwellRemainingMs}ms",
                            color = Color(0xFF58A6FF),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        LinearProgressIndicator(
                            progress = { (dwellRemainingMs.toFloat() / 1500f).coerceIn(0f, 1f) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = Color(0xFF58A6FF),
                            trackColor = Color(0xFF21262D)
                        )
                    }

                    Divider(color = Color(0xFF30363D), thickness = 1.dp, modifier = Modifier.padding(vertical = 6.dp))

                    // Video Count & Segment Progress Table
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "VIDEO SEGMENTS (${segments.size} Total)",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Uploaded: ${segments.count { it.status == SegmentRecorderService.SegmentStatus.EXTRACTED }}",
                            color = Color(0xFF00FF9D),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Scrollable list of video segments
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 140.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (segments.isEmpty()) {
                            item {
                                Text(
                                    text = "No segments recorded yet. Session starting...",
                                    color = Color(0xFF6E7681),
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        } else {
                            items(segments.reversed()) { seg ->
                                SegmentHudRow(seg)
                            }
                        }
                    }

                    // Final Stitching Result
                    if (totalFinalLines != null && totalFinalLines!! > 0) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D281E)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                Text(
                                    text = "✔ FINALIZED SPLICED DOCUMENT",
                                    color = Color(0xFF00FF9D),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = "Total Final Lines: $totalFinalLines lines",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Controls in Overlay
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (paginationState == DesktopPaginationService.PaginationState.Running) {
                            Button(
                                onClick = {
                                    DesktopPaginationService.instance?.stopPagination()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD29922)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(34.dp),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text(
                                    text = "PAUSE PACER",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        } else {
                            Button(
                                onClick = {
                                    val total = if (telemetry.targetTotalLines > 0) telemetry.targetTotalLines else (if (calculatedTotalLines > 0) calculatedTotalLines else 9487)
                                    DesktopPaginationService.instance?.startPacingEngine(
                                        totalLines = total,
                                        dwellTimeMs = 1500L,
                                        phase = if (recorderState.isRecording) "RECORDING_AND_PACING" else "TEST_PACING"
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(34.dp),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text(
                                    text = if (recorderState.isRecording) "START PACER" else "TEST PACER (1.5s)",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        Button(
                            onClick = {
                                DesktopPaginationService.instance?.stopPagination()
                                SegmentRecorderService.instance?.stopWorkflow()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDA3633)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text(
                                text = "STOP",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        Button(
                            onClick = {
                                DesktopPaginationService.instance?.toggleSoftKeyboard()
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isKeyboardSuppressed) Color(0xFF1F6FEB) else Color(0xFF30363D)
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(34.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text(
                                text = if (isKeyboardSuppressed) "KB: HIDE" else "KB: AUTO",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SegmentHudRow(segment: SegmentRecorderService.SegmentDetail) {
    val statusColor = when (segment.status) {
        SegmentRecorderService.SegmentStatus.RECORDING -> Color(0xFF58A6FF)
        SegmentRecorderService.SegmentStatus.UPLOADING -> Color(0xFFD29922)
        SegmentRecorderService.SegmentStatus.PROCESSING -> Color(0xFFA371F7)
        SegmentRecorderService.SegmentStatus.EXTRACTING -> Color(0xFFE3B341)
        SegmentRecorderService.SegmentStatus.EXTRACTED -> Color(0xFF00FF9D)
        SegmentRecorderService.SegmentStatus.FAILED -> Color(0xFFFF7B72)
    }

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
                    text = "Vid #${segment.segmentIndex}: Lines ${segment.startLine}-${segment.endLine}",
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

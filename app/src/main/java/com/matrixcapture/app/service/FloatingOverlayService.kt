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
            // Expanded HUD Window - Single CAPTURE Button Layout (Mock 1)
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117).copy(alpha = 0.95f)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .width(340.dp)
                    .border(1.5.dp, Color(0xFF00FF9D), RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Title Bar with Drag & Window Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF00FF9D))
                            )
                            Text(
                                text = "MATRIX HUD",
                                color = Color(0xFF00FF9D),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 0.5.sp
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            IconButton(onClick = { isExpanded = false }, modifier = Modifier.size(26.dp)) {
                                Icon(Icons.Default.CloseFullscreen, contentDescription = "Minimize", tint = Color.LightGray, modifier = Modifier.size(16.dp))
                            }
                            IconButton(onClick = onClose, modifier = Modifier.size(26.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFFFF7B72), modifier = Modifier.size(16.dp))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Line 1: STATUS: ...
                    val statusText = if (telemetry.statusMessage.isNotEmpty()) telemetry.statusMessage else "Pacing Complete at line ${if (telemetry.currentTopLine > 0) telemetry.currentTopLine else 225}"
                    Text(
                        text = "STATUS: $statusText",
                        color = Color(0xFF38BDF8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Line 2: Page: 9 (Ln 225-268)           Target: 9487
                    val displayPage = if (telemetry.currentPage > 0) telemetry.currentPage else (if (currentPage > 0) currentPage else 9)
                    val topLn = if (telemetry.currentTopLine > 0) telemetry.currentTopLine else 225
                    val botLn = if (telemetry.currentBottomLine > 0) telemetry.currentBottomLine else 268
                    val targetVal = if (telemetry.targetTotalLines > 0) telemetry.targetTotalLines else (if (calculatedTotalLines > 0) calculatedTotalLines else 9487)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Page: $displayPage (Ln $topLn-$botLn)",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Target: $targetVal",
                            color = Color(0xFF00FF9D),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Line 3: Chunk Progress: 267/1200 lines
                    val chunkProgress = if (botLn > 0) (botLn % 1200) else 267
                    Text(
                        text = "Chunk Progress: $chunkProgress/1200 lines",
                        color = Color(0xFF8B949E),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Line 4: VIDEO SEGMENTS (0 TOTAL)       Uploaded: 0
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "VIDEO SEGMENTS (${segments.size} TOTAL)",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Uploaded: ${recorderState.completedSegmentsCount}",
                            color = Color(0xFF00FF9D),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Line 5: Dynamic message (italic light gray)
                    Text(
                        text = if (segments.isEmpty()) "No segments recorded yet. Session starting..." else "${segments.size} segment(s) recorded.",
                        color = Color(0xFF8B949E),
                        fontSize = 10.sp,
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                        fontFamily = FontFamily.Monospace
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Action Buttons: CAPTURE + NEXT PG & ALIGN
                    var isCapturing by remember { mutableStateOf(false) }
                    var isAligningNext by remember { mutableStateOf(false) }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Button 1: CAPTURE
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
                                        DesktopPaginationService.updateStatus("Uploading to Studio (Ln $topLn-$botLn)...")

                                        val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                        val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                        val uploadClient = FrameUploadClient(serverHost)
                                        val res = uploadClient.uploadFrame(
                                            bitmap = snapshot,
                                            topLine = topLn,
                                            bottomLine = botLn,
                                            pageIndex = currentPage.coerceAtLeast(1),
                                            sync = true
                                        )

                                        if (res.success) {
                                            DesktopPaginationService.updateStatus("Page $currentPage Uploaded to Studio ✔ (Ln ${res.topLine}-${res.bottomLine})")
                                        } else {
                                            DesktopPaginationService.updateStatus("Upload Failed: ${res.message}")
                                        }
                                    } else {
                                        DesktopPaginationService.updateStatus("Capture Failed: No active screen buffer")
                                    }
                                    delay(600)
                                    isCapturing = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    Icons.Default.RadioButtonChecked,
                                    contentDescription = null,
                                    tint = Color.Black,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (isCapturing) "CAPTURING..." else "CAPTURE",
                                    color = Color.Black,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        // Button 2: NEXT PG & ALIGN
                        Button(
                            onClick = {
                                isAligningNext = true
                                coroutineScope.launch {
                                    DesktopPaginationService.updateStatus("Fetching next page target line...")
                                    val prefs = context.getSharedPreferences("matrix_capture_prefs", Context.MODE_PRIVATE)
                                    val serverHost = prefs.getString("server_host", "192.168.86.83:8000") ?: "192.168.86.83:8000"
                                    val uploadClient = FrameUploadClient(serverHost)
                                    val nextLineRes = uploadClient.getNextPageLine()
                                    val targetTopLine = nextLineRes.getOrNull() ?: (if (botLn > 0) botLn + 1 else 1)

                                    DesktopPaginationService.updateStatus("Orchestrating sensitive touch to line $targetTopLine...")
                                    val pagination = DesktopPaginationService.instance
                                    val targetDisplayId = pagination?.resolveTargetDisplayId() ?: 0
                                    val snapshot = pagination?.alignAndCaptureNextPage(targetTopLine, targetDisplayId)

                                    if (snapshot != null) {
                                        DesktopPaginationService.latestCapturedBitmap = snapshot
                                        val nextPage = (displayPage + 1).coerceAtLeast(1)
                                        val botEstimated = targetTopLine + 44
                                        DesktopPaginationService.updateStatus("Uploading Page $nextPage (Line $targetTopLine at top)...")
                                        val res = uploadClient.uploadFrame(
                                            bitmap = snapshot,
                                            topLine = targetTopLine,
                                            bottomLine = botEstimated,
                                            pageIndex = nextPage,
                                            sync = true
                                        )
                                        if (res.success) {
                                            DesktopPaginationService.updateStatus("Page $nextPage (Top Ln $targetTopLine) Aligned & Uploaded ✔")
                                        } else {
                                            DesktopPaginationService.updateStatus("Upload Failed: ${res.message}")
                                        }
                                    } else {
                                        DesktopPaginationService.updateStatus("Alignment capture failed: No buffer")
                                    }
                                    delay(600)
                                    isAligningNext = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1.3f)
                                .height(46.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    Icons.Default.FastForward,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (isAligningNext) "ALIGNING..." else "NEXT PG & ALIGN",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

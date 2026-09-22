package com.matrixcapture.app.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.matrixcapture.app.data.DeviceModel
import com.matrixcapture.app.service.DesktopPaginationService
import com.matrixcapture.app.service.FloatingOverlayService
import com.matrixcapture.app.service.SegmentRecorderService

class MainActivity : ComponentActivity() {
    private val viewModel: CaptureViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            MatrixCaptureTheme {
                val uiState by viewModel.uiState.collectAsState()
                val projectionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
                    if (res.resultCode == Activity.RESULT_OK && res.data != null) viewModel.startFullWorkflow(res.resultCode, res.data!!)
                }
                val isOverlayActive by FloatingOverlayService.isOverlayRunning.collectAsState()

                Surface(modifier = Modifier.fillMaxSize().safeDrawingPadding(), color = Color(0xFF0D1117)) {
                    MatrixCaptureDashboard(
                        uiState = uiState, isOverlayActive = isOverlayActive,
                        onApiKeyChange = { viewModel.setApiKey(it) }, onServerHostChange = { viewModel.setServerHost(it) },
                        onTargetLinesChange = { viewModel.setTargetTotalLines(it) }, onResetSession = { viewModel.resetSession() },
                        onCalibrate = { viewModel.calibrateDocument() }, onTestPacer = { viewModel.startPacingOnly() },
                        onSendCapturesToApi = { viewModel.sendCapturesToPythonApi() }, onGetNextPageLine = { viewModel.getNextPageLine() },
                        onCaptureDesktopMode = { viewModel.captureDesktopMode() },
                        onAlignAndCaptureNextPage = { viewModel.alignAndCaptureNextPage() },
                        onStartWorkflow = {
                            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                            projectionLauncher.launch(mpm.createScreenCaptureIntent())
                        },
                        onStopWorkflow = { viewModel.stopWorkflow() }, onOpenAccessibility = { viewModel.openAccessibilitySettings() },
                        onBeginOrchestration = { viewModel.beginOrchestration() }, onPauseOrchestration = { viewModel.pauseOrchestration() },
                        onResumeOrchestration = { viewModel.resumeOrchestration() }, onEndOrchestration = { viewModel.endOrchestration() },
                        onRestartOrchestration = { viewModel.restartOrchestration() },
                        onDeviceModelChange = { viewModel.setDeviceModel(it) },
                        onToggleOverlay = {
                            if (!android.provider.Settings.canDrawOverlays(this)) {
                                startActivity(Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:$packageName")))
                            } else if (isOverlayActive) FloatingOverlayService.stop(this) else FloatingOverlayService.start(this)
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun MatrixCaptureDashboard(
    uiState: CaptureViewModel.UiState, isOverlayActive: Boolean,
    onApiKeyChange: (String) -> Unit, onServerHostChange: (String) -> Unit, onTargetLinesChange: (Int) -> Unit,
    onResetSession: () -> Unit, onCalibrate: () -> Unit, onTestPacer: () -> Unit,
    onSendCapturesToApi: () -> Unit = {}, onGetNextPageLine: () -> Unit = {}, onCaptureDesktopMode: () -> Unit = {}, onAlignAndCaptureNextPage: () -> Unit = {},
    onStartWorkflow: () -> Unit, onStopWorkflow: () -> Unit, onOpenAccessibility: () -> Unit,
    onBeginOrchestration: () -> Unit = {}, onPauseOrchestration: () -> Unit = {}, onResumeOrchestration: () -> Unit = {},
    onEndOrchestration: () -> Unit = {}, onRestartOrchestration: () -> Unit = {}, onDeviceModelChange: (DeviceModel) -> Unit = {}, onToggleOverlay: () -> Unit
) {
    val scrollState = rememberScrollState()
    val segments by SegmentRecorderService.segmentDetails.collectAsState()
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()
    var showSettings by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState).padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("MATRIX CAPTURE", color = Color(0xFF00FF9D), fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp)
                Text("Less is More Orchestrator", color = Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(modifier = Modifier.background(Color(0xFF161B22), RoundedCornerShape(12.dp)).border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp)).padding(horizontal = 7.dp, vertical = 4.dp)) {
                    PulsingStatusIndicator(isRunning = uiState.orchestrationStatus == "RUNNING" || uiState.isWorkflowRunning)
                }
                IconButton(
                    onClick = { showSettings = !showSettings },
                    modifier = Modifier.size(32.dp).background(if (showSettings) Color(0xFF21262D) else Color(0xFF161B22), CircleShape).border(1.dp, if (showSettings) Color(0xFF00FF9D) else Color(0xFF30363D), CircleShape)
                ) { Icon(Icons.Default.Settings, "Settings", tint = if (showSettings) Color(0xFF00FF9D) else Color(0xFFC9D1D9), modifier = Modifier.size(16.dp)) }
            }
        }

        val isRunning = uiState.orchestrationStatus == "RUNNING" || uiState.isWorkflowRunning
        val isPaused = uiState.orchestrationStatus == "PAUSED"
        val statusText = if (isRunning) "RUNNING" else if (isPaused) "PAUSED" else uiState.orchestrationStatus.ifEmpty { "IDLE" }
        val statusColor = when (statusText) {
            "RUNNING" -> Color(0xFF00FF9D); "PAUSED" -> Color(0xFFD29922); "COMPLETED" -> Color(0xFF58A6FF); "ABORTED" -> Color(0xFFFF7B72); else -> Color(0xFF8B949E)
        }
        val resolvedDev = uiState.deviceModel.resolve()
        val displayPage = uiState.deviceModel.displayPageForTopLine(uiState.currentTopLine)

        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().border(1.dp, statusColor.copy(alpha = 0.6f), RoundedCornerShape(16.dp))) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(modifier = Modifier.background(statusColor.copy(alpha = 0.15f), RoundedCornerShape(16.dp)).border(1.dp, statusColor, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 5.dp)) {
                            Text("STATUS: $statusText", color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace)
                        }
                        if (uiState.orchestrationInvokedBy.isNotEmpty()) {
                            Box(modifier = Modifier.background(Color(0xFF21262D), RoundedCornerShape(12.dp)).border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                                Text("by ${uiState.orchestrationInvokedBy}", color = Color(0xFF79C0FF), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace)
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72)))
                        Text(if (uiState.isBackendConnected) "SYNCED" else "OFFLINE", color = if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().background(Color(0xFF0D1117), RoundedCornerShape(12.dp)).padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("PAGE $displayPage", color = Color(0xFF58A6FF), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(if (uiState.currentTopLine > 0 || uiState.currentBottomLine > 0) "Ln ${uiState.currentTopLine} → ${uiState.currentBottomLine}" else "Ln 1 → ${resolvedDev.linesPerPage} (Ready)", color = Color(0xFF00FF9D), fontSize = 18.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    if (uiState.orchestrationStepLabel.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("DAG: ${uiState.orchestrationStepLabel}", color = Color(0xFFFFA657), fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    }
                    if (uiState.orchestrationNextTargetTop != null && uiState.orchestrationNextTargetTop > 0) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text("Target Next Top: Ln ${uiState.orchestrationNextTargetTop}", color = Color(0xFF79C0FF), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                    }
                    if (uiState.calculatedTotalLines > 0) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text("of ~${uiState.calculatedTotalLines} total lines", color = Color(0xFF8B949E), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("1.5s DWELL FREEZE", color = Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Text("${uiState.dwellCountdownMs}ms", color = Color(0xFF00FF9D), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(
                        progress = { (uiState.dwellCountdownMs.toFloat() / DesktopPaginationService.DWELL_TIME_MS).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = Color(0xFF00FF9D), trackColor = Color(0xFF21262D)
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Frames: ${uiState.uploadedFramesCount}", color = Color(0xFFC9D1D9), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text(uiState.targetDisplay?.let { "Disp 1: ${it.width}x${it.height}" } ?: "Disp 0", color = Color(0xFF8B949E), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                }
            }
        }

        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when {
                isRunning -> {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ActionBtn("PAUSE", Icons.Default.Pause, Color(0xFFD29922), Color.Black, Modifier.weight(1f), onPauseOrchestration)
                        ActionBtn("END", Icons.Default.Stop, Color(0xFFDA3633), Color.White, Modifier.weight(1f), onEndOrchestration)
                    }
                    RestartBtn(onRestartOrchestration)
                }
                isPaused -> {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ActionBtn("RESUME", Icons.Default.PlayArrow, Color(0xFF238636), Color.White, Modifier.weight(1f), onResumeOrchestration)
                        ActionBtn("END", Icons.Default.Stop, Color(0xFFDA3633), Color.White, Modifier.weight(1f), onEndOrchestration)
                    }
                    RestartBtn(onRestartOrchestration)
                }
                else -> {
                    Button(onClick = onBeginOrchestration, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00FF9D))) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(Icons.Default.PlayArrow, null, tint = Color.Black, modifier = Modifier.size(24.dp))
                            Text("begin Auto Flipping", color = Color.Black, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 16.sp, letterSpacing = 0.5.sp)
                        }
                    }
                    Button(onClick = onCaptureDesktopMode, modifier = Modifier.fillMaxWidth().height(46.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB))) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.CameraAlt, null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Text("capture desktop mode", color = Color.White, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
                        }
                    }
                    if (uiState.currentTopLine > 1 || uiState.uploadedFramesCount > 0) RestartBtn(onRestartOrchestration)
                }
            }

            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp))) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Layers, null, tint = if (isOverlayActive) Color(0xFF00FF9D) else Color(0xFF8B949E), modifier = Modifier.size(18.dp))
                        Text("HUD Overlay", color = Color.White, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Button(
                        onClick = onToggleOverlay,
                        colors = ButtonDefaults.buttonColors(containerColor = if (isOverlayActive) Color(0xFFDA3633) else Color(0xFF238636)),
                        shape = RoundedCornerShape(8.dp), modifier = Modifier.height(34.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
                    ) {
                        Text(if (isOverlayActive) "Close HUD" else "Launch HUD", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color.White)
                    }
                }
            }
        }

        AnimatedVisibility(visible = showSettings) {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    Icon(Icons.Default.Settings, null, tint = Color(0xFF00FF9D), modifier = Modifier.size(16.dp))
                    Text("ADVANCED SETTINGS & DIAGNOSTICS", color = Color(0xFF00FF9D), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }

                if (!uiState.isAccessibilityActive) {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF3B1E1E)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Icon(Icons.Default.Warning, null, tint = Color(0xFFFF7B72))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Accessibility Service Disabled", color = Color(0xFFFF7B72), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                Text("Required to inject pagination gestures into Display 1.", color = Color(0xFFFFA198), fontSize = 12.sp)
                            }
                            Button(onClick = onOpenAccessibility, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72))) {
                                Text("Enable", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                val display = uiState.targetDisplay
                Card(
                    colors = CardDefaults.cardColors(containerColor = if (display != null) Color(0xFF161B22) else Color(0xFF261C14)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922), RoundedCornerShape(12.dp))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Tv, null, tint = if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922), modifier = Modifier.size(18.dp))
                            Text(if (display != null) "✔ DESKTOP MODE ACTIVE: DISPLAY 1" else "AWAITING DESKTOP MODE (DISPLAY 1)", color = if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922), fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        if (display != null) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                StatItem("DISPLAY ID", "${display.displayId} (EXTERNAL)")
                                StatItem("RESOLUTION", "${display.width} x ${display.height}")
                                StatItem("REFRESH", "${display.refreshRate.toInt()} Hz")
                            }
                        } else Text("External Display 1 is currently not detected. Connect USB-C DisplayPort cable to your laptop.", color = Color(0xFFFFA198), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    }
                }

                TelemetryCard("GUTTER OCR & LINE TRACKER", Icons.Default.FormatListNumbered) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("TOP LINE", "${uiState.currentTopLine}", Modifier.weight(1f))
                        StatItem("BOTTOM LINE", "${uiState.currentBottomLine}", Modifier.weight(1f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("PITCH", "%.1f px/ln".format(uiState.linePitchPx), Modifier.weight(1f))
                        StatItem("TOTAL DEDUCED", if (uiState.calculatedTotalLines > 0) "${uiState.calculatedTotalLines}" else "Scanning...", Modifier.weight(1f))
                    }
                }

                TelemetryCard("SETTLED FRAME STREAM (STUDIO INGESTION)", Icons.Default.CameraAlt) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("FRAMES CAPTURED", "${uiState.uploadedFramesCount}", Modifier.weight(1f))
                        StatItem("SERVER SYNC", if (uiState.isBackendConnected) "ONLINE" else "OFFLINE", Modifier.weight(1f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("STATUS: ${uiState.recorderState.processingStatus}", color = Color(0xFF58A6FF), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                    if (segments.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("LIVE FRAME UPLOADS:", color = Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { segments.take(5).forEach { SegmentItemRow(it) } }
                    }
                }

                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("ON-SCREEN KEYBOARD", color = Color(0xFF58A6FF), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                            Text(if (isKeyboardSuppressed) "Suppressed (External screen clear)" else "Auto (OS default)", color = if (isKeyboardSuppressed) Color(0xFF00FF9D) else Color(0xFF8B949E), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                        }
                        Button(
                            onClick = { DesktopPaginationService.instance?.toggleSoftKeyboard() },
                            colors = ButtonDefaults.buttonColors(containerColor = if (isKeyboardSuppressed) Color(0xFF1F6FEB) else Color(0xFF30363D)),
                            shape = RoundedCornerShape(8.dp), modifier = Modifier.height(32.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
                        ) { Text(if (isKeyboardSuppressed) "Restore KB" else "Hide KB", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = Color.White) }
                    }
                }

                SettingInputCard("TARGET DEVICE PROFILE") {
                    val activeResolved = uiState.deviceModel.resolve()
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(
                                DeviceModel.AUTO to "Auto (${activeResolved.displayName})",
                                DeviceModel.PIXEL_8 to "Pixel 8 (31L)",
                                DeviceModel.PIXEL_10 to "Pixel 10 (49L)"
                            ).forEach { (model, label) ->
                                val isSelected = uiState.deviceModel == model
                                Button(
                                    onClick = { onDeviceModelChange(model) },
                                    modifier = Modifier.weight(1f).height(38.dp),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = if (isSelected) Color(0xFF1F6FEB) else Color(0xFF21262D)),
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                                ) {
                                    Text(
                                        label,
                                        color = if (isSelected) Color.White else Color(0xFF8B949E),
                                        fontSize = 10.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                        Text(
                            "Hardware: ${android.os.Build.MODEL} • Active: ${activeResolved.displayName} (${activeResolved.linesPerPage} lines/pg)",
                            color = Color(0xFF00FF9D),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                SettingInputCard("FASTAPI OCR BACKEND", uiState.isBackendConnected) {
                    OutlinedTextField(
                        value = uiState.serverHost, onValueChange = onServerHostChange, label = { Text("Studio Host:Port") }, placeholder = { Text("192.168.86.83:8000") },
                        singleLine = true, colors = customFieldColors(Color(0xFF58A6FF)), modifier = Modifier.fillMaxWidth()
                    )
                }

                SettingInputCard("GEMINI CLOUD EXTRACTION CONFIG") {
                    OutlinedTextField(
                        value = uiState.geminiApiKey, onValueChange = onApiKeyChange, label = { Text("Gemini API Key") }, placeholder = { Text("AIzaSy...") },
                        singleLine = true, colors = customFieldColors(Color(0xFF00FF9D)), modifier = Modifier.fillMaxWidth()
                    )
                }

                SettingInputCard("TARGET DOCUMENT LINE COUNT") {
                    OutlinedTextField(
                        value = if (uiState.targetTotalLines > 0) "${uiState.targetTotalLines}" else "",
                        onValueChange = { onTargetLinesChange(it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0) },
                        placeholder = { Text("0 (Auto-Detect via Bottom Fling)") }, label = { Text("Total Target Lines") },
                        singleLine = true, colors = customFieldColors(Color(0xFF00FF9D)), modifier = Modifier.fillMaxWidth()
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    DiagBtn("Test Pacer (1.5s Dwell)", onTestPacer)
                    DiagBtn("capture desktop mode", onCaptureDesktopMode)
                    DiagBtn("Get line number of next", onGetNextPageLine)
                    Button(onClick = onAlignAndCaptureNextPage, modifier = Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(10.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB))) {
                        Text("Next Page & Align To Top (Micro-Touch)", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }
                }

                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF040D0A)), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF1F2E28), RoundedCornerShape(8.dp))) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("CONSOLE:", color = Color(0xFF00FF9D), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Text(uiState.workflowStatus, color = Color(0xFFC9D1D9), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionBtn(text: String, icon: ImageVector, bg: Color, fg: Color, modifier: Modifier, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = modifier.height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = bg)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = fg)
            Text(text, color = fg, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
        }
    }
}

@Composable
private fun RestartBtn(onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick, modifier = Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFC9D1D9)), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30363D))
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.Refresh, null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
            Text("Restart from Beginning", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
        }
    }
}

@Composable
private fun SettingInputCard(title: String, isConnected: Boolean? = null, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(title, color = Color(0xFF8B949E), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                if (isConnected != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(if (isConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72)))
                        Text(if (isConnected) "ONLINE" else "DISCONNECTED", color = if (isConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun DiagBtn(text: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(10.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF21262D))) {
        Text(text, color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
    }
}

@Composable
private fun customFieldColors(primary: Color) = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White, unfocusedTextColor = Color.LightGray,
    focusedBorderColor = primary, unfocusedBorderColor = Color(0xFF30363D),
    focusedLabelColor = primary, unfocusedLabelColor = Color(0xFF8B949E)
)

@Composable
fun TelemetryCard(title: String, icon: ImageVector, content: @Composable ColumnScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(icon, null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                Text(title, color = Color(0xFF8B949E), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
fun StatItem(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, color = Color(0xFF6E7681), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
fun PulsingStatusIndicator(isRunning: Boolean) {
    val alpha by rememberInfiniteTransition("pulse").animateFloat(
        initialValue = 0.3f, targetValue = 1.0f,
        animationSpec = infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Reverse), label = "alpha"
    )
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(if (isRunning) Color(0xFF00FF9D).copy(alpha = alpha) else Color(0xFF6E7681)))
        Text(if (isRunning) "RUN" else "IDLE", color = if (isRunning) Color(0xFF00FF9D) else Color(0xFF6E7681), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun SegmentItemRow(seg: SegmentRecorderService.SegmentDetail) {
    val col = when (seg.status) {
        SegmentRecorderService.SegmentStatus.RECORDING -> Color(0xFF58A6FF)
        SegmentRecorderService.SegmentStatus.UPLOADING -> Color(0xFFD29922)
        SegmentRecorderService.SegmentStatus.PROCESSING -> Color(0xFFA371F7)
        SegmentRecorderService.SegmentStatus.EXTRACTING -> Color(0xFFE3B341)
        SegmentRecorderService.SegmentStatus.EXTRACTED -> Color(0xFF00FF9D)
        SegmentRecorderService.SegmentStatus.FAILED -> Color(0xFFFF7B72)
    }
    Box(modifier = Modifier.fillMaxWidth().background(Color(0xFF0D1117), RoundedCornerShape(6.dp)).padding(8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Video #${seg.segmentIndex}: Lines ${seg.startLine} -> ${seg.endLine}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                Text(seg.statusMessage, color = col, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
            }
            if (seg.markdownLineCount > 0) Text("${seg.markdownLineCount} lines", color = Color(0xFF00FF9D), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun MatrixCaptureTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = Color(0xFF00FF9D), background = Color(0xFF0D1117), surface = Color(0xFF161B22)),
        content = content
    )
}

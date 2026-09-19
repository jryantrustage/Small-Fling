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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

                // MediaProjection Permission Launcher
                val projectionLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.StartActivityForResult()
                ) { result ->
                    if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                        viewModel.startFullWorkflow(result.resultCode, result.data!!)
                    }
                }

                val isOverlayActive by FloatingOverlayService.isOverlayRunning.collectAsState()

                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding(),
                    color = Color(0xFF0D1117)
                ) {
                    MatrixCaptureDashboard(
                        uiState = uiState,
                        isOverlayActive = isOverlayActive,
                        onApiKeyChange = { viewModel.setApiKey(it) },
                        onServerHostChange = { viewModel.setServerHost(it) },
                        onTargetLinesChange = { viewModel.setTargetTotalLines(it) },
                        onResetSession = { viewModel.resetSession() },
                        onCalibrate = { viewModel.calibrateDocument() },
                        onTestPacer = { viewModel.startPacingOnly() },
                        onSendCapturesToApi = { viewModel.sendCapturesToPythonApi() },
                        onGetNextPageLine = { viewModel.getNextPageLine() },
                        onAlignAndCaptureNextPage = { viewModel.alignAndCaptureNextPage() },
                        onStartWorkflow = {
                            val mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                            projectionLauncher.launch(mediaProjectionManager.createScreenCaptureIntent())
                        },
                        onStopWorkflow = { viewModel.stopWorkflow() },
                        onOpenAccessibility = { viewModel.openAccessibilitySettings() },
                        onBeginOrchestration = { viewModel.beginOrchestration() },
                        onPauseOrchestration = { viewModel.pauseOrchestration() },
                        onResumeOrchestration = { viewModel.resumeOrchestration() },
                        onEndOrchestration = { viewModel.endOrchestration() },
                        onRestartOrchestration = { viewModel.restartOrchestration() },
                        onToggleOverlay = {
                            if (!android.provider.Settings.canDrawOverlays(this@MainActivity)) {
                                val intent = Intent(
                                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    android.net.Uri.parse("package:$packageName")
                                )
                                startActivity(intent)
                            } else {
                                if (isOverlayActive) {
                                    FloatingOverlayService.stop(this@MainActivity)
                                } else {
                                    FloatingOverlayService.start(this@MainActivity)
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun MatrixCaptureDashboard(
    uiState: CaptureViewModel.UiState,
    isOverlayActive: Boolean,
    onApiKeyChange: (String) -> Unit,
    onServerHostChange: (String) -> Unit,
    onTargetLinesChange: (Int) -> Unit,
    onResetSession: () -> Unit,
    onCalibrate: () -> Unit,
    onTestPacer: () -> Unit,
    onSendCapturesToApi: () -> Unit = {},
    onGetNextPageLine: () -> Unit = {},
    onAlignAndCaptureNextPage: () -> Unit = {},
    onStartWorkflow: () -> Unit,
    onStopWorkflow: () -> Unit,
    onOpenAccessibility: () -> Unit,
    onBeginOrchestration: () -> Unit = {},
    onPauseOrchestration: () -> Unit = {},
    onResumeOrchestration: () -> Unit = {},
    onEndOrchestration: () -> Unit = {},
    onRestartOrchestration: () -> Unit = {},
    onToggleOverlay: () -> Unit
) {
    val scrollState = rememberScrollState()
    val segments by SegmentRecorderService.segmentDetails.collectAsState()
    val totalFinalLines by SegmentRecorderService.totalFinalLines.collectAsState()
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()
    var showSettings by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "MATRIX CAPTURE",
                    color = Color(0xFF00FF9D),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
                Text(
                    text = "Less is More Orchestrator",
                    color = Color(0xFF8B949E),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Compact status pill
                Box(
                    modifier = Modifier
                        .background(Color(0xFF161B22), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp))
                        .padding(horizontal = 7.dp, vertical = 4.dp)
                ) {
                    PulsingStatusIndicator(isRunning = uiState.orchestrationStatus == "RUNNING" || uiState.isWorkflowRunning)
                }

                // Settings Gear Button
                IconButton(
                    onClick = { showSettings = !showSettings },
                    modifier = Modifier
                        .size(32.dp)
                        .background(
                            if (showSettings) Color(0xFF21262D) else Color(0xFF161B22),
                            CircleShape
                        )
                        .border(
                            1.dp,
                            if (showSettings) Color(0xFF00FF9D) else Color(0xFF30363D),
                            CircleShape
                        )
                ) {
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = if (showSettings) Color(0xFF00FF9D) else Color(0xFFC9D1D9),
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }

        // Primary Hero Card: Process Status & Live Telemetry
        val isRunning = uiState.orchestrationStatus == "RUNNING" || uiState.isWorkflowRunning
        val isPaused = uiState.orchestrationStatus == "PAUSED"
        val statusText = when {
            isRunning -> "RUNNING"
            isPaused -> "PAUSED"
            uiState.orchestrationStatus.isNotEmpty() -> uiState.orchestrationStatus
            else -> "IDLE"
        }
        val statusColor = when (statusText) {
            "RUNNING" -> Color(0xFF00FF9D)
            "PAUSED" -> Color(0xFFD29922)
            "COMPLETED" -> Color(0xFF58A6FF)
            "ABORTED" -> Color(0xFFFF7B72)
            else -> Color(0xFF8B949E)
        }
        val displayPage = if (uiState.currentTopLine > 0) ((uiState.currentTopLine - 1) / 30 + 1) else 1

        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, statusColor.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Status Header Pill
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .background(statusColor.copy(alpha = 0.15f), RoundedCornerShape(16.dp))
                            .border(1.dp, statusColor, RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = "STATUS: $statusText",
                            color = statusColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72))
                        )
                        Text(
                            text = if (uiState.isBackendConnected) "SYNCED" else "OFFLINE",
                            color = if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Big Telemetry Readout
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0D1117), RoundedCornerShape(12.dp))
                        .padding(14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "PAGE $displayPage",
                        color = Color(0xFF58A6FF),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (uiState.currentTopLine > 0 || uiState.currentBottomLine > 0)
                            "Ln ${uiState.currentTopLine} → ${uiState.currentBottomLine}"
                        else
                            "Ln 1 → 30 (Ready)",
                        color = Color(0xFF00FF9D),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    if (uiState.calculatedTotalLines > 0) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "of ~${uiState.calculatedTotalLines} total lines",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                // 1.5s Dwell Countdown Progress Bar
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "1.5s DWELL FREEZE",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${uiState.dwellCountdownMs}ms",
                            color = Color(0xFF00FF9D),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    LinearProgressIndicator(
                        progress = {
                            (uiState.dwellCountdownMs.toFloat() / DesktopPaginationService.DWELL_TIME_MS).coerceIn(0f, 1f)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = Color(0xFF00FF9D),
                        trackColor = Color(0xFF21262D)
                    )
                }

                // Telemetry footer: uploaded count & display info
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Frames: ${uiState.uploadedFramesCount}",
                        color = Color(0xFFC9D1D9),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = uiState.targetDisplay?.let { "Disp 1: ${it.width}x${it.height}" } ?: "Disp 0",
                        color = Color(0xFF8B949E),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Orchestration Controls: [Begin], [End], [Pause], [Resume], [Restart from Beginning]
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            when {
                isRunning -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = onPauseOrchestration,
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD29922))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Pause, contentDescription = null, tint = Color.Black)
                                Text("PAUSE", color = Color.Black, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
                            }
                        }

                        Button(
                            onClick = onEndOrchestration,
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDA3633))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = null, tint = Color.White)
                                Text("END", color = Color.White, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = onRestartOrchestration,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFC9D1D9)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30363D))
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                            Text("Restart from Beginning", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                        }
                    }
                }

                isPaused -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = onResumeOrchestration,
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White)
                                Text("RESUME", color = Color.White, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
                            }
                        }

                        Button(
                            onClick = onEndOrchestration,
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDA3633))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = null, tint = Color.White)
                                Text("END", color = Color.White, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = onRestartOrchestration,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFC9D1D9)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30363D))
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                            Text("Restart from Beginning", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                        }
                    }
                }

                else -> {
                    // IDLE / COMPLETED / ABORTED
                    Button(
                        onClick = onBeginOrchestration,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00FF9D))
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.Black, modifier = Modifier.size(26.dp))
                            Text(
                                "BEGIN",
                                color = Color.Black,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 18.sp,
                                letterSpacing = 1.sp
                            )
                        }
                    }

                    if (uiState.currentTopLine > 1 || uiState.uploadedFramesCount > 0) {
                        OutlinedButton(
                            onClick = onRestartOrchestration,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFC9D1D9)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30363D))
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                                Text("Restart from Beginning", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }

            // Floating HUD Overlay Quick Toggle Pill
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.Layers,
                            contentDescription = null,
                            tint = if (isOverlayActive) Color(0xFF00FF9D) else Color(0xFF8B949E),
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "HUD Overlay",
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }

                    Button(
                        onClick = onToggleOverlay,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isOverlayActive) Color(0xFFDA3633) else Color(0xFF238636)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.height(34.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
                    ) {
                        Text(
                            text = if (isOverlayActive) "Close HUD" else "Launch HUD",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            color = Color.White
                        )
                    }
                }
            }
        }

        // Collapsible Advanced Settings & Diagnostics Drawer (Toggled by Gear Icon)
        AnimatedVisibility(visible = showSettings) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Section Title
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Icon(Icons.Default.Settings, contentDescription = null, tint = Color(0xFF00FF9D), modifier = Modifier.size(16.dp))
                    Text(
                        text = "ADVANCED SETTINGS & DIAGNOSTICS",
                        color = Color(0xFF00FF9D),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }

                // Accessibility Service Check Banner
                if (!uiState.isAccessibilityActive) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF3B1E1E)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFFF7B72))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Accessibility Service Disabled",
                                    color = Color(0xFFFF7B72),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "Required to inject pagination gestures into Display 1.",
                                    color = Color(0xFFFFA198),
                                    fontSize = 12.sp
                                )
                            }
                            Button(
                                onClick = onOpenAccessibility,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7B72))
                            ) {
                                Text("Enable", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Display Hardware Stats & Desktop Mode Detection Card
                val display = uiState.targetDisplay
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (display != null) Color(0xFF161B22) else Color(0xFF261C14)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            1.dp,
                            if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922),
                            RoundedCornerShape(12.dp)
                        )
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.Tv,
                                contentDescription = null,
                                tint = if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922),
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = if (display != null) "✔ DESKTOP MODE ACTIVE: DISPLAY 1" else "AWAITING DESKTOP MODE (DISPLAY 1)",
                                color = if (display != null) Color(0xFF00FF9D) else Color(0xFFD29922),
                                fontSize = 12.sp,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        if (display != null) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                StatItem("DISPLAY ID", "${display.displayId} (EXTERNAL)")
                                StatItem("RESOLUTION", "${display.width} x ${display.height}")
                                StatItem("REFRESH", "${display.refreshRate.toInt()} Hz")
                            }
                        } else {
                            Text(
                                text = "External Display 1 is currently not detected. Connect USB-C DisplayPort cable to your laptop capture card or external monitor.",
                                color = Color(0xFFFFA198),
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }

                // Gutter OCR & Line Tracker Card
                TelemetryCard(title = "GUTTER OCR & LINE TRACKER", icon = Icons.Default.FormatListNumbered) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("TOP LINE", "${uiState.currentTopLine}", modifier = Modifier.weight(1f))
                        StatItem("BOTTOM LINE", "${uiState.currentBottomLine}", modifier = Modifier.weight(1f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("PITCH", "%.1f px/ln".format(uiState.linePitchPx), modifier = Modifier.weight(1f))
                        StatItem("TOTAL DEDUCED", if (uiState.calculatedTotalLines > 0) "${uiState.calculatedTotalLines}" else "Scanning...", modifier = Modifier.weight(1f))
                    }
                }

                // Settled Frame Capture & Studio Ingestion Card
                TelemetryCard(title = "SETTLED FRAME STREAM (STUDIO INGESTION)", icon = Icons.Default.CameraAlt) {
                    val recState = uiState.recorderState
                    Row(modifier = Modifier.fillMaxWidth()) {
                        StatItem("FRAMES CAPTURED", "${uiState.uploadedFramesCount}", modifier = Modifier.weight(1f))
                        StatItem("SERVER SYNC", if (uiState.isBackendConnected) "ONLINE" else "OFFLINE", modifier = Modifier.weight(1f))
                    }
                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "STATUS: ${recState.processingStatus}",
                        color = Color(0xFF58A6FF),
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )

                    if (segments.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "LIVE FRAME UPLOADS:",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            for (seg in segments.take(5)) {
                                SegmentItemRow(seg)
                            }
                        }
                    }
                }

                // On-Screen Keyboard Suppression Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "ON-SCREEN KEYBOARD",
                                color = Color(0xFF58A6FF),
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = if (isKeyboardSuppressed) "Suppressed (External screen clear)" else "Auto (OS default)",
                                color = if (isKeyboardSuppressed) Color(0xFF00FF9D) else Color(0xFF8B949E),
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Button(
                            onClick = { DesktopPaginationService.instance?.toggleSoftKeyboard() },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isKeyboardSuppressed) Color(0xFF1F6FEB) else Color(0xFF30363D)
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.height(32.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
                        ) {
                            Text(
                                text = if (isKeyboardSuppressed) "Restore KB" else "Hide KB",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                color = Color.White
                            )
                        }
                    }
                }

                // FastAPI Python Studio Backend Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "FASTAPI OCR BACKEND",
                                color = Color(0xFF58A6FF),
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72))
                                )
                                Text(
                                    text = if (uiState.isBackendConnected) "ONLINE" else "DISCONNECTED",
                                    color = if (uiState.isBackendConnected) Color(0xFF00FF9D) else Color(0xFFFF7B72),
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = uiState.serverHost,
                            onValueChange = onServerHostChange,
                            label = { Text("Studio Host:Port (Laptop IP)") },
                            placeholder = { Text("192.168.86.83:8000") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.LightGray,
                                focusedBorderColor = Color(0xFF58A6FF),
                                unfocusedBorderColor = Color(0xFF30363D),
                                focusedLabelColor = Color(0xFF58A6FF),
                                unfocusedLabelColor = Color(0xFF8B949E)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                // Gemini API Configuration Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "GEMINI CLOUD EXTRACTION CONFIG",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = uiState.geminiApiKey,
                            onValueChange = onApiKeyChange,
                            label = { Text("Gemini API Key") },
                            placeholder = { Text("AIzaSy...") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.LightGray,
                                focusedBorderColor = Color(0xFF00FF9D),
                                unfocusedBorderColor = Color(0xFF30363D),
                                focusedLabelColor = Color(0xFF00FF9D),
                                unfocusedLabelColor = Color(0xFF8B949E)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                // Target Document Line Configuration Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "TARGET DOCUMENT LINE COUNT",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = if (uiState.targetTotalLines > 0) "${uiState.targetTotalLines}" else "",
                            onValueChange = { str ->
                                val parsed = str.filter { it.isDigit() }.toIntOrNull() ?: 0
                                onTargetLinesChange(parsed)
                            },
                            placeholder = { Text("0 (Auto-Detect via Bottom Fling)") },
                            label = { Text("Total Target Lines") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.LightGray,
                                focusedBorderColor = Color(0xFF00FF9D),
                                unfocusedBorderColor = Color(0xFF30363D),
                                focusedLabelColor = Color(0xFF00FF9D),
                                unfocusedLabelColor = Color(0xFF8B949E)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                // Raw Action / Diagnostics Buttons
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onTestPacer,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF21262D))
                    ) {
                        Text("Test Pacer (1.5s Dwell)", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }

                    Button(
                        onClick = onSendCapturesToApi,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF21262D))
                    ) {
                        Text("Send Captures to Python API", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }

                    Button(
                        onClick = onGetNextPageLine,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF21262D))
                    ) {
                        Text("Get line number of next page", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }

                    Button(
                        onClick = onAlignAndCaptureNextPage,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB))
                    ) {
                        Text("Next Page & Align To Top (Micro-Touch)", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }
                }

                // Status Console Footer Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF040D0A)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFF1F2E28), RoundedCornerShape(8.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "CONSOLE:",
                            color = Color(0xFF00FF9D),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = uiState.workflowStatus,
                            color = Color(0xFFC9D1D9),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TelemetryCard(
    title: String,
    icon: ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(icon, contentDescription = null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                Text(
                    text = title,
                    color = Color(0xFF8B949E),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
fun StatItem(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(text = label, color = Color(0xFF6E7681), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
        Text(
            text = value,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
fun PulsingStatusIndicator(isRunning: Boolean) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(
                    if (isRunning) Color(0xFF00FF9D).copy(alpha = alpha) else Color(0xFF6E7681)
                )
        )
        Text(
            text = if (isRunning) "RUN" else "IDLE",
            color = if (isRunning) Color(0xFF00FF9D) else Color(0xFF6E7681),
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun SegmentItemRow(seg: SegmentRecorderService.SegmentDetail) {
    val statusBadgeColor = when (seg.status) {
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
            .background(Color(0xFF0D1117), RoundedCornerShape(6.dp))
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Video #${seg.segmentIndex}: Lines ${seg.startLine} -> ${seg.endLine}",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = seg.statusMessage,
                    color = statusBadgeColor,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
            if (seg.markdownLineCount > 0) {
                Text(
                    text = "${seg.markdownLineCount} lines",
                    color = Color(0xFF00FF9D),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun MatrixCaptureTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF00FF9D),
            background = Color(0xFF0D1117),
            surface = Color(0xFF161B22)
        ),
        content = content
    )
}


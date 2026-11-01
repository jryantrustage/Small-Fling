package com.matrixcapture.app.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.matrixcapture.app.service.DesktopPaginationService
import com.matrixcapture.app.service.FloatingOverlayService

class MainActivity : ComponentActivity() {
    private val viewModel: CaptureViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            MatrixCaptureTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isOverlayActive by FloatingOverlayService.isOverlayRunning.collectAsState()
                val projectionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
                    if (res.resultCode == Activity.RESULT_OK && res.data != null) {
                        viewModel.startFullWorkflow(res.resultCode, res.data!!)
                    }
                }

                Surface(modifier = Modifier.fillMaxSize().safeDrawingPadding(), color = Color(0xFF0D1117)) {
                    MinimalStatusCardScreen(
                        uiState = uiState,
                        isOverlayActive = isOverlayActive,
                        onRun = { viewModel.beginOrchestration() },
                        onPause = { viewModel.pauseOrchestration() },
                        onResume = { viewModel.resumeOrchestration() },
                        onStop = { viewModel.endOrchestration() },
                        onInit = { viewModel.runDagInit() },
                        onOpenAccessibility = { viewModel.openAccessibilitySettings() },
                        onStartProjection = {
                            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                            projectionLauncher.launch(mpm.createScreenCaptureIntent())
                        },
                        onToggleHud = {
                            if (!Settings.canDrawOverlays(this)) {
                                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                            } else if (isOverlayActive) {
                                FloatingOverlayService.stop(this)
                            } else {
                                FloatingOverlayService.start(this)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun MinimalStatusCardScreen(
    uiState: CaptureViewModel.UiState,
    isOverlayActive: Boolean,
    onRun: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    onInit: () -> Unit,
    onOpenAccessibility: () -> Unit,
    onStartProjection: () -> Unit,
    onToggleHud: () -> Unit
) {
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()
    val isRunning = uiState.orchestrationStatus == "RUNNING" || uiState.isWorkflowRunning
    val isPaused = uiState.orchestrationStatus == "PAUSED"
    val statusText = when {
        isRunning -> "RUNNING"
        isPaused -> "PAUSED"
        else -> uiState.orchestrationStatus.ifEmpty { "IDLE" }
    }
    val statusColor = when (statusText) {
        "RUNNING" -> Color(0xFF00FF9D)
        "PAUSED" -> Color(0xFFD29922)
        "COMPLETED" -> Color(0xFF58A6FF)
        "ABORTED" -> Color(0xFFFF7B72)
        else -> Color(0xFF8B949E)
    }

    val resolvedDev = uiState.deviceModel.resolve()
    val displayPage = uiState.deviceModel.displayPageForTopLine(uiState.currentTopLine)
    val topLn = if (uiState.currentTopLine > 0) uiState.currentTopLine else 1
    val botLn = if (uiState.currentBottomLine > 0) uiState.currentBottomLine else resolvedDev.linesPerPage
    val totalLn = if (uiState.calculatedTotalLines > 0) uiState.calculatedTotalLines else uiState.targetTotalLines
    val extDisplay = uiState.targetDisplay
    val displayIdLabel = extDisplay?.let { "Display ${it.displayId}" } ?: "Display 0 (Default)"
    val resolutionLabel = extDisplay?.let { "${it.width}x${it.height}" } ?: "1920x1080"
    val dagStepLabel = uiState.orchestrationStepLabel.ifEmpty { uiState.orchestrationActiveStep.ifEmpty { "START_READY" } }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // Top Header Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "SMALL-FLING MOBILE",
                    color = Color(0xFF00FF9D),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
                Text(
                    "${resolvedDev.displayName} • ${resolvedDev.linesPerPage} lines/pg",
                    color = Color(0xFF8B949E),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
            Box(
                modifier = Modifier
                    .background(Color(0xFF161B22), RoundedCornerShape(12.dp))
                    .border(1.dp, statusColor.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                PulsingStatusIndicator(isRunning = isRunning, statusText = statusText, statusColor = statusColor)
            }
        }

        // Single Dark Status Card
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .border(1.dp, statusColor.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // 1. External Display Connection Status (Display ID, 1920x1080, KB Suppressed)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0D1117), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0xFF21262D), RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "EXTERNAL DISPLAY STATUS",
                        color = Color(0xFF8B949E),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        StatusChip(
                            label = displayIdLabel,
                            active = extDisplay != null,
                            activeColor = Color(0xFF00FF9D)
                        )
                        StatusChip(
                            label = resolutionLabel,
                            active = true,
                            activeColor = Color(0xFF58A6FF)
                        )
                        Box(
                            modifier = Modifier.clickable {
                                DesktopPaginationService.instance?.toggleSoftKeyboard()
                            }
                        ) {
                            StatusChip(
                                label = if (isKeyboardSuppressed) "KB Suppressed" else "KB Open",
                                active = isKeyboardSuppressed,
                                activeColor = Color(0xFF00FF9D),
                                inactiveColor = Color(0xFFFF7B72)
                            )
                        }
                    }
                }

                // 2. Backend WebSocket/HTTP Sync Status
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0D1117), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0xFF21262D), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            "BACKEND WS/HTTP SYNC",
                            color = Color(0xFF8B949E),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            uiState.serverHost,
                            color = Color(0xFFC9D1D9),
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    StatusChip(
                        label = if (uiState.isBackendConnected) "SYNCED" else "OFFLINE",
                        active = uiState.isBackendConnected,
                        activeColor = Color(0xFF00FF9D),
                        inactiveColor = Color(0xFFFF7B72)
                    )
                }

                // 3. Current DAG Step, Page, and Line Range (Ln X -> Y of Total)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0D1117), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp))
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        "DAG STEP: $dagStepLabel",
                        color = Color(0xFFFFA657),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        "PAGE $displayPage",
                        color = Color(0xFF58A6FF),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                    val totalText = if (totalLn > 0) "$totalLn" else "Total"
                    Text(
                        "Ln $topLn -> $botLn of $totalText",
                        color = Color(0xFF00FF9D),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    val progress = if (totalLn > 0) (botLn.toFloat() / totalLn.toFloat()).coerceIn(0f, 1f) else 0f
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = Color(0xFF00FF9D),
                        trackColor = Color(0xFF21262D)
                    )
                }

                if (!uiState.isAccessibilityActive) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF3B1E1E), RoundedCornerShape(8.dp))
                            .clickable { onOpenAccessibility() }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Accessibility Service Disabled",
                            color = Color(0xFFFF7B72),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            "ENABLE ->",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }

        // 4. Primary Run / Pause / Stop Controls and Launch HUD Toggle
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ControlButton(
                    text = if (isPaused) "RESUME" else "RUN",
                    icon = Icons.Default.PlayArrow,
                    bg = if (isRunning) Color(0xFF21262D) else Color(0xFF00FF9D),
                    fg = if (isRunning) Color(0xFF8B949E) else Color.Black,
                    modifier = Modifier.weight(1f),
                    onClick = { if (isPaused) onResume() else onRun() }
                )
                ControlButton(
                    text = "PAUSE",
                    icon = Icons.Default.Pause,
                    bg = if (isRunning) Color(0xFFD29922) else Color(0xFF21262D),
                    fg = if (isRunning) Color.Black else Color(0xFF8B949E),
                    modifier = Modifier.weight(1f),
                    onClick = onPause
                )
                ControlButton(
                    text = "STOP",
                    icon = Icons.Default.Stop,
                    bg = if (isRunning || isPaused) Color(0xFFDA3633) else Color(0xFF21262D),
                    fg = if (isRunning || isPaused) Color.White else Color(0xFF8B949E),
                    modifier = Modifier.weight(1f),
                    onClick = onStop
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onInit,
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF58A6FF)),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF30363D))
                ) {
                    Icon(Icons.Default.Refresh, null, tint = Color(0xFF58A6FF), modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("DAG Init", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }

                Button(
                    onClick = onToggleHud,
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isOverlayActive) Color(0xFFDA3633) else Color(0xFF238636)
                    )
                ) {
                    Icon(Icons.Default.Layers, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        if (isOverlayActive) "Close HUD" else "Launch HUD",
                        color = Color.White,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChip(
    label: String,
    active: Boolean,
    activeColor: Color,
    inactiveColor: Color = Color(0xFF8B949E)
) {
    val color = if (active) activeColor else inactiveColor
    Row(
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(color))
        Text(
            label,
            color = color,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun ControlButton(
    text: String,
    icon: ImageVector,
    bg: Color,
    fg: Color,
    modifier: Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(50.dp),
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = bg),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp))
            Text(text, color = fg, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
        }
    }
}

@Composable
fun PulsingStatusIndicator(isRunning: Boolean, statusText: String, statusColor: Color) {
    val alpha by rememberInfiniteTransition("pulse").animateFloat(
        initialValue = 0.35f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Reverse),
        label = "alpha"
    )
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(if (isRunning) statusColor.copy(alpha = alpha) else statusColor)
        )
        Text(
            statusText,
            color = statusColor,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold
        )
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

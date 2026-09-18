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
                        onStartWorkflow = {
                            val mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                            projectionLauncher.launch(mediaProjectionManager.createScreenCaptureIntent())
                        },
                        onStopWorkflow = { viewModel.stopWorkflow() },
                        onOpenAccessibility = { viewModel.openAccessibilitySettings() },
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
    onStartWorkflow: () -> Unit,
    onStopWorkflow: () -> Unit,
    onOpenAccessibility: () -> Unit,
    onToggleOverlay: () -> Unit
) {
    val scrollState = rememberScrollState()
    val segments by SegmentRecorderService.segmentDetails.collectAsState()
    val totalFinalLines by SegmentRecorderService.totalFinalLines.collectAsState()
    val isKeyboardSuppressed by DesktopPaginationService.isSoftKeyboardSuppressed.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "MATRIX CAPTURE",
                    color = Color(0xFF00FF9D),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 2.sp
                )
                Text(
                    text = "Pixel 10 Desktop Mode OCR Splicer",
                    color = Color(0xFF8B949E),
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace
                )
            }

            // Live status pulsing dot
            PulsingStatusIndicator(isRunning = uiState.isWorkflowRunning)
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
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "READY: Open Microsoft Teams Markdown viewer on Display 1. Launch the Floating HUD Overlay to control pagination directly on your monitor, or tap START WORKFLOW below.",
                        color = Color(0xFF8B949E),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                } else {
                    Text(
                        text = "External Display 1 is currently not detected. Follow these steps to activate:",
                        color = Color(0xFFFFA198),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "• Capture Card Mode: Connect USB-C DisplayPort cable to your laptop capture card. Open the Camera app (or OBS) on your laptop to enable the capture card handshake and initiate Desktop Mode.",
                        color = Color(0xFFE6EDF3),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "• Touchscreen Monitor Mode: Connect directly to your external monitor. Desktop Mode will launch automatically.",
                        color = Color(0xFFE6EDF3),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Real-Time Gutter Telemetry Card
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

            Spacer(modifier = Modifier.height(10.dp))

            // Dwell countdown indicator (1.5s freeze)
            Text(
                text = "1.5s DWELL FREEZE: ${uiState.dwellCountdownMs}ms remaining",
                color = Color(0xFF00FF9D),
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
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

        // Video Segment & Chunking Progress Card
        TelemetryCard(title = "VIDEO CHUNK RECORDER (1,200 LINES / SEGMENT)", icon = Icons.Default.VideoCall) {
            val recState = uiState.recorderState
            Row(modifier = Modifier.fillMaxWidth()) {
                StatItem("ACTIVE SEGMENT", "#%03d".format(recState.currentSegmentIndex), modifier = Modifier.weight(1f))
                StatItem("START LINE", "${recState.currentStartLine}", modifier = Modifier.weight(1f))
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                StatItem("CHUNKS MADE", "${recState.completedSegmentsCount}", modifier = Modifier.weight(1f))
                StatItem("EXTRACTED", "${recState.processedSegmentsCount}", modifier = Modifier.weight(1f))
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
                    text = "SEGMENT TRACKING & OCR VERIFICATION:",
                    color = Color(0xFF8B949E),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (seg in segments) {
                        SegmentItemRow(seg)
                    }
                }
            }

            val finalLines = totalFinalLines
            if (finalLines != null && finalLines > 0) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "✔ FINALIZED STITCHED MARKDOWN: $finalLines total lines",
                    color = Color(0xFF00FF9D),
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Floating Overlay Controller Card
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "FLOATING HUD OVERLAY",
                        color = Color(0xFF00FF9D),
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp
                    )
                    Button(
                        onClick = onToggleOverlay,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isOverlayActive) Color(0xFFDA3633) else Color(0xFF238636)
                        ),
                        shape = RoundedCornerShape(8.dp)
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
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Runs a compact, draggable HUD with live line trackers & controls on Screen 0/1.",
                    color = Color(0xFF8B949E),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "ON-SCREEN KEYBOARD",
                            color = Color(0xFF58A6FF),
                            fontSize = 10.sp,
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

                Spacer(modifier = Modifier.height(8.dp))

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Uploaded Frames:",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "${uiState.uploadedFramesCount}",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Web Studio:",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "http://localhost:5173",
                            color = Color(0xFF58A6FF),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }

        // Gemini API Configuration
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

        // Assembly Output Results Card
        val assembly = uiState.assemblyResult
        if (assembly != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0D281E)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFF00FF9D), RoundedCornerShape(12.dp))
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF00FF9D))
                        Text(
                            text = "DOCUMENT SPLICED & SAVED",
                            color = Color(0xFF00FF9D),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Total Lines: ${assembly.totalLines} | Chars: ${assembly.totalCharacters}",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "Location: Documents/MatrixCapture/",
                        color = Color(0xFF8B949E),
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    if (assembly.warnings.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        assembly.warnings.forEach { warn ->
                            Text(text = "⚠ $warn", color = Color(0xFFE3B341), fontSize = 11.sp)
                        }
                    }
                }
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
                    supportingText = {
                        Text(
                            text = if (uiState.targetTotalLines > 0)
                                "Current Target: ${uiState.targetTotalLines} lines"
                            else
                                "Auto-detects document length via bottom fling calibration or dynamic EOF detection",
                            color = Color(0xFF8B949E),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    },
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

        // Action Buttons
        Spacer(modifier = Modifier.height(4.dp))
        if (!uiState.isWorkflowRunning) {
            Button(
                onClick = onResetSession,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 44.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE36209))
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "RESET SESSION (PAGE 1, LINE 1)",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Button(
                onClick = onCalibrate,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 44.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1F6FEB))
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.Straighten,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "AUTO-CALIBRATE (FLING TO BOTTOM & DETECT LINES)",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Button(
                onClick = onTestPacer,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636))
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        Icons.Default.Speed,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "TEST PACER (1.5s Dwell)",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp
                        )
                        Text(
                            text = "Test page scroll gestures without recording",
                            color = Color(0xFFB4F0C0),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Button(
                onClick = onStartWorkflow,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 60.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00FF9D))
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        Icons.Default.CameraAlt,
                        contentDescription = null,
                        tint = Color.Black,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "START SETTLED CAPTURE",
                            color = Color.Black,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            letterSpacing = 0.5.sp
                        )
                        Text(
                            text = "Capture & Upload • Zero Blur Pacer",
                            color = Color(0xFF083C25),
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        } else {
            Button(
                onClick = onStopWorkflow,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 56.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDA3633))
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.Stop,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "STOP WORKFLOW",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 15.sp
                    )
                }
            }
        }

        // Status Console Footer Card
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF040D0A)),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp)
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
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(
                    if (isRunning) Color(0xFF00FF9D).copy(alpha = alpha) else Color(0xFF6E7681)
                )
        )
        Text(
            text = if (isRunning) "ACTIVE" else "IDLE",
            color = if (isRunning) Color(0xFF00FF9D) else Color(0xFF6E7681),
            fontSize = 12.sp,
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


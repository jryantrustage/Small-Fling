package com.matrixcapture.app.kiosk

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Dedicated Activity designed for external presentation displays in Kiosk Mode.
 * Enforces:
 * - FLAG_KEEP_SCREEN_ON
 * - Fullscreen immersive sticky bars (WindowInsetsControllerCompat)
 * - Hardware key interception (Alt+Tab, Meta/Super, Esc, App Switch)
 * - COSU Lock Task Mode execution
 */
class KioskPresentationActivity : ComponentActivity() {

    private var suppressHotkeys = true
    private var targetPackage: String? = null
    private var displayId: Int = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        KioskManager.setKioskActivity(this)

        // 1. Keep Screen On
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Fullscreen Immersive Sticky Flags
        setupImmersiveFullscreen()

        // 3. Extract Intent extras
        targetPackage = intent.getStringExtra(EXTRA_TARGET_PACKAGE)
        displayId = intent.getIntExtra(EXTRA_DISPLAY_ID, -1)
        suppressHotkeys = intent.getBooleanExtra(EXTRA_SUPPRESS_HOTKEYS, true)

        Log.i(TAG, "KioskPresentationActivity created: displayId=$displayId, targetPackage=$targetPackage, suppressHotkeys=$suppressHotkeys")

        // 4. Enter Lock Task Mode
        try {
            startLockTask()
            Log.i(TAG, "startLockTask() initiated successfully")
        } catch (e: Exception) {
            Log.w(TAG, "startLockTask() could not be started immediately: ${e.message}")
        }

        setContent {
            KioskPresentationScreen(
                displayId = displayId,
                targetPackage = targetPackage ?: packageName,
                isDeviceOwner = KioskAdminReceiver.isDeviceOwner(this),
                onLaunchTarget = { launchTargetApp() },
                onReleaseLock = {
                    KioskManager.releaseLock(this)
                    finish()
                }
            )
        }
    }

    override fun onResume() {
        super.onResume()
        setupImmersiveFullscreen()
        try {
            startLockTask()
        } catch (e: Exception) {
            Log.d(TAG, "Lock task check in onResume: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        KioskManager.setKioskActivity(null)
    }

    private fun setupImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    /**
     * Peripheral & Hardware Input Interception:
     * Swallows unhandled hardware keys (KEYCODE_ESCAPE, KEYCODE_WINDOW, KEYCODE_APP_SWITCH, KEYCODE_TAB with modifiers)
     * while preserving necessary application inputs.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (suppressHotkeys) {
            val keyCode = event.keyCode
            val isAlt = event.isAltPressed
            val isMeta = event.isMetaPressed
            val isCtrl = event.isCtrlPressed

            // Intercept Alt+Tab, Meta+Tab, Ctrl+Tab
            if (keyCode == KeyEvent.KEYCODE_TAB && (isAlt || isMeta || isCtrl)) {
                Log.d(TAG, "Swallowed global navigation key: TAB with modifiers")
                return true
            }

            // Intercept Meta / Windows / Super Key
            if (keyCode == KeyEvent.KEYCODE_WINDOW || keyCode == KeyEvent.KEYCODE_META_LEFT || keyCode == KeyEvent.KEYCODE_META_RIGHT) {
                Log.d(TAG, "Swallowed Meta/Super Windows key")
                return true
            }

            // Intercept Escape key
            if (keyCode == KeyEvent.KEYCODE_ESCAPE) {
                Log.d(TAG, "Swallowed Escape key")
                return true
            }

            // Intercept App Switch (Recent Apps) & Home
            if (keyCode == KeyEvent.KEYCODE_APP_SWITCH || keyCode == KeyEvent.KEYCODE_ALL_APPS) {
                Log.d(TAG, "Swallowed App Switch key")
                return true
            }

            // Intercept Taskbar / Launcher shortcuts
            if (isMeta || (isAlt && keyCode == KeyEvent.KEYCODE_SPACE)) {
                Log.d(TAG, "Swallowed launcher shortcut key")
                return true
            }
        }

        return super.dispatchKeyEvent(event)
    }

    private fun launchTargetApp() {
        val pkg = targetPackage ?: return
        if (pkg != packageName) {
            val launchIntent = packageManager.getLaunchIntentForPackage(pkg)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            }
        }
    }

    companion object {
        private const val TAG = "KioskPresentationActivity"
        const val EXTRA_TARGET_PACKAGE = "extra_target_package"
        const val EXTRA_DISPLAY_ID = "extra_display_id"
        const val EXTRA_SUPPRESS_HOTKEYS = "extra_suppress_hotkeys"
    }
}

@Composable
fun KioskPresentationScreen(
    displayId: Int,
    targetPackage: String,
    isDeviceOwner: Boolean,
    onLaunchTarget: () -> Unit,
    onReleaseLock: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF070B10)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier
                    .widthIn(max = 640.dp)
                    .background(Color(0xFF0D1117), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFF30363D), RoundedCornerShape(16.dp))
                    .padding(32.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .background(Color(0xFF00FF9D), CircleShape)
                    )
                    Text(
                        text = "SECURE EXTERNAL KIOSK MODE",
                        color = Color(0xFF00FF9D),
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 18.sp,
                        letterSpacing = 1.sp
                    )
                }

                HorizontalDivider(color = Color(0xFF21262D))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("TARGET DISPLAY", color = Color(0xFF8B949E), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text("Display #$displayId (External Monitor)", color = Color(0xFFF0F6FC), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("LOCKED PACKAGE", color = Color(0xFF8B949E), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(targetPackage, color = Color(0xFF58A6FF), fontSize = 14.sp, fontFamily = FontFamily.Monospace)
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("SECURITY CONTEXT", color = Color(0xFF8B949E), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(if (isDeviceOwner) "Device Owner (Full COSU)" else "Lock Task (Pinned App)", color = Color(0xFF00FF9D), fontSize = 13.sp)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("PERIPHERAL STATUS", color = Color(0xFF8B949E), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text("Alt+Tab / Meta / Esc Intercepted", color = Color(0xFFF0883E), fontSize = 13.sp)
                    }
                }

                HorizontalDivider(color = Color(0xFF21262D))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Button(
                        onClick = onLaunchTarget,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF238636)),
                        modifier = Modifier.weight(1f).height(46.dp),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("FOCUS TARGET APP", fontWeight = FontWeight.SemiBold)
                    }

                    OutlinedButton(
                        onClick = onReleaseLock,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF85149)),
                        modifier = Modifier.height(46.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFDA3633)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.LockOpen, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("EMERGENCY EXIT", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

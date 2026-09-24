package com.matrixcapture.app.kiosk

import android.app.Activity
import android.app.ActivityOptions
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import com.matrixcapture.app.service.DesktopPaginationService

enum class KioskLockStatus {
    UNLOCKED,
    PINNED,
    LOCKED_TASK_EXTERNAL
}

enum class KioskDisplayMode {
    FREEFORM,
    MIRRORED,
    LOCKED_TASK
}

data class ConnectedDisplayInfo(
    val displayId: Int,
    val name: String,
    val width: Int,
    val height: Int,
    val refreshRate: Float,
    val isPresentation: Boolean,
    val isDefault: Boolean,
    val isValid: Boolean
)

data class KioskTelemetryState(
    val lockStatus: KioskLockStatus = KioskLockStatus.UNLOCKED,
    val kioskMode: KioskDisplayMode = KioskDisplayMode.FREEFORM,
    val targetDisplayId: Int = -1,
    val lockedPackage: String = "",
    val isDeviceOwner: Boolean = false,
    val connectedDisplays: List<ConnectedDisplayInfo> = emptyList(),
    val suppressHotkeys: Boolean = true,
    val disableStatusBar: Boolean = true,
    val preventSleep: Boolean = true
)

/**
 * Singleton orchestrating external display routing, DisplayListener hot-plug handling,
 * and remote Lock Task / Kiosk mode lifecycle.
 */
object KioskManager {
    private const val TAG = "KioskManager"

    private val _telemetryState = MutableStateFlow(KioskTelemetryState())
    val telemetryState: StateFlow<KioskTelemetryState> = _telemetryState.asStateFlow()

    private var appContext: Context? = null
    private var displayManager: DisplayManager? = null
    private var isListenerRegistered = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private var currentKioskActivity: Activity? = null

    fun setKioskActivity(activity: Activity?) {
        currentKioskActivity = activity
    }

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {
            Log.i(TAG, "External display added: displayId=$displayId")
            if (displayId == Display.DEFAULT_DISPLAY) return
            refreshConnectedDisplays()

            // If we were locked and the target monitor reconnected, re-route
            val state = _telemetryState.value
            if (state.lockStatus != KioskLockStatus.UNLOCKED && (state.targetDisplayId == displayId || state.targetDisplayId == -1)) {
                Log.i(TAG, "Re-binding kiosk to reconnected display $displayId")
                val ctx = currentKioskActivity ?: appContext
                ctx?.let { act ->
                    lockExternalDisplay(
                        context = act,
                        targetDisplayId = displayId,
                        packageId = state.lockedPackage.ifEmpty { act.packageName },
                        mode = state.kioskMode
                    )
                }
            } else {
                Log.i(TAG, "Triggering automatic viewport auto-refresh for reconnected display $displayId")
                triggerAutoRefreshOnReconnect(displayId)
            }
        }

        override fun onDisplayRemoved(displayId: Int) {
            Log.w(TAG, "External display removed: displayId=$displayId")
            refreshConnectedDisplays()
            val state = _telemetryState.value
            if (state.targetDisplayId == displayId) {
                Log.w(TAG, "Target kiosk display $displayId disconnected. Maintaining policy state awaiting reconnect.")
            }
        }

        override fun onDisplayChanged(displayId: Int) {
            Log.d(TAG, "Display changed: displayId=$displayId")
            refreshConnectedDisplays()
        }
    }

    /**
     * Option 1 Auto-Refresh Step:
     * When an external display reconnects, Chromium WebView frequently caches narrow phone metrics.
     * This auto-refresh invalidates the viewport, triggers task resize reflow, and
     * brings the target app forward on the external display with native desktop bounds.
     */
    fun triggerAutoRefreshOnReconnect(displayId: Int) {
        mainHandler.postDelayed({
            try {
                Log.i(TAG, "Executing Auto-Refresh step for external display #$displayId")
                val ctx = currentKioskActivity ?: appContext

                // 1. Invoke AccessibilityService reflow if active
                DesktopPaginationService.instance?.let { paginationService ->
                    CoroutineScope(Dispatchers.Main).launch {
                        paginationService.autoRefreshDisplayViewport(displayId)
                    }
                }

                // 2. Bring target package forward with explicit launchDisplayId
                val targetPkg = _telemetryState.value.lockedPackage.ifEmpty { "com.microsoft.teams" }
                if (ctx != null) {
                    val launchIntent = ctx.packageManager.getLaunchIntentForPackage(targetPkg)
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        val options = ActivityOptions.makeBasic().apply {
                            launchDisplayId = displayId
                        }
                        ctx.startActivity(launchIntent, options.toBundle())
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error executing auto-refresh on display $displayId", e)
            }
        }, 850L)
    }

    fun initialize(context: Context) {
        appContext = context.applicationContext
        val dm = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return
        displayManager = dm

        if (!isListenerRegistered) {
            dm.registerDisplayListener(displayListener, mainHandler)
            isListenerRegistered = true
        }

        val isOwner = KioskAdminReceiver.isDeviceOwner(context)
        _telemetryState.value = _telemetryState.value.copy(isDeviceOwner = isOwner)
        refreshConnectedDisplays()
    }

    fun getConnectedDisplays(context: Context? = null): List<ConnectedDisplayInfo> {
        val dm = displayManager ?: (context?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager) ?: return emptyList()
        val all = dm.displays
        return all.map { d ->
            val mode = d.mode
            val isPres = (d.flags and Display.FLAG_PRESENTATION) != 0 || d.displayId != Display.DEFAULT_DISPLAY
            ConnectedDisplayInfo(
                displayId = d.displayId,
                name = d.name ?: "Display #${d.displayId}",
                width = mode.physicalWidth,
                height = mode.physicalHeight,
                refreshRate = mode.refreshRate,
                isPresentation = isPres,
                isDefault = d.displayId == Display.DEFAULT_DISPLAY,
                isValid = d.isValid
            )
        }
    }

    fun refreshConnectedDisplays() {
        val list = getConnectedDisplays()
        _telemetryState.value = _telemetryState.value.copy(connectedDisplays = list)
    }

    /**
     * Finds the primary external presentation display (e.g. DisplayPort Alt Mode / HDMI).
     */
    fun findExternalDisplayId(): Int {
        val dm = displayManager ?: return -1
        val presentations = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
        if (presentations.isNotEmpty()) {
            return presentations[0].displayId
        }
        for (d in dm.displays) {
            if (d.displayId != Display.DEFAULT_DISPLAY && d.isValid) {
                return d.displayId
            }
        }
        return -1
    }

    /**
     * Locks the designated application onto the target external display.
     */
    fun lockExternalDisplay(
        context: Context,
        targetDisplayId: Int,
        packageId: String,
        mode: KioskDisplayMode = KioskDisplayMode.LOCKED_TASK,
        suppressHotkeys: Boolean = true,
        disableStatusBar: Boolean = true,
        preventSleep: Boolean = true
    ): Boolean {
        initialize(context)

        val resolvedDisplayId = if (targetDisplayId > 0) targetDisplayId else findExternalDisplayId()
        Log.i(TAG, "Engaging Kiosk Lock: displayId=$resolvedDisplayId, package=$packageId, mode=$mode")

        val isOwner = KioskAdminReceiver.isDeviceOwner(context)

        // 1. Configure DPC policies if Device Owner
        if (isOwner) {
            KioskAdminReceiver.configureLockTaskPolicies(
                context = context,
                packagesToAllow = listOf(packageId, context.packageName)
            )
            KioskAdminReceiver.setPeripheralRestrictions(
                context = context,
                disableKeyguard = true,
                preventSleep = preventSleep
            )
        }

        // 2. Launch target Activity targeting external displayId
        try {
            val intent = if (packageId.isNotEmpty() && packageId != context.packageName) {
                context.packageManager.getLaunchIntentForPackage(packageId) ?: Intent(context, KioskPresentationActivity::class.java).apply {
                    putExtra(KioskPresentationActivity.EXTRA_TARGET_PACKAGE, packageId)
                }
            } else {
                Intent(context, KioskPresentationActivity::class.java)
            }

            intent.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(KioskPresentationActivity.EXTRA_DISPLAY_ID, resolvedDisplayId)
                putExtra(KioskPresentationActivity.EXTRA_SUPPRESS_HOTKEYS, suppressHotkeys)
            }

            val options = ActivityOptions.makeBasic().apply {
                if (resolvedDisplayId >= 0) {
                    launchDisplayId = resolvedDisplayId
                }
                if (isOwner) {
                    setLockTaskEnabled(true)
                }
            }

            context.startActivity(intent, options.toBundle())

            val finalLockStatus = if (isOwner) {
                KioskLockStatus.LOCKED_TASK_EXTERNAL
            } else {
                KioskLockStatus.PINNED
            }

            _telemetryState.value = _telemetryState.value.copy(
                lockStatus = finalLockStatus,
                kioskMode = mode,
                targetDisplayId = resolvedDisplayId,
                lockedPackage = packageId,
                suppressHotkeys = suppressHotkeys,
                disableStatusBar = disableStatusBar,
                preventSleep = preventSleep
            )

            Log.i(TAG, "Kiosk mode engaged successfully: status=$finalLockStatus")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed launching lock task activity to display $resolvedDisplayId", e)
            return false
        }
    }

    /**
     * Clean Exit: terminates Lock Task Mode and restores standard freeform desktop window controls.
     */
    fun releaseLock(context: Context): Boolean {
        Log.i(TAG, "Releasing Kiosk Lock Task Mode")
        try {
            currentKioskActivity?.stopLockTask()

            if (KioskAdminReceiver.isDeviceOwner(context)) {
                KioskAdminReceiver.clearLockTaskPolicies(context)
            }

            _telemetryState.value = _telemetryState.value.copy(
                lockStatus = KioskLockStatus.UNLOCKED,
                kioskMode = KioskDisplayMode.FREEFORM,
                targetDisplayId = -1,
                lockedPackage = ""
            )

            Log.i(TAG, "Lock released successfully")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping lock task mode", e)
            _telemetryState.value = _telemetryState.value.copy(
                lockStatus = KioskLockStatus.UNLOCKED
            )
            return false
        }
    }
}

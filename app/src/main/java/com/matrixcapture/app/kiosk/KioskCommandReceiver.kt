package com.matrixcapture.app.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver exposing remote RPC commands for ADB and backend synchronization.
 * Supports:
 * - LOCK_EXTERNAL_DISPLAY
 * - RELEASE_LOCK
 * - QUERY_STATUS
 */
class KioskCommandReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received Kiosk RPC action: $action")

        when (action) {
            ACTION_LOCK_EXTERNAL_DISPLAY -> {
                val displayId = intent.getIntExtra(EXTRA_DISPLAY_ID, -1)
                val packageId = intent.getStringExtra(EXTRA_PACKAGE_ID) ?: ""
                val modeStr = intent.getStringExtra(EXTRA_MODE) ?: "kiosk"
                val suppressHotkeys = intent.getBooleanExtra(EXTRA_SUPPRESS_HOTKEYS, true)
                val disableStatusBar = intent.getBooleanExtra(EXTRA_DISABLE_STATUS_BAR, true)
                val preventSleep = intent.getBooleanExtra(EXTRA_PREVENT_SLEEP, true)

                val mode = when (modeStr.lowercase()) {
                    "freeform" -> KioskDisplayMode.FREEFORM
                    "mirrored" -> KioskDisplayMode.MIRRORED
                    else -> KioskDisplayMode.LOCKED_TASK
                }

                KioskManager.lockExternalDisplay(
                    context = context,
                    targetDisplayId = displayId,
                    packageId = packageId,
                    mode = mode,
                    suppressHotkeys = suppressHotkeys,
                    disableStatusBar = disableStatusBar,
                    preventSleep = preventSleep
                )
            }

            ACTION_RELEASE_LOCK -> {
                KioskManager.releaseLock(context)
            }

            ACTION_QUERY_STATUS -> {
                KioskManager.refreshConnectedDisplays()
            }

            ACTION_AUTO_REFRESH_DISPLAY -> {
                val displayId = intent.getIntExtra(EXTRA_DISPLAY_ID, -1)
                val resolvedId = if (displayId > 0) displayId else KioskManager.findExternalDisplayId()
                KioskManager.triggerAutoRefreshOnReconnect(resolvedId)
            }
        }
    }

    companion object {
        private const val TAG = "KioskCommandReceiver"

        const val ACTION_LOCK_EXTERNAL_DISPLAY = "com.matrixcapture.app.action.LOCK_EXTERNAL_DISPLAY"
        const val ACTION_RELEASE_LOCK = "com.matrixcapture.app.action.RELEASE_LOCK"
        const val ACTION_QUERY_STATUS = "com.matrixcapture.app.action.QUERY_STATUS"
        const val ACTION_AUTO_REFRESH_DISPLAY = "com.matrixcapture.app.action.AUTO_REFRESH_DISPLAY"

        const val EXTRA_DISPLAY_ID = "display_id"
        const val EXTRA_PACKAGE_ID = "package_id"
        const val EXTRA_MODE = "mode"
        const val EXTRA_SUPPRESS_HOTKEYS = "suppress_hotkeys"
        const val EXTRA_DISABLE_STATUS_BAR = "disable_status_bar"
        const val EXTRA_PREVENT_SLEEP = "prevent_sleep"
    }
}

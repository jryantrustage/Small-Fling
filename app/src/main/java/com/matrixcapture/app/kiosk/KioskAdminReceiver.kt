package com.matrixcapture.app.kiosk

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager
import android.util.Log

/**
 * Dedicated DeviceAdminReceiver / DPC for COSU (Corporate-Owned Single-Use) Lock Task Mode.
 * Enables dynamic allowlisting of packages and zero-leakage system UI flags.
 */
class KioskAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Kiosk Device Admin enabled successfully")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Kiosk Device Admin disabled")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Log.i(TAG, "Entering Lock Task Mode for package: $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Log.i(TAG, "Exiting Lock Task Mode")
    }

    companion object {
        private const val TAG = "KioskAdminReceiver"

        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context.applicationContext, KioskAdminReceiver::class.java)
        }

        fun isDeviceOwner(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return false
            return try {
                dpm.isDeviceOwnerApp(context.packageName)
            } catch (e: Exception) {
                Log.e(TAG, "Error checking isDeviceOwnerApp", e)
                false
            }
        }

        fun isAdminActive(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return false
            return try {
                dpm.isAdminActive(getComponentName(context))
            } catch (e: Exception) {
                Log.e(TAG, "Error checking isAdminActive", e)
                false
            }
        }

        /**
         * Configure dynamic allowlisting and zero-leakage system UI flags:
         * dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
         */
        fun configureLockTaskPolicies(
            context: Context,
            packagesToAllow: List<String>,
            lockTaskFeatures: Int = DevicePolicyManager.LOCK_TASK_FEATURE_NONE
        ): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return false
            val adminComponent = getComponentName(context)

            if (!dpm.isDeviceOwnerApp(context.packageName) && !dpm.isProfileOwnerApp(context.packageName)) {
                Log.w(TAG, "App is not Device Owner or Profile Owner. Dynamic setLockTaskPackages requires Device Owner.")
                return false
            }

            return try {
                val pkgList = (packagesToAllow + context.packageName).distinct().toTypedArray()
                dpm.setLockTaskPackages(adminComponent, pkgList)
                dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)
                Log.i(TAG, "Successfully configured Lock Task allowlist: ${pkgList.joinToString()} with features: $lockTaskFeatures")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to configure Lock Task policies", e)
                false
            }
        }

        /**
         * Clears Lock Task packages from allowlist to release policies.
         */
        fun clearLockTaskPolicies(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return false
            val adminComponent = getComponentName(context)

            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                return false
            }

            return try {
                dpm.setLockTaskPackages(adminComponent, emptyArray())
                dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
                Log.i(TAG, "Cleared Lock Task policies")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear Lock Task policies", e)
                false
            }
        }

        /**
         * Apply peripheral and system restrictions when in kiosk mode.
         */
        fun setPeripheralRestrictions(
            context: Context,
            disableKeyguard: Boolean = true,
            preventSleep: Boolean = true
        ) {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return
            val adminComponent = getComponentName(context)

            if (dpm.isDeviceOwnerApp(context.packageName)) {
                try {
                    dpm.setKeyguardDisabled(adminComponent, disableKeyguard)
                    if (preventSleep) {
                        dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed setting device restrictions", e)
                }
            }
        }
    }
}

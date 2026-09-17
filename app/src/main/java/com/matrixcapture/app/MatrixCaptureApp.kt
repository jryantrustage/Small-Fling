package com.matrixcapture.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class MatrixCaptureApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_RECORDER,
                "MatrixCapture Recorder Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Foreground screen capture & desktop mode pagination monitoring"
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID_RECORDER = "matrix_capture_channel"
        const val NOTIFICATION_ID_RECORDER = 1001
    }
}

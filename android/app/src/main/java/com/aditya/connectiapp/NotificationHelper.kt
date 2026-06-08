package com.aditya.connectiapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.util.Log

object NotificationHelper {
    private const val CHANNEL_ID = "geofence-alerts"
    private const val TAG = "NotificationHelper"

    fun showGeofenceNotification(context: Context, zoneId: String, zoneName: String) {
        try {
            createNotificationChannel(context)

            // Wave Action
            val waveIntent = Intent(context, GeofenceBroadcastReceiver::class.java).apply {
                action = "com.aditya.connectiapp.ACTION_WAVE"
                putExtra("zoneId", zoneId)
                putExtra("zoneName", zoneName)
            }
            val wavePendingIntent = PendingIntent.getBroadcast(
                context, zoneId.hashCode(), waveIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Later Action
            val laterIntent = Intent(context, GeofenceBroadcastReceiver::class.java).apply {
                action = "com.aditya.connectiapp.ACTION_LATER"
                putExtra("zoneId", zoneId)
                putExtra("zoneName", zoneName)
            }
            val laterPendingIntent = PendingIntent.getBroadcast(
                context, zoneId.hashCode() + 1, laterIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Content Intent (Open App)
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val contentPendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.notification_icon) // ✅ CHANGED: using local icon to prevent crash
                .setContentTitle("Entered $zoneName! 👋")
                .setContentText("Wave to let others know you're here!")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(contentPendingIntent)
                .addAction(android.R.drawable.ic_menu_send, "Wave 👋", wavePendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Later", laterPendingIntent)

            with(NotificationManagerCompat.from(context)) {
                notify(zoneId.hashCode(), builder.build())
            }
            Log.d(TAG, "✅ Native notification shown for $zoneName")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to show notification: ${e.message}")
        }
    }



    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Zone Alerts"
            val descriptionText = "Notifications when entering zones"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                enableLights(true)
                enableVibration(true)
            }
            val notificationManager: NotificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}

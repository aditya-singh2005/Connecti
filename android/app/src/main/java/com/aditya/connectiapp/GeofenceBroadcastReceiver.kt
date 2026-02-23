package com.aditya.connectiapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

class GeofenceBroadcastReceiver : android.content.BroadcastReceiver() {

    companion object {
        private const val TAG = "GeofenceReceiver"
        private const val CHANNEL_ID = "geofence-alerts"
        private const val CHANNEL_NAME = "Geofence Zone Alerts"

        // Testing: 10 second cooldown so repeated poll triggers show notifications quickly.
        // Change to 5 * 60 * 1000L for production.
        private const val COOLDOWN_MS = 10_000L
        private const val KILLED_STALE_MS = 5 * 60 * 1000L

        /**
         * Central handler called by both the real GEOFENCE_TRANSITION_ENTER path
         * and the ZonePollReceiver polling path.
         *
         * DB presence is only written on real ENTER events (not from poll).
         */
        @JvmStatic
        fun handleZonePresence(context: Context, zoneId: String, source: String) {
            // 1. Check "Later" suppression for today
            if (WaveActionReceiver.isLaterSuppressed(context, zoneId)) {
                Log.d(TAG, "⏳ 'Later' active for zone=$zoneId today, skipping notification")
                return
            }

            // 2. Check cooldown
            val now = System.currentTimeMillis()
            if (isInCooldown(context, zoneId, now)) {
                Log.d(TAG, "⏱️ Cooldown active for zone=$zoneId")
                return
            }

            Log.i(TAG, "🔔 Showing notification for zone=$zoneId source=$source")
            showNotification(context, zoneId, source)
        }

        private fun inferExecutionState(context: Context): String {
            val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
            val lastState = prefs.getString(NativeGeofenceModule.APP_RUNTIME_STATE_KEY, null)
            val lastStateAt = prefs.getString(NativeGeofenceModule.APP_RUNTIME_STATE_UPDATED_AT_KEY, "0")?.toLongOrNull() ?: 0L
            val ageMs = System.currentTimeMillis() - lastStateAt

            if (lastState == "active" && ageMs < 20_000L) return "foreground"
            if ((lastState == "background" || lastState == "inactive") && ageMs < KILLED_STALE_MS) return "background"
            return "killed"
        }

        private fun isInCooldown(context: Context, zoneId: String, now: Long): Boolean {
            val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
            val key = "last_notif_$zoneId"
            val last = prefs.getLong(key, 0L)
            if (now - last < COOLDOWN_MS) return true
            prefs.edit().putLong(key, now).apply()
            return false
        }

        private fun showNotification(context: Context, zoneId: String, source: String) {
            ensureChannel(context)

            val notificationId = zoneId.hashCode()
            val sourceLabel = source.uppercase()

            // ── Content Intent (tap body → open app) ─────────────────────────
            val launchIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("zoneId", zoneId)
                    putExtra("executionState", source)
                } ?: Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("zoneId", zoneId)
                putExtra("executionState", source)
            }

            val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            else
                PendingIntent.FLAG_UPDATE_CURRENT

            val contentIntent = PendingIntent.getActivity(context, notificationId, launchIntent, piFlags)

            // ── Wave action ───────────────────────────────────────────────────
            val waveIntent = Intent(context, WaveActionReceiver::class.java).apply {
                action = WaveActionReceiver.ACTION_WAVE
                putExtra(WaveActionReceiver.EXTRA_ZONE_ID, zoneId)
                putExtra(WaveActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
            }
            // Use unique request codes so PendingIntents are distinct
            val wavePi = PendingIntent.getBroadcast(
                context,
                notificationId + 1,
                waveIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                else
                    PendingIntent.FLAG_UPDATE_CURRENT
            )

            // ── Later action ──────────────────────────────────────────────────
            val laterIntent = Intent(context, WaveActionReceiver::class.java).apply {
                action = WaveActionReceiver.ACTION_LATER
                putExtra(WaveActionReceiver.EXTRA_ZONE_ID, zoneId)
                putExtra(WaveActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
            }
            val laterPi = PendingIntent.getBroadcast(
                context,
                notificationId + 2,
                laterIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                else
                    PendingIntent.FLAG_UPDATE_CURRENT
            )

            // ── Build notification ────────────────────────────────────────────
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
                .setContentTitle("You're in $zoneId! 👋")
                .setContentText("Wave to let others know you're here!")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .addAction(0, "Wave 👋", wavePi)
                .addAction(0, "Later", laterPi)
                .build()

            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(notificationId, notification)

            Log.i(TAG, "✅ Notification shown for zone=$zoneId [$sourceLabel]")
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return

            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notifications for geofence zone entry events"
                enableVibration(true)
                setShowBadge(true)
            }
            manager.createNotificationChannel(channel)
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val event = GeofencingEvent.fromIntent(intent ?: return) ?: return
        if (event.hasError()) {
            Log.w(TAG, "GeofencingEvent hasError=true")
            return
        }

        if (event.geofenceTransition != Geofence.GEOFENCE_TRANSITION_ENTER) {
            Log.d(TAG, "Ignoring geofence transition=${event.geofenceTransition}")
            return
        }

        val geofences = event.triggeringGeofences ?: return
        if (geofences.isEmpty()) {
            Log.w(TAG, "No triggering geofences in event")
            return
        }

        Log.i(TAG, "📡 Received geofence ENTER for ${geofences.size} geofence(s)")

        val source = inferExecutionState(context)

        for (geofence in geofences) {
            val zoneId = geofence.requestId

            // On real ENTER: write pending-wave entry for JS to sync DB on next launch
            NativeGeofenceModule.appendPendingWave(context, zoneId, source, System.currentTimeMillis())

            // Show notification (with Later check + cooldown inside)
            handleZonePresence(context, zoneId, source)
        }
    }
}

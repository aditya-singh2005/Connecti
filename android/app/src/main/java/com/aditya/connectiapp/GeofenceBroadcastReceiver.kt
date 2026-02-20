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
    private const val KILLED_STALE_MS = 5 * 60 * 1000
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

    Log.i(TAG, "Received geofence ENTER for ${geofences.size} geofence(s)")

    for (geofence in geofences) {
      val zoneId = geofence.requestId
      val source = inferExecutionState(context)
      val timestamp = System.currentTimeMillis()

      if (isInCooldown(context, zoneId, timestamp)) {
        Log.d(TAG, "Cooldown active for zone=$zoneId")
        continue
      }

      Log.i(TAG, "Posting native notification for zone=$zoneId source=$source")
      NativeGeofenceModule.appendPendingWave(context, zoneId, source, timestamp)
      showNotification(context, zoneId, source)
    }
  }

  private fun inferExecutionState(context: Context): String {
    val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
    val lastState = prefs.getString(NativeGeofenceModule.APP_RUNTIME_STATE_KEY, null)
    val lastStateAt = prefs.getString(NativeGeofenceModule.APP_RUNTIME_STATE_UPDATED_AT_KEY, "0")?.toLongOrNull() ?: 0L
    val ageMs = System.currentTimeMillis() - lastStateAt

    if (lastState == "active" && ageMs < 20_000L) {
      return "foreground"
    }

    if ((lastState == "background" || lastState == "inactive") && ageMs < KILLED_STALE_MS) {
      return "background"
    }

    return "killed"
  }

  private fun isInCooldown(context: Context, zoneId: String, now: Long): Boolean {
    val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
    val key = "last_native_geofence_notification_$zoneId"
    val last = prefs.getLong(key, 0L)

    if (now - last < 5_000L) {
      return true
    }

    prefs.edit().putLong(key, now).apply()
    return false
  }

  private fun showNotification(context: Context, zoneId: String, source: String) {
    ensureChannel(context)

    val sourceLabel = source.uppercase()

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

    val contentIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }

    val contentIntent = PendingIntent.getActivity(
      context,
      zoneId.hashCode(),
      launchIntent,
      contentIntentFlags
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle("Entered $zoneId [$sourceLabel]")
      .setContentText("[$sourceLabel] Tap 'Wave' to check in!")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .build()

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify((zoneId + source).hashCode(), notification)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications for geofence zone entry events"
      enableVibration(true)
      setShowBadge(true)
    }

    manager.createNotificationChannel(channel)
  }
}

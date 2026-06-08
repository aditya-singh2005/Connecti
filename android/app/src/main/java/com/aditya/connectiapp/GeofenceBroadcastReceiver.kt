package com.aditya.connectiapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.FusedLocationProviderClient
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.BackoffPolicy
import androidx.work.WorkRequest
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == "com.aditya.connectiapp.ACTION_WAVE") {
            handleNotificationAction(context, intent, "WAVE")
            return
        } else if (action == "com.aditya.connectiapp.ACTION_LATER") {
            handleNotificationAction(context, intent, "LATER")
            return
        }

        val geofencingEvent = GeofencingEvent.fromIntent(intent) ?: return
        
        if (geofencingEvent.hasError()) {
            Log.e("GeofenceReceiver", "Geofencing error code: ${geofencingEvent.errorCode}")
            return
        }

        val geofenceTransition = geofencingEvent.geofenceTransition
        if (geofenceTransition == Geofence.GEOFENCE_TRANSITION_ENTER) {
            val triggeringGeofences = geofencingEvent.triggeringGeofences ?: return
            
            val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            val isWaved = prefs.getBoolean("isWaved", false)
            
            val triggerLocation = geofencingEvent.triggeringLocation

            if (triggerLocation != null) {
                Log.d("GeofenceReceiver", "🔄 Triggering geofence refresh at ${triggerLocation.latitude}, ${triggerLocation.longitude}")
                val refreshData = Data.Builder()
                    .putDouble("lat", triggerLocation.latitude)
                    .putDouble("lng", triggerLocation.longitude)
                    .build()

                val refreshRequest = OneTimeWorkRequestBuilder<GeofenceRefreshWorker>()
                    .setInputData(refreshData)
                    .build()
                WorkManager.getInstance(context).enqueueUniqueWork("RefreshGeofences", ExistingWorkPolicy.REPLACE, refreshRequest)
            }

            for (geofence in triggeringGeofences) {
                val zoneId = geofence.requestId
                val zoneName = prefs.getString("zone_name_$zoneId", zoneId) ?: zoneId
                val appState = prefs.getString("app_runtime_state", "killed")
                
                Log.d("GeofenceReceiver", "📍 Presence Detected in: $zoneName (ID: $zoneId, State: $appState)")
                
                // ✅ SECONDARY VERIFICATION
                if (triggerLocation != null && !isLocationInZone(context, zoneId, triggerLocation.latitude, triggerLocation.longitude)) {
                    Log.w("GeofenceReceiver", "👻 Ghost Entry: Trigger location is outside $zoneName. Skipping notification/sync.")
                    continue
                }

                // ✅ UPDATE CURRENT ZONE FOR PRIVACY-SAFE POLLING
                prefs.edit().putString("current_zone", zoneId).apply()
                
                // ✅ ALWAYS TRIGGER SYNC (for Monitoring/DAU)
                val inputData = Data.Builder()
                    .putString("zoneId", zoneId)
                    .putBoolean("isWaving", isWaved)
                    .build()

                val syncRequest = OneTimeWorkRequestBuilder<ZoneSyncWorker>()
                    .setInputData(inputData)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                    .addTag("PresenceSync")
                    .build()

                WorkManager.getInstance(context).enqueueUniqueWork("PresenceSync_$zoneId", ExistingWorkPolicy.REPLACE, syncRequest)

                if (isWaved) {
                    Log.d("GeofenceReceiver", "🌊 Zone hopping refresh for $zoneId")
                    NativeGeofenceModule.scheduleExpiryWorker(context, 30 * 60 * 1000L)
                } else {
                    Log.d("GeofenceReceiver", "⏳ Scheduling Inactivity Timers for $zoneId")
                    PresenceInactivityWorker.schedule(context, zoneId, "reminder", 30 * 60 * 1000L)
                    PresenceInactivityWorker.schedule(context, zoneId, "removal", 60 * 60 * 1000L)

                    if (appState != "foreground" && !isLaterSuppressed(context, zoneName) && !isLocalCooldownActive(context, zoneName)) {
                        NotificationHelper.showGeofenceNotification(context, zoneId, zoneName)
                        setLocalCooldown(context, zoneName)
                    } else {
                        Log.d("GeofenceReceiver", "⏭️ Alert skipped: State=$appState, Suppressed=${isLaterSuppressed(context, zoneName)}, Cooldown=${isLocalCooldownActive(context, zoneName)}")
                    }
                }
            }
        } 
        
        if (geofenceTransition == Geofence.GEOFENCE_TRANSITION_EXIT) {
            val triggeringGeofences = geofencingEvent.triggeringGeofences ?: return
            val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            val isWaved = prefs.getBoolean("isWaved", false)

            for (geofence in triggeringGeofences) {
                val zoneId = geofence.requestId
                Log.d("GeofenceReceiver", "🚪 Exited: $zoneId")

                // ✅ CLEAR CURRENT ZONE ON EXIT
                if (prefs.getString("current_zone", null) == zoneId) {
                    prefs.edit().putString("current_zone", null).apply()
                }

                // Cancel inactivity timers
                PresenceInactivityWorker.cancelAll(context, zoneId)

                if (!isWaved) {
                    Log.d("GeofenceReceiver", "🗑️ User not waving. Immediate Exit cleanup for $zoneId")
                    val inputData = Data.Builder()
                        .putString("zoneId", zoneId)
                        .putString("action", "zone_exit_cleanup")
                        .build()

                    val cleanupRequest = OneTimeWorkRequestBuilder<ZoneSyncWorker>()
                        .setInputData(inputData)
                        .setInitialDelay(30, TimeUnit.SECONDS) // ✅ DWELL CHECK
                        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                        .build()

                    WorkManager.getInstance(context).enqueueUniqueWork("ExitCleanup_$zoneId", ExistingWorkPolicy.REPLACE, cleanupRequest)
                } else {
                    Log.d("GeofenceReceiver", "🌊 User is waving. Preserving presence until timer/grace expires.")
                }
            }
        }
    }

    private fun handleNotificationAction(context: Context, intent: Intent, actionType: String) {
        val zoneId = intent.getStringExtra("zoneId") ?: return
        Log.d("GeofenceReceiver", "👆 Notification Action Received: $actionType for $zoneId")

        // 1. Store in Pending Actions for JS to drain
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val pendingActionsJson = prefs.getString("pending_actions", "[]") ?: "[]"
        try {
            val actionsArray = org.json.JSONArray(pendingActionsJson)
            val newAction = JSONObject().apply {
                put("action", actionType)
                put("zoneId", zoneId)
                put("timestamp", System.currentTimeMillis())
            }
            actionsArray.put(newAction)
            prefs.edit().putString("pending_actions", actionsArray.toString()).apply()
            Log.d("GeofenceReceiver", "✅ Action stored in pending_actions: $newAction")
        } catch (e: Exception) {
            Log.e("GeofenceReceiver", "❌ Failed to store pending action: ${e.message}")
        }

        // 2. Clear notification
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        notificationManager.cancel(zoneId.hashCode())

        // 3. Open App if it's a WAVE action (Later doesn't need to open app, just dismiss)
        if (actionType == "WAVE") {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            context.startActivity(launchIntent)
        }
    }

    private fun isLaterSuppressed(context: Context, zoneName: String): Boolean {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val suppressionsJson = prefs.getString("suppressions", "{}") ?: "{}"
        try {
            val suppressions = JSONObject(suppressionsJson)
            val expiry = suppressions.optString(zoneName)
            if (expiry.isEmpty()) return false
            
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            dateFormat.timeZone = TimeZone.getTimeZone("UTC")
            val expiryDate = dateFormat.parse(expiry)
            return expiryDate?.after(Date()) ?: false
        } catch (e: Exception) {
            Log.w("GeofenceReceiver", "⚠️ Suppression check failed: ${e.message}")
            return false
        }
    }

    private fun isLocationInZone(context: Context, zoneId: String, lat: Double, lng: Double): Boolean {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val metadataJson = prefs.getString("geofence_metadata", "[]") ?: "[]"
        
        try {
            val metadata = org.json.JSONArray(metadataJson)
            for (i in 0 until metadata.length()) {
                val gf = metadata.getJSONObject(i)
                if (gf.getString("id") == zoneId) {
                    val gfLat = gf.getDouble("lat")
                    val gfLng = gf.getDouble("lng")
                    val gfRadius = gf.getDouble("radius").toFloat()
                    
                    val results = FloatArray(1)
                    android.location.Location.distanceBetween(lat, lng, gfLat, gfLng, results)
                    val distance = results[0]
                    
                    val isInside = distance <= gfRadius + 100 // ✅ 100m buffer for GPS jitter/Fake GPS
                    Log.d("GeofenceReceiver", "📏 Distance to $zoneId: ${distance}m (Radius: ${gfRadius}m, Buffer: 100m) -> IsInside: $isInside")
                    return isInside
                }
            }
        } catch (e: Exception) {
            Log.e("GeofenceReceiver", "❌ Distance check failed for $zoneId: ${e.message}")
        }
        return true // Fallback to true if metadata is missing or check fails
    }


    private fun isLocalCooldownActive(context: Context, zoneName: String): Boolean {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val lastNotified = prefs.getLong("last_notification_$zoneName", 0L)
        val now = System.currentTimeMillis()
        return (now - lastNotified) < 30 * 60 * 1000L // 30 mins
    }

    private fun setLocalCooldown(context: Context, zoneName: String) {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        prefs.edit().putLong("last_notification_$zoneName", System.currentTimeMillis()).apply()
    }
}

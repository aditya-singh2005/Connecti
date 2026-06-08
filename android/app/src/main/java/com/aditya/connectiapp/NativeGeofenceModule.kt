package com.aditya.connectiapp

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*
import android.app.PendingIntent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import android.util.Log
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.BackoffPolicy
import androidx.work.WorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.ExistingPeriodicWorkPolicy
import java.util.concurrent.TimeUnit

class NativeGeofenceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val geofencingClient = LocationServices.getGeofencingClient(reactContext)
    private val TAG = "NativeGeofenceModule"

    override fun getName(): String {
        return "NativeGeofenceModule"
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun registerGeofences(geofences: ReadableArray, promise: Promise) {
        try {
            val geofenceList = mutableListOf<Geofence>()
            val metadataList = org.json.JSONArray()
            for (i in 0 until geofences.size()) {
                val data = geofences.getMap(i) ?: continue
                val identifier = data.getString("identifier") ?: "zone_$i"
                val latitude = data.getDouble("latitude")
                val longitude = data.getDouble("longitude")
                val radius = data.getDouble("radius").toFloat()
                val name = data.getString("name") ?: identifier
                
                // Store name mapping for the receiver
                reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
                    .edit().putString("zone_name_$identifier", name).apply()

                geofenceList.add(Geofence.Builder()
                    .setRequestId(identifier)
                    .setCircularRegion(latitude, longitude, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build())
                
                // Store metadata for secondary verification and worker
                val meta = org.json.JSONObject().apply {
                    put("id", identifier)
                    put("name", name)
                    put("lat", latitude)
                    put("lng", longitude)
                    put("radius", radius)
                }
                metadataList.put(meta)
            }

            if (geofenceList.isEmpty()) {
                promise.resolve(true)
                return
            }

            // Persist metadata
            reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
                .edit().putString("geofence_metadata", metadataList.toString()).apply()

            val geofencingRequest = GeofencingRequest.Builder()
                .setInitialTrigger(0) // ✅ CHANGED: Removed INITIAL_TRIGGER_ENTER so Fake GPS works cleanly in killed state
                .addGeofences(geofenceList)
                .build()

            val intent = Intent(reactApplicationContext, GeofenceBroadcastReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext, 
                0, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )

            geofencingClient.addGeofences(geofencingRequest, pendingIntent).run {
                addOnSuccessListener {
                    Log.d(TAG, "Successfully added ${geofenceList.size} geofences")
                    promise.resolve(true)
                }
                addOnFailureListener { e ->
                    Log.e(TAG, "Failed to add geofences: ${e.message}")
                    promise.reject("GEOFENCE_ERROR", e.message)
                }
            }
        } catch (e: Exception) {
            promise.reject("GEOFENCE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun removeGeofences(promise: Promise) {
        val intent = Intent(reactApplicationContext, GeofenceBroadcastReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        geofencingClient.removeGeofences(pendingIntent).run {
            addOnSuccessListener {
                promise.resolve(true)
            }
            addOnFailureListener { e ->
                promise.reject("GEOFENCE_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun setSessionContext(userId: String, supabaseUrl: String, supabaseKey: String, promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString("userId", userId)
            putString("supabaseUrl", supabaseUrl)
            putString("supabaseKey", supabaseKey)
            apply()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun storeSupabaseCreds(supabaseUrl: String, supabaseKey: String, userId: String, promise: Promise) {
        setSessionContext(userId, supabaseUrl, supabaseKey, promise)
    }
    
    @ReactMethod
    fun setAppRuntimeState(state: String, timestamp: Double, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("app_runtime_state", state)
                putString("app_runtime_state_updated_at", timestamp.toLong().toString())
                apply()
            }
            Log.d(TAG, "App runtime state updated natively: $state at $timestamp")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RUNTIME_STATE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setIsWaved(isWaved: Boolean, expiryTimeMs: Double, promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        editor.putBoolean("isWaved", isWaved)
        
        if (isWaved) {
            editor.putLong("grace_started_at", 0L) // ✅ CLEAR GRACE PERIOD STATE
            editor.apply()

            val delay = if (expiryTimeMs > 0) expiryTimeMs.toLong() else 30 * 60 * 1000L
            scheduleExpiryWorker(reactApplicationContext, delay)
            Log.d(TAG, "Wave active. Scheduled expiry in $delay ms (and cleared grace period)")
        } else {
            editor.apply()
            WorkManager.getInstance(reactApplicationContext).cancelUniqueWork("WaveExpiryWorker")
            Log.d(TAG, "Wave deactivated. Pending expiry workers cancelled.")
        }
        promise.resolve(true)
    }



    @ReactMethod
    fun updateNativeSuppressionCache(suppressionsJson: String, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            prefs.edit().putString("suppressions", suppressionsJson).apply()
            Log.d(TAG, "Native suppression cache updated: $suppressionsJson")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CACHE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun cancelInactivityTimers(zoneId: String, promise: Promise) {
        try {
            PresenceInactivityWorker.cancelAll(reactApplicationContext, zoneId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("TIMER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startZonePoll(promise: Promise) {
        try {
            // Android WorkManager minimum interval for PeriodicWorkRequest is 15 minutes.
            val workRequest = PeriodicWorkRequestBuilder<ZonePollWorker>(15, TimeUnit.MINUTES)
                .addTag("ZonePoll")
                .build()

            WorkManager.getInstance(reactApplicationContext).enqueueUniquePeriodicWork(
                "ZonePollWorker",
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
            Log.d(TAG, "✅ Zone poll worker scheduled (15 min interval)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to schedule Zone poll: ${e.message}")
            promise.reject("ZONE_POLL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopZonePoll(promise: Promise) {
        try {
            WorkManager.getInstance(reactApplicationContext).cancelUniqueWork("ZonePollWorker")
            Log.d(TAG, "✅ Zone poll worker cancelled")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ZONE_POLL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getPendingActions(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            val actionsJson = prefs.getString("pending_actions", "[]") ?: "[]"
            val actionsArray = org.json.JSONArray(actionsJson)
            
            val result = Arguments.createArray()
            for (i in 0 until actionsArray.length()) {
                val actionObj = actionsArray.getJSONObject(i)
                val map = Arguments.createMap().apply {
                    putString("action", actionObj.getString("action"))
                    putString("zoneId", actionObj.getString("zoneId"))
                    putDouble("timestamp", actionObj.getDouble("timestamp"))
                }
                result.pushMap(map)
            }
            
            // Auto-clear after reading to prevent duplicate processing
            prefs.edit().putString("pending_actions", "[]").apply()
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PENDING_ACTIONS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun checkAndSetCooldown(zoneName: String, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val lastNotified = prefs.getLong("last_notification_$zoneName", 0L)
            val cooldownMs = 30 * 60 * 1000L // 30 minutes

            if (now - lastNotified < cooldownMs) {
                promise.resolve(false) // Still in cooldown
            } else {
                prefs.edit().putLong("last_notification_$zoneName", now).apply()
                promise.resolve(true) // Cooldown passed and now reset
            }
        } catch (e: Exception) {
            promise.reject("COOLDOWN_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearPendingActions(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
            prefs.edit().putString("pending_actions", "[]").apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PENDING_ACTIONS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startPeriodicRefresh(promise: Promise) {
        try {
            val workRequest = PeriodicWorkRequestBuilder<GeofenceRefreshWorker>(15, TimeUnit.MINUTES)
                .addTag("GeofenceRefresh")
                .build()

            WorkManager.getInstance(reactApplicationContext).enqueueUniquePeriodicWork(
                "PeriodicGeofenceRefresh",
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
            Log.d(TAG, "✅ Periodic geofence refresh scheduled (15 min interval)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to schedule periodic refresh: ${e.message}")
            promise.reject("REFRESH_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getPendingWaves(promise: Promise) {
        // Compatibility method for RootLayout. 
        // Actual sync is handled by ZoneSyncWorker immediately on entry.
        promise.resolve(Arguments.createArray())
    }

    companion object {
        private const val TAG = "NativeGeofenceModule"

        fun scheduleExpiryWorker(context: Context, delayMs: Long) {
            val workRequest = OneTimeWorkRequestBuilder<WaveExpiryWorker>()
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS, // 10 seconds default
                    TimeUnit.MILLISECONDS
                )
                .addTag("WaveExpiry")
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "WaveExpiryWorker",
                ExistingWorkPolicy.REPLACE,
                workRequest
            )
        }
    }
}

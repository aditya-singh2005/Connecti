package com.aditya.connectiapp

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import org.json.JSONArray

class GeofenceRefreshWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    private val TAG = "GeofenceRefreshWorker"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    @SuppressLint("MissingPermission")
    override suspend fun doWork(): Result {
        Log.d(TAG, "🔄 Starting Geofence Refresh in background")

        val prefs = applicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val supabaseUrl = prefs.getString("supabaseUrl", null)
        val supabaseKey = prefs.getString("supabaseKey", null)

        if (supabaseUrl == null || supabaseKey == null) {
            Log.e(TAG, "❌ Missing Supabase URL or Key in SharedPreferences. Cannot refresh zones.")
            return Result.failure()
        }

        // 1. Get Location
        var lat = inputData.getDouble("lat", Double.NaN)
        var lng = inputData.getDouble("lng", Double.NaN)

        if (lat.isNaN() || lng.isNaN()) {
            if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "❌ Missing location permission for periodic refresh.")
                return Result.failure()
            }
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(applicationContext)
                val location = Tasks.await(fusedLocationClient.lastLocation)
                if (location != null) {
                    lat = location.latitude
                    lng = location.longitude
                    Log.d(TAG, "📍 Using location from FusedLocationProviderClient: $lat, $lng")
                } else {
                    Log.w(TAG, "⚠️ Last known location is null. Retrying later.")
                    return Result.retry()
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to get location: ${e.message}")
                return Result.retry()
            }
        } else {
            Log.d(TAG, "📍 Using location from InputData (Geofence event): $lat, $lng")
        }

        // 2. Fetch Nearby Zones from Supabase
        val jsonPayload = JSONObject().apply {
            put("user_lat", lat)
            put("user_lng", lng)
            put("search_radius_meters", 10000)
            put("max_results", 100) // Keep top 100 per Android OS limits
        }

        val body = jsonPayload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val url = "$supabaseUrl/rest/v1/rpc/get_nearby_zones"
        
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $supabaseKey")
            .addHeader("apikey", supabaseKey)
            .addHeader("Content-Type", "application/json")
            .post(body)
            .build()

        var responseBodyString: String? = null
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val code = response.code
                    Log.e(TAG, "❌ Supabase get_nearby_zones RPC failed: HTTP $code. Response: ${response.message}")
                    return if (code >= 500 || code == 429) Result.retry() else Result.failure()
                }
                responseBodyString = response.body?.string()
            }
        } catch (e: Exception) {
            Log.e(TAG, "🌐 Network error fetching nearby zones: ${e.message}")
            return Result.retry()
        }

        if (responseBodyString.isNullOrEmpty()) {
            Log.e(TAG, "❌ Empty response from Supabase")
            return Result.failure()
        }

        // 3. Parse JSON and create Geofences
        val newGeofences = mutableListOf<Geofence>()
        val metadataList = JSONArray()

        try {
            val zonesArray = JSONArray(responseBodyString!!)
            for (i in 0 until zonesArray.length()) {
                val zoneObj = zonesArray.getJSONObject(i)
                val id = zoneObj.getString("id")
                val name = zoneObj.optString("name", id) // Some queries return name
                val zoneLat = zoneObj.getDouble("latitude")
                val zoneLng = zoneObj.getDouble("longitude")
                val radius = zoneObj.optDouble("radius", 500.0).toFloat().coerceAtLeast(120f)

                // Build Android Geofence
                val geofence = Geofence.Builder()
                    .setRequestId(id) // Using raw ID here, matching the logic
                    .setCircularRegion(zoneLat, zoneLng, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build()
                newGeofences.add(geofence)

                // ⚡ IMMEDIATE ENTRY CHECK (Fixes Fake GPS 'Teleport' issue)
                val results = FloatArray(1)
                android.location.Location.distanceBetween(lat, lng, zoneLat, zoneLng, results)
                val currentDistance = results[0]
                val appState = prefs.getString("app_runtime_state", "killed")

                if (currentDistance <= radius + 50 && appState != "foreground") {
                    if (!isLocalCooldownActive(applicationContext, name)) {
                        Log.d(TAG, "⚡ Immediate Entry Detected for $name! Showing notification.")
                        NotificationHelper.showGeofenceNotification(applicationContext, id, name)
                        setLocalCooldown(applicationContext, name)
                    }
                }

                // Store metadata for receiver and boot
                val metaObj = JSONObject().apply {
                    put("id", id)
                    put("name", name)
                    put("lat", zoneLat)
                    put("lng", zoneLng)
                    put("radius", radius)
                }
                metadataList.put(metaObj)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error parsing JSON from Supabase: ${e.message}")
            return Result.failure()
        }

        if (newGeofences.isEmpty()) {
            Log.d(TAG, "ℹ️ No nearby zones found.")
        } else {
            Log.d(TAG, "✅ Parsed ${newGeofences.size} nearby zones.")
        }

        // 4. Update Android GeofencingClient
        val geofencingClient = LocationServices.getGeofencingClient(applicationContext)
        val pendingIntent = getGeofencePendingIntent()

        try {
            // First, remove old ones to ensure clean state
            Tasks.await(geofencingClient.removeGeofences(pendingIntent))
            Log.d(TAG, "🗑️ Removed existing geofences")

            if (newGeofences.isNotEmpty()) {
                val geofencingRequest = GeofencingRequest.Builder()
                    .setInitialTrigger(0) // NEVER fire immediately on registration
                    .addGeofences(newGeofences)
                    .build()

                Tasks.await(geofencingClient.addGeofences(geofencingRequest, pendingIntent))
                Log.d(TAG, "✅ Successfully registered ${newGeofences.size} new geofences natively!")
            }

            // Update SharedPreferences so BootCompletedReceiver can reuse
            prefs.edit().putString("geofence_metadata", metadataList.toString()).apply()

        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException registering geofences (missing permissions?): ${e.message}")
            return Result.failure()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to register geofences: ${e.message}")
            return Result.retry()
        }

        return Result.success()
    }

    private fun getGeofencePendingIntent(): PendingIntent {
        val intent = Intent(applicationContext, GeofenceBroadcastReceiver::class.java)
        // We must use FLAG_MUTABLE with FLAG_UPDATE_CURRENT for Geofencing in Android 12+ if we need intent extras?
        // Actually Geofencing API documentation states we should use FLAG_UPDATE_CURRENT or FLAG_MUTABLE.
        // In NativeGeofenceModule.kt we used FLAG_UPDATE_CURRENT or FLAG_MUTABLE.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        return PendingIntent.getBroadcast(applicationContext, 0, intent, flags)
    }

    fun isLocalCooldownActive(context: Context, zoneName: String): Boolean {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val lastNotified = prefs.getLong("last_notification_$zoneName", 0L)
        val now = System.currentTimeMillis()
        return (now - lastNotified) < 30 * 60 * 1000L // 30 mins
    }

    fun setLocalCooldown(context: Context, zoneName: String) {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        prefs.edit().putLong("last_notification_$zoneName", System.currentTimeMillis()).apply()
    }
}

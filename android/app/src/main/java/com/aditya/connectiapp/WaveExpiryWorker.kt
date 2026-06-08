package com.aditya.connectiapp

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
// Privacy-Safe Worker completely ignores GPS imports
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WaveExpiryWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    private val TAG = "WaveExpiryWorker"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

   override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val isWaved = prefs.getBoolean("isWaved", false)
        val graceStartedAt = prefs.getLong("grace_started_at", 0L)
        val userId = prefs.getString("userId", null)
        val supabaseUrl = prefs.getString("supabaseUrl", null)
        val supabaseKey = prefs.getString("supabaseKey", null)
        val currentZone = prefs.getString("current_zone", null)

        Log.d(TAG, "⏰ Expiry worker tick. isWaved: $isWaved, graceStartedAt: $graceStartedAt, currentZone: $currentZone")

        // ✅ FIX: Worker continues if either isWaved is true OR we are in the 1-hour grace period
        if ((!isWaved && graceStartedAt == 0L) || userId == null || supabaseUrl == null || supabaseKey == null) {
            Log.d(TAG, "⏹️ Stopping worker: Missing session data, not waved, and not in grace period.")
            return Result.success()
        }

        try {
            Log.d(TAG, "🔄 Starting Wave Expiry Check for $userId")

            // ✅ PRIVACY-SAFE: Do NOT use FusedLocationProviderClient.
            // Rely securely on OS-level Geofence events updating current_zone.
            val json = JSONObject().apply {
                put("userId", userId)
                put("action", "expiry_check")
                put("source", "privacy_safe_worker")
                if (currentZone != null) {
                    put("isInsideZone", true)
                    put("zoneId", currentZone)
                } else {
                    put("isInsideZone", false)
                }
                put("isInGracePeriod", graceStartedAt > 0L)
            }

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("$supabaseUrl/functions/v1/handle-wave-expiry")
                .addHeader("Authorization", "Bearer $supabaseKey")
                .addHeader("apikey", supabaseKey)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val code = response.code
                    Log.e(TAG, "❌ Server Error: $code. Retrying...")
                    return if (code >= 500 || code == 429) Result.retry() else Result.failure()
                }

                val responseData = response.body?.string()
                val resultJson = JSONObject(responseData ?: "{}")
                val status = resultJson.optString("status")

                Log.d(TAG, "Edge Function Result: $status")

                when (status) {
                    "extended" -> {
                        Log.d(TAG, "✅ Wave extended. Rescheduling 30-min check.")
                        NativeGeofenceModule.scheduleExpiryWorker(applicationContext, 30 * 60 * 1000L)
                    }
                    "grace_start" -> {
                        Log.d(TAG, "⚠️ User outside zone after 30 mins. Wave set to false, but starting 1-hour grace period.")
                        prefs.edit().apply {
                            putLong("grace_started_at", System.currentTimeMillis())
                            putBoolean("isWaved", false) // ✅ Set to false immediately so UI updates
                            apply()
                        }
                        NativeGeofenceModule.scheduleExpiryWorker(applicationContext, 60 * 60 * 1000L)
                    }
                    else -> {
                        Log.d(TAG, "👋 Wave/Grace period expired or removed. Finalizing state.")
                        prefs.edit().apply {
                            putBoolean("isWaved", false)
                            putLong("grace_started_at", 0L)
                            apply()
                        }
                    }
                }
            }
            return Result.success()
        } catch (e: java.io.IOException) {
            Log.e(TAG, "🌐 Network error in WaveExpiryWorker: ${e.message}. Retrying...")
            return Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Fatal error in WaveExpiryWorker: ${e.message}")
            return Result.failure()
        }
    }
}

package com.aditya.connectiapp

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ZonePollWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    private val TAG = "ZonePollWorker"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val currentZone = prefs.getString("current_zone", null)
        
        if (currentZone == null) {
            Log.d(TAG, "⏹️ User is not in any explicit zone. Skipping heartbeat.")
            return Result.success() // Done, no need to heartbeat
        }

        val userId = prefs.getString("userId", null)
        val supabaseUrl = prefs.getString("supabaseUrl", null)
        val supabaseKey = prefs.getString("supabaseKey", null)
        val isWaved = prefs.getBoolean("isWaved", false)

        if (userId == null || supabaseUrl == null || supabaseKey == null) {
            Log.e(TAG, "Missing session data for zone poll heartbeat")
            return Result.failure()
        }

        try {
            Log.d(TAG, "💓 Sending background heartbeat for zone: $currentZone")
            
            val json = JSONObject().apply {
                put("userId", userId)
                put("zoneId", currentZone)
                put("isWaving", isWaved)
                put("action", "zone_poll_sync") // specific action for the heartbeat
                put("source", "android_worker_poll")
            }

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            
            val request = Request.Builder()
                // Reusing the same function as it handles presence updates
                .url("$supabaseUrl/functions/v1/handle-wave-expiry") 
                .addHeader("Authorization", "Bearer $supabaseKey")
                .addHeader("apikey", supabaseKey)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val code = response.code
                    Log.e(TAG, "❌ Zone poll heartbeat failed: $code. Retrying...")
                    return if (code >= 500 || code == 429) Result.retry() else Result.failure()
                }
                Log.d(TAG, "✅ Zone poll heartbeat successful for $currentZone")
            }

            return Result.success()
        } catch (e: java.io.IOException) {
            Log.e(TAG, "🌐 Network error in ZonePollWorker: ${e.message}. Retrying...")
            return Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Fatal error in ZonePollWorker: ${e.message}")
            return Result.failure()
        }
    }
}

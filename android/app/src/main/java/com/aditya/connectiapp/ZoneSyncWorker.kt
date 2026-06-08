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

class ZoneSyncWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    private val TAG = "ZoneSyncWorker"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result {
        val zoneId = inputData.getString("zoneId") ?: return Result.failure()
        
        val prefs = applicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", null)
        val supabaseUrl = prefs.getString("supabaseUrl", null)
        val supabaseKey = prefs.getString("supabaseKey", null)

        if (userId == null || supabaseUrl == null || supabaseKey == null) {
            Log.e(TAG, "Missing session data for zone sync")
            return Result.failure()
        }

        try {
            val isWaving = inputData.getBoolean("isWaving", false)
            val action = inputData.getString("action") ?: "zone_enter_sync"
            
            val json = JSONObject().apply {
                put("userId", userId)
                put("zoneId", zoneId)
                put("isWaving", isWaving)
                put("action", action)
            }

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            
            val request = Request.Builder()
                .url("$supabaseUrl/functions/v1/handle-wave-expiry") // Reusing the same function for sync
                .addHeader("Authorization", "Bearer $supabaseKey")
                .addHeader("apikey", supabaseKey)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val code = response.code
                    Log.e(TAG, "❌ Zone sync failed: $code. Retrying...")
                    return if (code >= 500 || code == 429) Result.retry() else Result.failure()
                }
                Log.d(TAG, "✅ Zone sync successful for $zoneId")
            }

            return Result.success()
        } catch (e: java.io.IOException) {
            Log.e(TAG, "🌐 Network error in ZoneSyncWorker: ${e.message}. Retrying...")
            return Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Fatal error in ZoneSyncWorker: ${e.message}")
            return Result.failure()
        }
    }
}

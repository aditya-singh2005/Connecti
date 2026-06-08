package com.aditya.connectiapp

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.BackoffPolicy
import androidx.work.WorkRequest
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class PresenceInactivityWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    private val TAG = "PresenceInactivityWorker"
    private val client = OkHttpClient.Builder().build()

    override suspend fun doWork(): Result {
        val zoneId = inputData.getString("zoneId") ?: return Result.failure()
        val type = inputData.getString("type") ?: "reminder" // "reminder" or "removal"
        
        val prefs = applicationContext.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val isWaved = prefs.getBoolean("isWaved", false)
        val userId = prefs.getString("userId", null)
        val supabaseUrl = prefs.getString("supabaseUrl", null)
        val supabaseKey = prefs.getString("supabaseKey", null)

        if (isWaved || userId == null || supabaseUrl == null || supabaseKey == null) {
            Log.d(TAG, "⏹️ Stopping inactivity worker for $zoneId: User is waved or missing session.")
            return Result.success()
        }

        try {
            if (type == "reminder") {
                Log.d(TAG, "📢 Triggering 30-min Reminder for $zoneId")
                // In a real app, we might want to trigger a local notification from here 
                // but since GeofenceManager handles it, we can just signal or call an Edge Function
                // that sends a push. 
                // For now, let's assume we call a "notify-reminder" action.
                syncWithServer(userId, zoneId, "reminder_notify", supabaseUrl, supabaseKey)
                
                // After 30-min reminder, the 1-hour removal is still pending (it was scheduled on Enter)
            } else if (type == "removal") {
                Log.d(TAG, "🗑️ Triggering 1-hour Removal for $zoneId")
                syncWithServer(userId, zoneId, "inactivity_removal", supabaseUrl, supabaseKey)
                prefs.edit().putString("current_zone", null).apply()
            }

            return Result.success()
        } catch (e: java.io.IOException) {
            Log.e(TAG, "🌐 Network error in PresenceInactivityWorker for $zoneId: ${e.message}. Retrying...")
            return Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Fatal error in PresenceInactivityWorker: ${e.message}")
            return Result.failure()
        }
    }

    private fun syncWithServer(userId: String, zoneId: String, action: String, url: String, key: String) {
        val json = JSONObject().apply {
            put("userId", userId)
            put("zoneId", zoneId)
            put("action", action)
        }
        val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("$url/functions/v1/handle-wave-expiry")
            .addHeader("Authorization", "Bearer $key")
            .addHeader("apikey", key)
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (response.isSuccessful) {
                Log.d(TAG, "✅ Inactivity sync successful: $action")
            } else {
                Log.e(TAG, "❌ Inactivity sync failed: ${response.code}")
            }
        }
    }

    companion object {
        fun schedule(context: Context, zoneId: String, type: String, delayMs: Long) {
            val data = Data.Builder()
                .putString("zoneId", zoneId)
                .putString("type", type)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<PresenceInactivityWorker>()
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .setInputData(data)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .addTag("Inactivity_$zoneId")
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "${type}_$zoneId",
                ExistingWorkPolicy.REPLACE,
                workRequest
            )
        }

        fun cancelAll(context: Context, zoneId: String) {
            WorkManager.getInstance(context).cancelUniqueWork("reminder_$zoneId")
            WorkManager.getInstance(context).cancelUniqueWork("removal_$zoneId")
        }
    }
}

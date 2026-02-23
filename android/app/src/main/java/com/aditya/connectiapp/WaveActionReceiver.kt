package com.aditya.connectiapp

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * WaveActionReceiver – handles "Wave 👋" and "Later" notification button taps.
 *
 * Works in foreground, background AND killed state because it is a
 * standalone BroadcastReceiver (no Activity required).
 */
class WaveActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WaveActionReceiver"

        const val ACTION_WAVE = "com.aditya.connectiapp.ACTION_WAVE"
        const val ACTION_LATER = "com.aditya.connectiapp.ACTION_LATER"

        const val EXTRA_ZONE_ID = "zoneId"
        const val EXTRA_NOTIFICATION_ID = "notificationId"

        // SharedPreferences keys
        private const val PREF_PENDING_ACTIONS = "pending_action_queue"
        private const val PREF_LATER_PREFIX = "later_" // later_YYYY-MM-DD_zoneName

        // Supabase creds stored by JS on startup
        private const val PREF_SUPABASE_URL = "supabase_url"
        private const val PREF_SUPABASE_ANON_KEY = "supabase_anon_key"
        private const val PREF_SUPABASE_USER_ID = "supabase_user_id"
        private const val PREF_OPEN_TO_WAVE_ZONE = "open_to_wave_zone"
        private const val PREF_OPEN_TO_WAVE_EXPIRY = "open_to_wave_expiry"

        private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

        /** Called by GeofenceBroadcastReceiver to check if zone is "Later"-suppressed today. */
        @JvmStatic
        fun isLaterSuppressed(context: Context, zoneId: String): Boolean {
            val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
            val today = dateFormat.format(Date())
            val key = "${PREF_LATER_PREFIX}${today}_${zoneId}"
            return prefs.getBoolean(key, false)
        }

        /** Called by GeofenceBroadcastReceiver to check if wave is still active. */
        @JvmStatic
        fun isOpenToWave(context: Context): Boolean {
            val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
            val expiry = prefs.getLong(PREF_OPEN_TO_WAVE_EXPIRY, 0L)
            return System.currentTimeMillis() < expiry
        }

        /** Stores Supabase creds written by JS on startup so killed-state wave can call the API. */
        @JvmStatic
        fun storeSupabaseCreds(context: Context, url: String, anonKey: String, userId: String) {
            context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_SUPABASE_URL, url)
                .putString(PREF_SUPABASE_ANON_KEY, anonKey)
                .putString(PREF_SUPABASE_USER_ID, userId)
                .apply()
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val zoneId = intent.getStringExtra(EXTRA_ZONE_ID) ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)

        // Always dismiss the notification
        if (notificationId != -1) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(notificationId)
        }

        when (action) {
            ACTION_WAVE -> handleWave(context, zoneId)
            ACTION_LATER -> handleLater(context, zoneId)
        }
    }

    // --------------------------------------------------------------------------------------------
    // WAVE
    // --------------------------------------------------------------------------------------------

    private fun handleWave(context: Context, zoneId: String) {
        Log.i(TAG, "👋 WAVE tapped for zone=$zoneId")

        val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)

        // 1. Mark open_to_wave locally (30 minutes from now)
        val expiry = System.currentTimeMillis() + 30 * 60 * 1000L
        prefs.edit()
            .putLong(PREF_OPEN_TO_WAVE_EXPIRY, expiry)
            .putString(PREF_OPEN_TO_WAVE_ZONE, zoneId)
            .apply()

        // 2. Append to the pending-action queue so JS can drain it when the app opens
        appendPendingAction(context, "WAVE", zoneId)

        // 3. Best-effort direct REST call – works in killed state
        val url = prefs.getString(PREF_SUPABASE_URL, null)
        val key = prefs.getString(PREF_SUPABASE_ANON_KEY, null)
        val userId = prefs.getString(PREF_SUPABASE_USER_ID, null)

        if (url != null && key != null && userId != null) {
            Thread {
                callSupabaseWave(url, key, userId, zoneId)
            }.start()
        } else {
            Log.w(TAG, "⚠️ Supabase creds not stored yet, wave will be processed when app opens")
        }
    }

    private fun callSupabaseWave(supabaseUrl: String, anonKey: String, userId: String, zoneId: String) {
        try {
            // Look up the zone_id UUID for the given zone name
            val lookupUrl = URL("$supabaseUrl/rest/v1/geofence_zones?name=eq.${zoneName(zoneId)}&select=id,name&limit=1")
            val lookupConn = lookupUrl.openConnection() as HttpURLConnection
            lookupConn.setRequestProperty("apikey", anonKey)
            lookupConn.setRequestProperty("Authorization", "Bearer $anonKey")
            lookupConn.setRequestProperty("Accept", "application/json")
            lookupConn.connectTimeout = 8000
            lookupConn.readTimeout = 8000

            val lookupResponse = lookupConn.inputStream.bufferedReader().readText()
            lookupConn.disconnect()

            val zonesArray = JSONArray(lookupResponse)
            if (zonesArray.length() == 0) {
                Log.w(TAG, "⚠️ Zone not found in geofence_zones: $zoneId")
                return
            }

            val zoneRecord = zonesArray.getJSONObject(0)
            val zoneUuid = zoneRecord.getString("id")
            val zoneName = zoneRecord.optString("name", zoneId)

            // Now upsert active_zone_users
            val upsertUrl = URL("$supabaseUrl/rest/v1/active_zone_users?on_conflict=user_id")
            val conn = upsertUrl.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("apikey", anonKey)
            conn.setRequestProperty("Authorization", "Bearer $anonKey")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal")
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val body = JSONObject().apply {
                put("user_id", userId)
                put("zone_id", zoneUuid)
                put("zone_name", zoneName)
                put("open_to_wave", true)
                put("last_updated", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()))
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }

            val responseCode = conn.responseCode
            conn.disconnect()

            if (responseCode in 200..299) {
                Log.i(TAG, "✅ Supabase wave REST call success (HTTP $responseCode)")
            } else {
                Log.w(TAG, "⚠️ Supabase wave REST call returned HTTP $responseCode")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Supabase wave REST call failed: ${e.message}")
        }
    }

    /** Strip any prefix from zone ID to get a usable name for the lookup. */
    private fun zoneName(zoneId: String) = zoneId.replace("%20", " ").trim()

    // --------------------------------------------------------------------------------------------
    // LATER
    // --------------------------------------------------------------------------------------------

    private fun handleLater(context: Context, zoneId: String) {
        Log.i(TAG, "⏳ LATER tapped for zone=$zoneId")
        val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
        val today = dateFormat.format(Date())
        val key = "${PREF_LATER_PREFIX}${today}_${zoneId}"

        prefs.edit().putBoolean(key, true).apply()
        Log.i(TAG, "✅ Zone $zoneId suppressed for today ($today)")

        // Also put in pending-action queue so JS can mirror it to AsyncStorage
        appendPendingAction(context, "LATER", zoneId)
    }

    // --------------------------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------------------------

    private fun appendPendingAction(context: Context, action: String, zoneId: String) {
        val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(PREF_PENDING_ACTIONS, "[]") ?: "[]"
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        arr.put(JSONObject().put("action", action).put("zoneId", zoneId).put("ts", System.currentTimeMillis()))
        prefs.edit().putString(PREF_PENDING_ACTIONS, arr.toString()).apply()
    }
}

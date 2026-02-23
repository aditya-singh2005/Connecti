package com.aditya.connectiapp

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray
import org.json.JSONObject

class NativeGeofenceModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val TAG = "NativeGeofenceModule"
    const val PREFS_NAME = "native_geofence_prefs"
    const val PREF_REGISTERED_GEOFENCES_JSON = "registered_geofences_json"
    const val PREF_PENDING_WAVES_JSON = "pending_waves_json"
    const val PREF_PENDING_ACTIONS = "pending_action_queue"
    const val APP_RUNTIME_STATE_KEY = "app_runtime_state"
    const val APP_RUNTIME_STATE_UPDATED_AT_KEY = "app_runtime_state_updated_at"
    const val ACTION_GEOFENCE_EVENT = "com.aditya.connectiapp.GEOFENCE_EVENT"
    const val PENDING_INTENT_REQUEST_CODE = 42069
    private const val ZONE_POLL_REQUEST_CODE = 42099

    @JvmStatic
    fun getGeofencePendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, GeofenceBroadcastReceiver::class.java).apply {
        action = ACTION_GEOFENCE_EVENT
      }
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      else
        PendingIntent.FLAG_UPDATE_CURRENT

      return PendingIntent.getBroadcast(context, PENDING_INTENT_REQUEST_CODE, intent, flags)
    }

    @JvmStatic
    fun appendPendingWave(context: Context, zoneId: String, source: String, timestamp: Long) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val existingRaw = prefs.getString(PREF_PENDING_WAVES_JSON, "[]") ?: "[]"
      val existingArray = try { JSONArray(existingRaw) } catch (_: Exception) { JSONArray() }

      existingArray.put(
        JSONObject()
          .put("zoneId", zoneId)
          .put("source", source)
          .put("timestamp", timestamp)
      )

      val maxItems = 100
      val trimmed = JSONArray()
      val startIndex = (existingArray.length() - maxItems).coerceAtLeast(0)
      for (i in startIndex until existingArray.length()) {
        trimmed.put(existingArray.getJSONObject(i))
      }
      prefs.edit().putString(PREF_PENDING_WAVES_JSON, trimmed.toString()).apply()
    }
  }

  private val geofencingClient: GeofencingClient by lazy {
    LocationServices.getGeofencingClient(reactApplicationContext)
  }

  override fun getName(): String = "NativeGeofenceModule"

  private fun hasLocationPermissions(): Boolean {
    val hasFine = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    val hasBackground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
    } else true

    return hasFine && hasBackground
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Existing ReactMethods
  // ────────────────────────────────────────────────────────────────────────────

  @ReactMethod
  fun checkGeofencingAvailability(promise: Promise) {
    try {
      val playServicesStatus =
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(reactApplicationContext)
      val available = playServicesStatus == ConnectionResult.SUCCESS && hasLocationPermissions()
      Log.i(TAG, "checkGeofencingAvailability -> $available")
      promise.resolve(available)
    } catch (error: Exception) {
      promise.reject("AVAILABILITY_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun updateAppRuntimeState(state: String, timestampMs: Double, promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val timestamp = timestampMs.toLong().toString()
      prefs.edit()
        .putString(APP_RUNTIME_STATE_KEY, state)
        .putString(APP_RUNTIME_STATE_UPDATED_AT_KEY, timestamp)
        .apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("UPDATE_RUNTIME_STATE_FAILED", error.message, error)
    }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun registerGeofences(geofenceArray: ReadableArray, promise: Promise) {
    if (!hasLocationPermissions()) {
      promise.reject("PERMISSION_DENIED", "Missing location permissions for geofencing")
      return
    }

    try {
      val geofences = mutableListOf<Geofence>()
      val persistArray = JSONArray()

      for (i in 0 until geofenceArray.size()) {
        val map = geofenceArray.getMap(i) ?: continue
        val id = when {
          map.hasKey("id") -> map.getString("id")
          map.hasKey("identifier") -> map.getString("identifier")
          else -> null
        } ?: continue

        if (!map.hasKey("latitude") || !map.hasKey("longitude")) continue

        val latitude = map.getDouble("latitude")
        val longitude = map.getDouble("longitude")
        val radius = if (map.hasKey("radius")) map.getDouble("radius") else 500.0

        val geofence = Geofence.Builder()
          .setRequestId(id)
          .setCircularRegion(latitude, longitude, radius.toFloat())
          .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
          .setExpirationDuration(Geofence.NEVER_EXPIRE)
          .build()

        geofences.add(geofence)
        persistArray.put(
          JSONObject()
            .put("id", id)
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("radius", radius)
        )
      }

      if (geofences.isEmpty()) {
        promise.reject("INVALID_INPUT", "No valid geofences passed to registerGeofences")
        return
      }

      val request = GeofencingRequest.Builder()
        .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
        .addGeofences(geofences)
        .build()

      val pendingIntent = getGeofencePendingIntent(reactApplicationContext)
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

      geofencingClient.removeGeofences(pendingIntent).addOnCompleteListener {
        geofencingClient.addGeofences(request, pendingIntent)
          .addOnSuccessListener {
            prefs.edit().putString(PREF_REGISTERED_GEOFENCES_JSON, persistArray.toString()).apply()
            Log.i(TAG, "registerGeofences success: ${geofences.size} geofences")
            promise.resolve(true)
          }
          .addOnFailureListener { error ->
            promise.reject("REGISTER_FAILED", error.message, error)
          }
      }
    } catch (error: Exception) {
      promise.reject("REGISTER_EXCEPTION", error.message, error)
    }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun removeGeofences(promise: Promise) {
    try {
      val pendingIntent = getGeofencePendingIntent(reactApplicationContext)
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

      geofencingClient.removeGeofences(pendingIntent)
        .addOnSuccessListener {
          prefs.edit().remove(PREF_REGISTERED_GEOFENCES_JSON).apply()
          Log.i(TAG, "removeGeofences success")
          promise.resolve(true)
        }
        .addOnFailureListener { error ->
          promise.reject("REMOVE_FAILED", error.message, error)
        }
    } catch (error: Exception) {
      promise.reject("REMOVE_EXCEPTION", error.message, error)
    }
  }

  @ReactMethod
  fun getRegisteredGeofences(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(PREF_REGISTERED_GEOFENCES_JSON, "[]") ?: "[]"
      val geofenceArray = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

      val output = Arguments.createArray()
      for (i in 0 until geofenceArray.length()) {
        output.pushString(geofenceArray.getJSONObject(i).optString("id"))
      }
      promise.resolve(output)
    } catch (error: Exception) {
      promise.reject("GET_REGISTERED_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getPendingWaves(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(PREF_PENDING_WAVES_JSON, "[]") ?: "[]"
      val pendingArray = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

      val output = Arguments.createArray()
      for (i in 0 until pendingArray.length()) {
        val item = pendingArray.getJSONObject(i)
        val map = Arguments.createMap().apply {
          putString("zoneId", item.optString("zoneId"))
          putString("source", item.optString("source"))
          putString("timestamp", item.optString("timestamp"))
        }
        output.pushMap(map)
      }

      // Drain after read
      prefs.edit().remove(PREF_PENDING_WAVES_JSON).apply()
      promise.resolve(output)
    } catch (error: Exception) {
      promise.reject("GET_PENDING_WAVES_FAILED", error.message, error)
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // NEW ReactMethods
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Drains the pending-action queue populated by WaveActionReceiver.
   * Returns an array of { action: "WAVE"|"LATER", zoneId: string, ts: number }.
   * JS should call this on app startup and on foreground resume.
   */
  @ReactMethod
  fun getPendingActions(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(PREF_PENDING_ACTIONS, "[]") ?: "[]"
      val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

      val output = Arguments.createArray()
      for (i in 0 until arr.length()) {
        val item = arr.getJSONObject(i)
        val map = Arguments.createMap().apply {
          putString("action", item.optString("action"))
          putString("zoneId", item.optString("zoneId"))
          putDouble("ts", item.optLong("ts").toDouble())
        }
        output.pushMap(map)
      }

      // Drain after read
      prefs.edit().remove(PREF_PENDING_ACTIONS).apply()
      Log.i(TAG, "getPendingActions: drained ${arr.length()} actions")
      promise.resolve(output)
    } catch (error: Exception) {
      promise.reject("GET_PENDING_ACTIONS_FAILED", error.message, error)
    }
  }

  /**
   * Store Supabase credentials + user ID in SharedPreferences.
   * Called by JS on app startup so WaveActionReceiver can call the REST API
   * even when the app is killed.
   */
  @ReactMethod
  fun storeSupabaseCreds(url: String, anonKey: String, userId: String, promise: Promise) {
    try {
      WaveActionReceiver.storeSupabaseCreds(reactApplicationContext, url, anonKey, userId)
      Log.i(TAG, "storeSupabaseCreds: credentials stored")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("STORE_CREDS_FAILED", error.message, error)
    }
  }

  /**
   * Start the 10-second polling AlarmManager.
   * TESTING MODE – reduces to production interval before shipping.
   */
  @ReactMethod
  fun startZonePoll(promise: Promise) {
    try {
      val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      val intent = Intent(reactApplicationContext, ZonePollReceiver::class.java).apply {
        action = ZonePollReceiver.ACTION_ZONE_POLL
      }
      val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      else
        PendingIntent.FLAG_UPDATE_CURRENT

      val pi = PendingIntent.getBroadcast(reactApplicationContext, ZONE_POLL_REQUEST_CODE, intent, piFlags)

      // TESTING: 10 seconds. Change to 5 * 60 * 1000L for production.
      val intervalMs = 10_000L

      alarmManager.setRepeating(
        AlarmManager.RTC_WAKEUP,
        System.currentTimeMillis() + intervalMs,
        intervalMs,
        pi
      )
      Log.i(TAG, "✅ Zone poll AlarmManager started (interval=${intervalMs}ms)")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("START_POLL_FAILED", error.message, error)
    }
  }

  /**
   * Stop the zone polling AlarmManager.
   */
  @ReactMethod
  fun stopZonePoll(promise: Promise) {
    try {
      val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(reactApplicationContext, ZonePollReceiver::class.java).apply {
        action = ZonePollReceiver.ACTION_ZONE_POLL
      }
      val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      else
        PendingIntent.FLAG_UPDATE_CURRENT

      val pi = PendingIntent.getBroadcast(reactApplicationContext, ZONE_POLL_REQUEST_CODE, intent, piFlags)
      alarmManager.cancel(pi)
      Log.i(TAG, "✅ Zone poll AlarmManager stopped")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("STOP_POLL_FAILED", error.message, error)
    }
  }
}

package com.aditya.connectiapp

import android.Manifest
import android.annotation.SuppressLint
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
    const val APP_RUNTIME_STATE_KEY = "app_runtime_state"
    const val APP_RUNTIME_STATE_UPDATED_AT_KEY = "app_runtime_state_updated_at"
    const val ACTION_GEOFENCE_EVENT = "com.aditya.connectiapp.GEOFENCE_EVENT"
    const val PENDING_INTENT_REQUEST_CODE = 42069

    @JvmStatic
    fun getGeofencePendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, GeofenceBroadcastReceiver::class.java).apply {
        action = ACTION_GEOFENCE_EVENT
      }

      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }

      return PendingIntent.getBroadcast(
        context,
        PENDING_INTENT_REQUEST_CODE,
        intent,
        flags
      )
    }

    @JvmStatic
    fun appendPendingWave(context: Context, zoneId: String, source: String, timestamp: Long) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val existingRaw = prefs.getString(PREF_PENDING_WAVES_JSON, "[]") ?: "[]"
      val existingArray = try {
        JSONArray(existingRaw)
      } catch (_: Exception) {
        JSONArray()
      }

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
    } else {
      true
    }

    return hasFine && hasBackground
  }

  @ReactMethod
  fun checkGeofencingAvailability(promise: Promise) {
    try {
      val playServicesStatus =
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(reactApplicationContext)
      val playServicesReady = playServicesStatus == ConnectionResult.SUCCESS
      val available = playServicesReady && hasLocationPermissions()
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
      Log.w(TAG, "registerGeofences denied: missing location permissions")
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
        Log.w(TAG, "registerGeofences received no valid geofences")
        promise.reject("INVALID_INPUT", "No valid geofences passed to registerGeofences")
        return
      }

      val request = GeofencingRequest.Builder()
        .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
        .addGeofences(geofences)
        .build()

      val pendingIntent = getGeofencePendingIntent(reactApplicationContext)
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

      // Remove existing registrations to avoid duplicates.
      geofencingClient.removeGeofences(pendingIntent).addOnCompleteListener {
        geofencingClient.addGeofences(request, pendingIntent)
          .addOnSuccessListener {
            prefs.edit().putString(PREF_REGISTERED_GEOFENCES_JSON, persistArray.toString()).apply()
            Log.i(TAG, "registerGeofences success: ${geofences.size} geofences")
            promise.resolve(true)
          }
          .addOnFailureListener { error ->
            Log.e(TAG, "registerGeofences failed: ${error.message}", error)
            promise.reject("REGISTER_FAILED", error.message, error)
          }
      }
    } catch (error: Exception) {
      Log.e(TAG, "registerGeofences exception: ${error.message}", error)
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
          Log.e(TAG, "removeGeofences failed: ${error.message}", error)
          promise.reject("REMOVE_FAILED", error.message, error)
        }
    } catch (error: Exception) {
      Log.e(TAG, "removeGeofences exception: ${error.message}", error)
      promise.reject("REMOVE_EXCEPTION", error.message, error)
    }
  }

  @ReactMethod
  fun getRegisteredGeofences(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(PREF_REGISTERED_GEOFENCES_JSON, "[]") ?: "[]"
      val geofenceArray = try {
        JSONArray(raw)
      } catch (_: Exception) {
        JSONArray()
      }

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
      val pendingArray = try {
        JSONArray(raw)
      } catch (_: Exception) {
        JSONArray()
      }

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

      // Drain after read so JS processes each event once.
      prefs.edit().remove(PREF_PENDING_WAVES_JSON).apply()
      promise.resolve(output)
    } catch (error: Exception) {
      promise.reject("GET_PENDING_WAVES_FAILED", error.message, error)
    }
  }
}

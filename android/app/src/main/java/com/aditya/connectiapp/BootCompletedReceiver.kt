package com.aditya.connectiapp

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray

class BootCompletedReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return

    if (
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }

    if (!hasLocationPermissions(context)) {
      return
    }

    restoreGeofences(context)
  }

  private fun hasLocationPermissions(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    val background = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
    } else {
      true
    }

    return fine && background
  }

  @SuppressLint("MissingPermission")
  private fun restoreGeofences(context: Context) {
    val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(NativeGeofenceModule.PREF_REGISTERED_GEOFENCES_JSON, "[]") ?: "[]"
    val registered = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }

    if (registered.length() == 0) {
      return
    }

    val geofences = mutableListOf<Geofence>()
    for (i in 0 until registered.length()) {
      val item = registered.getJSONObject(i)
      val id = item.optString("id")
      if (id.isNullOrBlank()) continue

      val latitude = item.optDouble("latitude", Double.NaN)
      val longitude = item.optDouble("longitude", Double.NaN)
      val radius = item.optDouble("radius", 500.0)

      if (latitude.isNaN() || longitude.isNaN()) continue

      geofences.add(
        Geofence.Builder()
          .setRequestId(id)
          .setCircularRegion(latitude, longitude, radius.toFloat())
          .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
          .setExpirationDuration(Geofence.NEVER_EXPIRE)
          .build()
      )
    }

    if (geofences.isEmpty()) {
      return
    }

    val request = GeofencingRequest.Builder()
      .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
      .addGeofences(geofences)
      .build()

    val client = LocationServices.getGeofencingClient(context)
    val pendingIntent = NativeGeofenceModule.getGeofencePendingIntent(context)

    client.removeGeofences(pendingIntent).addOnCompleteListener {
      client.addGeofences(request, pendingIntent)
    }
  }
}

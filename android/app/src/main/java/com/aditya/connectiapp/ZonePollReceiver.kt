package com.aditya.connectiapp

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.LocationServices
import org.json.JSONArray
import kotlin.math.*

/**
 * ZonePollReceiver – fired every 10 seconds by AlarmManager (testing mode).
 *
 * Gets the last-known location, checks against all stored geofence zones, and
 * fires a notification for any zone the user is currently inside (unless
 * suppressed by "Later" or "already waved").
 *
 * DB presence is NOT written here – that only happens on the real GEOFENCE_TRANSITION_ENTER
 * event inside GeofenceBroadcastReceiver.
 */
class ZonePollReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ZonePollReceiver"
        const val ACTION_ZONE_POLL = "com.aditya.connectiapp.ACTION_ZONE_POLL"
    }

    @SuppressLint("MissingPermission")
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_ZONE_POLL) return
        Log.d(TAG, "⏰ ZonePollReceiver fired")

        val fusedClient = LocationServices.getFusedLocationProviderClient(context)

        fusedClient.lastLocation.addOnSuccessListener { location ->
            if (location == null) {
                Log.d(TAG, "📍 No last location available yet")
                return@addOnSuccessListener
            }

            val prefs = context.getSharedPreferences(NativeGeofenceModule.PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(NativeGeofenceModule.PREF_REGISTERED_GEOFENCES_JSON, "[]") ?: "[]"
            val zones = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

            if (zones.length() == 0) {
                Log.d(TAG, "No registered geofences to poll against")
                return@addOnSuccessListener
            }

            for (i in 0 until zones.length()) {
                val zone = zones.getJSONObject(i)
                val zoneId = zone.optString("id").takeIf { it.isNotBlank() } ?: continue
                val lat = zone.optDouble("latitude", Double.NaN)
                val lng = zone.optDouble("longitude", Double.NaN)
                val radius = zone.optDouble("radius", 500.0)

                if (lat.isNaN() || lng.isNaN()) continue

                val distance = haversineMeters(location.latitude, location.longitude, lat, lng)

                if (distance <= radius) {
                    Log.d(TAG, "📍 Inside zone=$zoneId (distance=${distance.toInt()}m <= radius=${radius.toInt()}m)")
                    // Delegate to the same logic used for real ENTER events
                    GeofenceBroadcastReceiver.handleZonePresence(
                        context = context,
                        zoneId = zoneId,
                        source = "poll"
                    )
                }
            }
        }.addOnFailureListener { e ->
            Log.w(TAG, "⚠️ Failed to get last location: ${e.message}")
        }
    }

    // Simple Haversine formula to compute distance in metres between two lat/lng points
    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6_371_000.0 // Earth radius in metres
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2.0) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2.0)
        return 2 * R * asin(sqrt(a))
    }
}

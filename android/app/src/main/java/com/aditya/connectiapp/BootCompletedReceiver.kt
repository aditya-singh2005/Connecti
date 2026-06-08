package com.aditya.connectiapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import android.app.PendingIntent
import org.json.JSONArray

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "📱 Device booted, restoring native geofences...")
            restoreGeofences(context)
        }
    }

    private fun restoreGeofences(context: Context) {
        val prefs = context.getSharedPreferences("ConnectiPrefs", Context.MODE_PRIVATE)
        val metadataJson = prefs.getString("geofence_metadata", "[]") ?: "[]"

        try {
            val metadata = JSONArray(metadataJson)
            if (metadata.length() == 0) {
                Log.d("BootReceiver", "No geofences to restore.")
                return
            }

            val geofenceList = mutableListOf<Geofence>()

            for (i in 0 until metadata.length()) {
                val gf = metadata.getJSONObject(i)
                val id = gf.getString("id")
                val lat = gf.getDouble("lat")
                val lng = gf.getDouble("lng")
                val radius = gf.getDouble("radius").toFloat()

                geofenceList.add(
                    Geofence.Builder()
                        .setRequestId(id)
                        .setCircularRegion(lat, lng, radius)
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                        .build()
                )
            }

            val geofencingRequest = GeofencingRequest.Builder()
                .setInitialTrigger(0) // No initial trigger on boot restoration
                .addGeofences(geofenceList)
                .build()

            val receiverIntent = Intent(context, GeofenceBroadcastReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                receiverIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )

            val geofencingClient = LocationServices.getGeofencingClient(context)
            geofencingClient.addGeofences(geofencingRequest, pendingIntent).run {
                addOnSuccessListener {
                    Log.d("BootReceiver", "✅ Successfully restored ${geofenceList.size} geofences after reboot")
                }
                addOnFailureListener { e ->
                    Log.e("BootReceiver", "❌ Failed to restore geofences: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e("BootReceiver", "❌ Error parsing geofence metadata for restoration: ${e.message}")
        }
    }
}

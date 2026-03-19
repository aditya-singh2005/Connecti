package com.aditya.connectiapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent) ?: return
        
        if (geofencingEvent.hasError()) {
            Log.e("GeofenceReceiver", "Geofencing error code: ${geofencingEvent.errorCode}")
            return
        }

        val geofenceTransition = geofencingEvent.geofenceTransition
        if (geofenceTransition == Geofence.GEOFENCE_TRANSITION_ENTER) {
            val triggeringGeofences = geofencingEvent.triggeringGeofences ?: return
            for (geofence in triggeringGeofences) {
                Log.d("GeofenceReceiver", "Entered: ${geofence.requestId}")
                // Start a background service or send a broadcast to JS
                // For now, we rely on the JS task manager to handle the actual notification
                // but this receiver ensures the OS stays awake and triggers the event.
            }
        }
    }
}

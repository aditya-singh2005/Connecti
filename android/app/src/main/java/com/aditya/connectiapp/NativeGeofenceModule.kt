package com.aditya.connectiapp

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*
import android.app.PendingIntent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import android.util.Log

class NativeGeofenceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val geofencingClient = LocationServices.getGeofencingClient(reactContext)
    private val TAG = "NativeGeofenceModule"

    override fun getName(): String {
        return "NativeGeofenceModule"
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun registerGeofences(geofences: ReadableArray, promise: Promise) {
        try {
            val geofenceList = mutableListOf<Geofence>()
            
            for (i in 0 until geofences.size()) {
                val data = geofences.getMap(i) ?: continue
                val identifier = data.getString("identifier") ?: "zone_$i"
                val latitude = data.getDouble("latitude")
                val longitude = data.getDouble("longitude")
                val radius = data.getDouble("radius").toFloat()

                geofenceList.add(Geofence.Builder()
                    .setRequestId(identifier)
                    .setCircularRegion(latitude, longitude, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                    .build())
            }

            if (geofenceList.isEmpty()) {
                promise.resolve(true)
                return
            }

            val geofencingRequest = GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofenceList)
                .build()

            val intent = Intent(reactApplicationContext, GeofenceBroadcastReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext, 
                0, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )

            geofencingClient.addGeofences(geofencingRequest, pendingIntent).run {
                addOnSuccessListener {
                    Log.d(TAG, "Successfully added ${geofenceList.size} geofences")
                    promise.resolve(true)
                }
                addOnFailureListener { e ->
                    Log.e(TAG, "Failed to add geofences: ${e.message}")
                    promise.reject("GEOFENCE_ERROR", e.message)
                }
            }
        } catch (e: Exception) {
            promise.reject("GEOFENCE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun removeGeofences(promise: Promise) {
        val intent = Intent(reactApplicationContext, GeofenceBroadcastReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        geofencingClient.removeGeofences(pendingIntent).run {
            addOnSuccessListener {
                promise.resolve(true)
            }
            addOnFailureListener { e ->
                promise.reject("GEOFENCE_ERROR", e.message)
            }
        }
    }
}

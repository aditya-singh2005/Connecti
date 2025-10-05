// hooks/useLocationService.js
import { useEffect, useState, useRef } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { Alert, AppState } from "react-native";

export const useLocationService = (options = {}) => {
  const {
    updateInterval = 60000, // 1 min default
    highAccuracy = true,
    enableBackgroundLocation = false,
    autoStart = true
  } = options;

  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  
  const intervalRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // Function to get current location
  const getCurrentLocation = async () => {
    try {
      console.log("📍 Getting current location...");
      
      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
        maximumAge: 10000, // Use cached location if less than 10 seconds old
      });

      const { latitude, longitude } = locationResult.coords;
      const newLocation = {
        latitude,
        longitude,
        accuracy: locationResult.coords.accuracy,
        timestamp: new Date().toISOString()
      };

      console.log("📍 Location obtained:", newLocation);
      setLocation(newLocation);
      setLastUpdate(new Date());
      setError(null);

      setDebugInfo(prev => ({
        ...prev,
        lastLocationFetch: newLocation.timestamp,
        locationAccuracy: locationResult.coords.accuracy,
        coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      }));

      return newLocation;
    } catch (err) {
      console.error("❌ Error getting location:", err);
      setError(err.message);
      setDebugInfo(prev => ({
        ...prev,
        locationError: err.message,
        lastErrorTime: new Date().toISOString()
      }));
      return null;
    }
  };

  // Function to update location in Supabase
  const updateLocationInDatabase = async (locationData, userId) => {
    if (!locationData || !userId) return;

    try {
      console.log("💾 Updating location in database for user:", userId);
      
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          geom: `SRID=4326;POINT(${locationData.longitude} ${locationData.latitude})`,
          location_updated_at: locationData.timestamp // Add this column to track updates
        })
        .eq("id", userId);

      if (updateError) {
        console.error("❌ Database update error:", updateError);
        setDebugInfo(prev => ({
          ...prev,
          dbUpdateError: updateError.message,
          lastDbErrorTime: new Date().toISOString()
        }));
      } else {
        console.log("✅ Location updated in database successfully");
        setDebugInfo(prev => ({
          ...prev,
          lastDbUpdate: new Date().toISOString(),
          dbUpdateError: null
        }));
      }
    } catch (err) {
      console.error("❌ Database update exception:", err);
      setDebugInfo(prev => ({
        ...prev,
        dbUpdateError: err.message
      }));
    }
  };

  // Function to perform location update cycle
  const performLocationUpdate = async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log("⚠️ No authenticated user for location update");
        return;
      }

      // Get fresh location
      const newLocation = await getCurrentLocation();
      
      if (newLocation) {
        // Update in database
        await updateLocationInDatabase(newLocation, user.id);
      }
    } catch (err) {
      console.error("❌ Location update cycle error:", err);
      setError(err.message);
    }
  };

  // Start location tracking
  const startTracking = async () => {
    try {
      console.log("🚀 Starting location tracking...");
      
      // Request permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location services to use this feature."
        );
        return false;
      }

      // Request background permission if enabled
      if (enableBackgroundLocation) {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== "granted") {
          console.log("⚠️ Background location permission not granted");
        }
      }

      setIsTracking(true);
      setDebugInfo(prev => ({
        ...prev,
        trackingStarted: new Date().toISOString(),
        updateInterval: updateInterval
      }));

      // Perform initial location update
      await performLocationUpdate();

      // Set up periodic updates
      intervalRef.current = setInterval(async () => {
        if (appStateRef.current === 'active' || enableBackgroundLocation) {
          console.log("🔄 Periodic location update triggered");
          await performLocationUpdate();
        } else {
          console.log("📱 App in background, skipping location update");
        }
      }, updateInterval);

      console.log(`✅ Location tracking started with ${updateInterval/1000}s intervals`);
      return true;
    } catch (err) {
      console.error("❌ Error starting location tracking:", err);
      setError(err.message);
      return false;
    }
  };

  // Stop location tracking
  const stopTracking = () => {
    console.log("⏹️ Stopping location tracking...");
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    setIsTracking(false);
    setDebugInfo(prev => ({
      ...prev,
      trackingStopped: new Date().toISOString()
    }));
  };

  // Handle app state changes
  const handleAppStateChange = (nextAppState) => {
    console.log("📱 App state changed:", appStateRef.current, "->", nextAppState);
    
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - trigger immediate location update if tracking
      if (isTracking) {
        console.log("🔄 App resumed, triggering location update");
        performLocationUpdate();
      }
    }
    
    appStateRef.current = nextAppState;
  };

  // Effect to handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isTracking]);

  // Effect to auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      startTracking();
    }

    // Cleanup on unmount
    return () => {
      stopTracking();
    };
  }, []); // Empty dependency array for mount/unmount only

  // Manual location refresh
  const refreshLocation = async () => {
    console.log("🔄 Manual location refresh requested");
    await performLocationUpdate();
  };

  return {
    // State
    location,
    isTracking,
    lastUpdate,
    error,
    debugInfo,
    
    // Actions
    startTracking,
    stopTracking,
    refreshLocation,
    getCurrentLocation,
    
    // Utils
    isLocationStale: () => {
      if (!lastUpdate) return true;
      const staleThreshold = updateInterval * 2; // Consider stale if 2x update interval
      return Date.now() - lastUpdate.getTime() > staleThreshold;
    }
  };
};
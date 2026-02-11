// hooks/useGeofenceService.js - FIXED: Better detection + Single notifications + All zones
import { useState, useEffect, useRef } from 'react';
import { Platform, Alert, Linking, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { GEOFENCE_TASK_NAME, setupGeofenceNotificationChannels, storeFCMToken } from '../services/GeofenceManager';
// import GeofenceNativeBridge from '../services/GeofenceNativeBridge';
import ExpoPushTokenService from '../services/ExpoPushTokenService';
import { WaveService } from '../services/WaveService';

const GEOFENCE_EVENTS_KEY = 'geofence_events';
const GEOFENCE_CONFIG_KEY = 'geofence_config';
const CURRENT_ZONE_KEY = 'current_zone';
const NOTIFIED_ZONES_KEY = 'notified_zones';

export function useGeofenceService() {
  const [isGeofencingActive, setIsGeofencingActive] = useState(false);
  const [currentZone, setCurrentZone] = useState(null);
  const [allNearbyZones, setAllNearbyZonesState] = useState([]); // ✅ All zones, not just monitored

  // Restore missing state variables
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);

  // ✅ Refs to avoid stale closures in callbacks
  const activeGeofencesRef = useRef([]);
  const allNearbyZonesRef = useRef([]);

  // Wrapped setters to update both State (for UI) and Ref (for Logic)
  const setAllNearbyZones = (zones) => {
    allNearbyZonesRef.current = zones;
    setAllNearbyZonesState(zones);
  };

  const setActiveGeofences = (zones) => {
    activeGeofencesRef.current = zones;
    setActiveGeofencesState(zones);
  };

  const [activeGeofences, setActiveGeofencesState] = useState([]);

  const appStateRef = useRef(AppState.currentState);
  const locationSubscription = useRef(null);
  const notifiedZones = useRef(new Set());
  const lastZoneCheckLocation = useRef(null);

  useEffect(() => {
    console.log('🚀 useGeofenceService - Initializing');

    const init = async () => {
      await setupGeofenceNotificationChannels();
      await setupFCMToken();


      // const isNativeAvailable = GeofenceNativeBridge.isAvailable();
      // setNativeSupport(isNativeAvailable);

      // if (isNativeAvailable) {
      //   console.log('✅ Native geofencing available');
      //   await syncNativeEvents();
      // }

      const notified = await AsyncStorage.getItem(NOTIFIED_ZONES_KEY);
      if (notified) {
        notifiedZones.current = new Set(JSON.parse(notified));
      }

      const zone = await AsyncStorage.getItem(CURRENT_ZONE_KEY);
      if (zone) {
        setCurrentZone(zone);
        // ✅ NEW: Sync initial presence
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const lastLocJson = await AsyncStorage.getItem('last_location');
            const lastLoc = lastLocJson ? JSON.parse(lastLocJson) : null;
            await WaveService.syncUserZone(user.id, zone, lastLoc);
          }
        } catch (syncError) {
          console.warn('[useGeofence] Initial sync failed:', syncError.message);
        }
      }

      await loadRecentEvents();

      const config = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
      if (config) {
        const parsedConfig = JSON.parse(config);
        setIsGeofencingActive(true);
        setActiveGeofences(parsedConfig.geofences || []);
        setLastUpdate(parsedConfig.startedAt);
        console.log('ℹ️ Geofencing state restored');
        await startLocationMonitoring();
      } else {
        // 🧹 Auto-Clean: If no config exists, ensure no background task is running.
        // This prevents "zombie" tasks from firing on app open if the user previously cleared data/did not start.
        const isTaskDefined = await TaskManager.isTaskDefined(GEOFENCE_TASK_NAME);
        if (isTaskDefined) {
          console.log("🧹 Found zombie geofence task without config, stopping it...");
          try {
            await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          } catch (e) {
            console.log('⚠️ Could not stop zombie task:', e.message);
          }
        }

        // ✅ AUTO-START: Start geofencing automatically on first app open
        console.log('🚀 Auto-starting geofencing (first run or no config)...');
        try {
          // Check if we have location permissions
          const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
          const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();

          if (fgStatus === 'granted' && bgStatus === 'granted') {
            console.log('✅ Permissions granted, auto-starting geofencing...');
            // Give a small delay to ensure all services are ready
            setTimeout(async () => {
              try {
                await startGeofencing();
                console.log('✅ Auto-start geofencing complete');
              } catch (error) {
                console.log('⚠️ Auto-start failed:', error.message);
              }
            }, 2000);
          } else {
            console.log('⚠️ Permissions not granted, skipping auto-start');
          }
        } catch (error) {
          console.log('⚠️ Auto-start check failed:', error.message);
        }
      }


      // ✅ Resume active wave timer if exists
      await WaveService.checkAndResumeTimer();

      await updateCurrentLocation();
    };

    init();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      stopLocationMonitoring();
    };
  }, []);

  async function setupFCMToken() {
    try {
      console.log('🔑 Setting up FCM token...');
      const token = await ExpoPushTokenService.getToken();

      if (token) {
        await storeFCMToken(token);

        // if (nativeSupport) {
        //   await GeofenceNativeBridge.storeFCMToken(token);
        // }

        console.log('✅ FCM token ready');
      }
    } catch (error) {
      console.log('⚠️ FCM setup warning:', error.message);
    }
  }

  // ✅ FIXED: More frequent location updates for better detection
  async function startLocationMonitoring() {
    try {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }

      console.log('📍 Starting location monitoring...');

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('⚠️ Location permission not granted');
        return;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5, // ✅ CHANGED: Every 5 meters for better detection
          timeInterval: 2000, // ✅ CHANGED: Every 2 seconds
        },
        async (location) => {
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: new Date().toISOString(),
          };

          setCurrentLocation(newLocation);
          await AsyncStorage.setItem('last_location', JSON.stringify(newLocation));

          // ✅ 1. Check against CURRENT KNOWN zones immediately (Fastest feedback)
          await checkZoneEntry(newLocation);

          // ✅ 2. Update zones if moved significantly (e.g. Teleport)
          const zonesUpdated = await checkAndUpdateZones(newLocation);

          // ✅ 3. If zones updated, check again immediately
          if (zonesUpdated) {
            await checkZoneEntry(newLocation);
          }
        }
      );

      console.log('✅ Location monitoring active (every 2s or 5m)');
    } catch (error) {
      console.log('⚠️ Failed to start monitoring:', error.message);
    }
  }

  function stopLocationMonitoring() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
      console.log('🛑 Stopped location monitoring');
    }
  }

  // ✅ FIXED: Update zones more frequently
  async function checkAndUpdateZones(location) {
    try {
      if (lastZoneCheckLocation.current) {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          lastZoneCheckLocation.current.latitude,
          lastZoneCheckLocation.current.longitude
        );

        // ✅ CHANGED: Update every 300m instead of 500m
        if (distance < 300) {
          return false; // No update needed
        }
      }

      console.log('🔄 Updating zones (moved >300m)...');
      lastZoneCheckLocation.current = location;

      // ✅ Fetch MORE zones with LARGER radius
      const nearbyZones = await fetchNearbyZones(
        location.latitude,
        location.longitude,
        10000 // ✅ CHANGED: 10km radius instead of 5km
      );

      if (nearbyZones.length === 0) {
        console.log('ℹ️ No zones found nearby');
        return false;
      }

      console.log(`✅ Found ${nearbyZones.length} nearby zones`);

      // ✅ CRITICAL: Store ALL nearby zones for checking
      setAllNearbyZones(nearbyZones);

      // Register top 20 closest zones for background monitoring
      const geofences = nearbyZones.slice(0, 20).map(zone => ({
        identifier: zone.name || `zone_${zone.id}`,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radius: Math.min((zone.radius || 150) + 100, 1000), // ✅ Larger buffer
        notifyOnEnter: true,
        notifyOnExit: false,
        zoneData: zone,
      }));

      try {
        // ✅ CRITICAL FIX: Ensure task is defined before touching it
        const isTaskDefined = await TaskManager.isTaskDefined(GEOFENCE_TASK_NAME);
        if (!isTaskDefined) {
          console.warn(`[useGeofenceService] Task ${GEOFENCE_TASK_NAME} not defined! Skipping update.`);
          return false;
        }

        const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
        if (isRunning) {
          try {
            await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          } catch (stopError) {
            console.log('[useGeofenceService] Note: Failed to stop existing task (might be already stopped):', stopError.message);
          }
        }

        // Strict validation for update
        const cleanZones = geofences.map(z => ({
          identifier: String(z.identifier),
          latitude: Number(z.latitude),
          longitude: Number(z.longitude),
          radius: Number(z.radius),
          notifyOnEnter: true,
          notifyOnExit: false,
        }));

        await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, cleanZones);
        console.log(`✅ Updated to monitor ${geofences.length} zones`);

        if (false) { // Native support removed
          //   await GeofenceNativeBridge.unregisterGeofences();
          //   await GeofenceNativeBridge.registerGeofences(geofences);
        }

        setActiveGeofences(geofences);
        await AsyncStorage.setItem('active_geofences', JSON.stringify(geofences));

        return true; // Zones updated

      } catch (error) {
        console.log('⚠️ Failed to update geofences:', error.message);
        return false;
      }

    } catch (error) {
      console.log('⚠️ Zone update error:', error.message);
    }
  }

  // ✅ FIXED: Check ALL nearby zones, not just monitored
  async function checkZoneEntry(location) {
    try {
      // ✅ CRITICAL: Check ALL nearby zones (even ones not in monitored list)
      // Use Refs to ensure we have the LATEST data in the callback
      const allZones = allNearbyZonesRef.current;
      const activeZones = activeGeofencesRef.current;

      const zonesToCheck = allZones.length > 0 ? allZones : activeZones;

      if (zonesToCheck.length === 0) return;

      let foundZone = null;
      let minDistance = Infinity;

      // Find which zone we're in (if any)
      for (const zone of zonesToCheck) {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          zone.latitude,
          zone.longitude
        );

        const radius = zone.radius || 150;
        const zoneName = zone.name || zone.identifier;

        // ✅ CRITICAL: Check if we're INSIDE this zone
        if (distance <= radius) {
          if (distance < minDistance) {
            minDistance = distance;
            foundZone = { name: zoneName, distance };
          }
        }
      }

      // If we found a zone we're inside
      if (foundZone) {
        const zoneName = foundZone.name;

        // ✅ Check if we haven't notified about this zone yet
        if (!notifiedZones.current.has(zoneName)) {
          console.log(`\n🎯 NEW ZONE ENTRY: ${zoneName} 🎯`);
          console.log(`Distance from center: ${Math.round(foundZone.distance)}m\n`);

          notifiedZones.current.add(zoneName);
          await saveNotifiedZones();

          // ✅ FIXED: Send ONLY ONE notification
          await sendSingleZoneNotification(zoneName, Math.round(foundZone.distance), location);

          // ✅ NEW: Sync with Supabase via WaveService
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await WaveService.syncUserZone(user.id, zoneName, location);
            }
          } catch (dbError) {
            console.warn('[FG] ⚠️ Presence sync failed:', dbError.message);
          }

          setCurrentZone(zoneName);
          await AsyncStorage.setItem(CURRENT_ZONE_KEY, zoneName);
        }
      } else {
        // Not in any zone
        if (currentZone) {
          console.log(`🚪 Left zone: ${currentZone}`);

          // ✅ NEW: Cleanup active_zone_users
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase
                .from('active_zone_users')
                .delete()
                .eq('user_id', user.id);
              console.log(`[FG] 🌐 Cleared active_zone_users`);
            }
          } catch (dbError) {
            console.warn('[FG] ⚠️ Database cleanup failed:', dbError.message);
          }

          setCurrentZone(null);
          await AsyncStorage.removeItem(CURRENT_ZONE_KEY);

          // Clear notified zones so we can re-enter
          notifiedZones.current.clear();
          await saveNotifiedZones();
        }
      }

    } catch (error) {
      console.log('⚠️ Entry check error:', error.message);
    }
  }

  // ✅ FIXED: Send ONLY ONE notification (no FCM duplicate)
  async function sendSingleZoneNotification(zoneName, distance, location) {
    try {
      const timestamp = new Date().toISOString();

      console.log(`📢 Sending SINGLE notification: ${zoneName}`);

      // ✅ COOLDOWN CHECK: Prevent Duplicate Notifications (Sync with Background Task)
      const outputKey = `last_notification_${zoneName}`;
      const lastSentTime = await AsyncStorage.getItem(outputKey);
      const now = new Date().getTime();

      if (lastSentTime && (now - parseInt(lastSentTime) < 15000)) {
        console.log(`[useGeofence] ⏳ Cooldown active for ${zoneName}, skipping notification.`);
        return;
      }

      await AsyncStorage.setItem(outputKey, now.toString());

      /* 
       * RE-ENABLED: Foreground Service Logic
       * This ensures immediate feedback when the app is open/monitored.
       * The Cooldown Logic prevents the Background Task from sending a duplicate.
       */
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `📍 Entered ${zoneName}`,
          body: "Tap 'Wave' to check in! 👋",
          data: { url: '/home/HomeScreen', zoneId: zoneName },
          categoryIdentifier: 'GEOFENCE_MATCH',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 300, 200, 300],
          badge: 1,
          channelId: 'geofence-alerts',
        },
        trigger: null,
      });

      console.log(`✅ Notification sent! ID: ${notificationId}`);

      // Store event
      await storeGeofenceEvent({
        type: 'enter',
        zone: zoneName,
        timestamp: timestamp,
        lat: location.latitude,
        lng: location.longitude,
        distance: distance,
        accuracy: location.accuracy,
        appState: 'foreground',
        source: 'foreground_monitoring',
        notificationSent: true,
      });

    } catch (error) {
      console.error('❌ Notification error:', error.message);
    }
  }

  async function storeGeofenceEvent(eventData) {
    try {
      const storedEvents = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
      const eventsList = storedEvents ? JSON.parse(storedEvents) : [];

      eventsList.push(eventData);

      const trimmedEvents = eventsList.slice(-100);
      await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(trimmedEvents));

      await loadRecentEvents();

      console.log(`✅ Event stored: ${eventData.zone}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store event:', error.message);
      return false;
    }
  }

  async function saveNotifiedZones() {
    try {
      await AsyncStorage.setItem(
        NOTIFIED_ZONES_KEY,
        JSON.stringify(Array.from(notifiedZones.current))
      );
    } catch (error) {
      console.log('⚠️ Failed to save notified zones:', error.message);
    }
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  const handleAppStateChange = async (nextAppState) => {
    if (appStateRef.current !== 'active' && nextAppState === 'active') {
      console.log('📱 App became active');

      if (false) {
        // await syncNativeEvents();
      }

      await loadRecentEvents();
      await updateCurrentLocation();

      if (isGeofencingActive) {
        await startLocationMonitoring();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      console.log('📱 App went to background');
    }

    appStateRef.current = nextAppState;
  };

  async function syncNativeEvents() {
    // Native sync removed
    return;
  }

  async function loadRecentEvents() {
    try {
      const events = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
      if (events) {
        const allEvents = JSON.parse(events);
        const entryEvents = allEvents.filter(e => e.type === 'enter');
        entryEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRecentEvents(entryEvents.slice(0, 20));

        console.log(`📊 Loaded ${entryEvents.length} events`);
      }
    } catch (error) {
      console.log('⚠️ Failed to load events:', error.message);
    }
  }

  async function updateCurrentLocation() {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeout: 5000,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
      };

      setCurrentLocation(newLocation);
      await AsyncStorage.setItem('last_location', JSON.stringify(newLocation));

      return newLocation;
    } catch (error) {
      console.log('⚠️ Location update failed:', error.message);
      return null;
    }
  }

  async function startGeofencing() {
    setLoading(true);

    try {
      console.log('\n🚀 Starting geofencing...');

      let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        const { status: newFgStatus } = await Location.requestForegroundPermissionsAsync();
        fgStatus = newFgStatus;
      }

      if (fgStatus !== 'granted') {
        throw new Error('Foreground location permission denied');
      }

      let { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        const { status: newBgStatus } = await Location.requestBackgroundPermissionsAsync();
        bgStatus = newBgStatus;
      }

      if (bgStatus !== 'granted') {
        Alert.alert(
          '⚠️ Background Location Required',
          'For notifications when app is closed:\n\n' +
          '1. Tap "Open Settings"\n' +
          '2. Select "Allow all the time"',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        throw new Error('Background permission required');
      }

      await setupFCMToken();
      await setupGeofenceNotificationChannels();

      console.log('📍 Getting current location...');
      const userLocation = await updateCurrentLocation();

      if (!userLocation) {
        throw new Error('Could not get current location');
      }

      console.log('🔍 Fetching nearby zones...');
      const nearbyZones = await fetchNearbyZones(
        userLocation.latitude,
        userLocation.longitude,
        10000 // ✅ 10km radius
      );

      if (nearbyZones.length === 0) {
        throw new Error('No zones found within 10km radius');
      }

      console.log(`✅ Found ${nearbyZones.length} zones`);
      setAllNearbyZones(nearbyZones);

      const geofences = nearbyZones.slice(0, 20).map(zone => ({
        identifier: zone.name || `zone_${zone.id}`,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radius: Math.min((zone.radius || 150) + 100, 1000),
        notifyOnEnter: true,
        notifyOnExit: false,
        zoneData: zone,
      }));

      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      } catch (e) { }

      console.log('📌 Starting Expo geofencing...');

      const cleanZones = geofences.map(z => ({
        identifier: String(z.identifier),
        latitude: Number(z.latitude),
        longitude: Number(z.longitude),
        radius: Number(z.radius),
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, cleanZones);
      console.log('✅ Expo geofencing active');

      if (false) {
        console.log('📌 Registering native geofences...');
        // try {
        //   await GeofenceNativeBridge.registerGeofences(geofences);
        //   console.log('✅ Native geofences registered');
        // } catch (nativeError) {
        //   console.log('⚠️ Native registration failed:', nativeError.message);
        // }
      }

      const now = new Date().toISOString();

      await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify({
        geofences: geofences,
        location: userLocation,
        startedAt: now,
        startedAt: now,
        nativeSupport: false,
        version: '5.0.0-fixed-expo-only',
      }));

      await AsyncStorage.setItem('active_geofences', JSON.stringify(geofences));
      await AsyncStorage.setItem('last_update', now);

      notifiedZones.current.clear();
      await AsyncStorage.removeItem(NOTIFIED_ZONES_KEY);

      setIsGeofencingActive(true);
      setActiveGeofences(geofences);
      setLastUpdate(now);
      lastZoneCheckLocation.current = userLocation;

      await startLocationMonitoring();

      console.log('\n✅ Geofencing active!\n');

      return {
        success: true,
        zonesCount: geofences.length,
        zones: nearbyZones,
        location: userLocation,
        nativeSupport: false,
      };

    } catch (error) {
      console.error('❌ Failed to start geofencing:', error);
      Alert.alert('Error', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }

  async function stopGeofencing() {
    try {
      console.log('🛑 Stopping geofencing...');

      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      } catch (e) {
        console.log('ℹ️ No Expo geofencing to stop');
      }

      if (false) {
        // await GeofenceNativeBridge.unregisterGeofences();
      }

      stopLocationMonitoring();

      await AsyncStorage.multiRemove([
        'active_geofences',
        GEOFENCE_CONFIG_KEY,
        'last_update',
        NOTIFIED_ZONES_KEY,
        CURRENT_ZONE_KEY,
      ]);

      notifiedZones.current.clear();
      lastZoneCheckLocation.current = null;

      setIsGeofencingActive(false);
      setActiveGeofences([]);
      setCurrentZone(null);
      setAllNearbyZones([]);

      console.log('✅ Geofencing stopped');
      return { success: true };
    } catch (error) {
      console.log('⚠️ Stop error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async function fetchNearbyZones(lat, lng, radiusMeters = 10000) {
    try {
      console.log(`🔍 Fetching zones near: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

      const { data, error } = await supabase.rpc('get_nearby_zones', {
        user_lat: lat,
        user_lng: lng,
        search_radius_meters: radiusMeters,
        max_results: 50, // ✅ Get more zones
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      console.log(`✅ Found ${data.length} zones`);
      return data;

    } catch (error) {
      console.error('❌ Failed to fetch zones:', error);
      throw new Error(`Failed to fetch zones: ${error.message}`);
    }
  }

  async function refreshGeofences() {
    if (!isGeofencingActive) {
      return { success: false, error: 'Geofencing not active' };
    }

    try {
      const userLocation = await updateCurrentLocation();
      if (!userLocation) {
        return { success: false, error: 'Could not get location' };
      }

      await checkAndUpdateZones(userLocation);

      return { success: true, zonesCount: activeGeofences.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function clearEventHistory() {
    try {
      await AsyncStorage.multiRemove([
        GEOFENCE_EVENTS_KEY,
        NOTIFIED_ZONES_KEY,
        CURRENT_ZONE_KEY,
      ]);

      if (false) {
        // await GeofenceNativeBridge.clearStoredEvents();
      }

      notifiedZones.current.clear();
      setRecentEvents([]);
      setCurrentZone(null);

      console.log('✅ Event history cleared');
      return true;
    } catch (error) {
      console.log('⚠️ Clear failed:', error.message);
      return false;
    }
  }

  function getGeofenceStats() {
    const killedEvents = recentEvents.filter(e => e.appState === 'killed');
    const foregroundEvents = recentEvents.filter(e => e.appState === 'foreground');

    // ✅ FIXED: Calculate distances for ALL zones
    let zonesWithDistances = [];
    if (currentLocation && activeGeofences.length > 0) {
      zonesWithDistances = activeGeofences.map(fence => {
        const distance = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          fence.latitude,
          fence.longitude
        );
        return { ...fence, distance };
      });

      // ✅ Sort by distance (ascending)
      zonesWithDistances.sort((a, b) => a.distance - b.distance);
    }

    let nearestZone = null;
    if (zonesWithDistances.length > 0) {
      nearestZone = {
        identifier: zonesWithDistances[0].identifier,
        distance: zonesWithDistances[0].distance,
        isInside: zonesWithDistances[0].distance <= zonesWithDistances[0].radius,
      };
    }

    return {
      isActive: isGeofencingActive,
      nativeSupport: false,
      zonesCount: activeGeofences.length,
      allZonesCount: allNearbyZones.length,
      zonesWithDistances, // ✅ Return zones sorted by distance
      location: currentLocation,
      lastUpdate: lastUpdate,
      recentEvents: recentEvents,
      recentEventsCount: recentEvents.length,
      killedEventsCount: killedEvents.length,
      foregroundEventsCount: foregroundEvents.length,
      nearestZone,
      currentZone,
    };
  }

  return {
    isGeofencingActive,
    activeGeofences,
    currentLocation,
    loading,
    lastUpdate,
    recentEvents,
    nativeSupport: false,
    currentZone,
    allNearbyZones,

    startGeofencing,
    stopGeofencing,
    refreshGeofences,
    loadRecentEvents,
    clearEventHistory,
    updateCurrentLocation,
    getGeofenceStats,
    syncNativeEvents,
  };
}
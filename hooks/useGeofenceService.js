// hooks/useGeofenceService.js - FIXED: Better detection + Single notifications + All zones
import { useState, useEffect, useRef } from 'react';
import { Platform, Alert, Linking, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { GEOFENCE_TASK_NAME, LOCATION_REFRESH_TASK_NAME, setupGeofenceNotificationChannels, storeFCMToken, refreshGeofencesAtLocation } from '../services/GeofenceManager';
import ExpoPushTokenService from '../services/ExpoPushTokenService';
import { WaveService } from '../services/WaveService';
import { DebugService } from '../services/DebugService';
import NativeGeofenceService from '../services/NativeGeofenceService'; // ✅ Native geofencing

const GEOFENCE_EVENTS_KEY = 'geofence_events';
const GEOFENCE_CONFIG_KEY = 'geofence_config';
const CURRENT_ZONE_KEY = 'current_zone';
const NOTIFIED_ZONES_KEY = 'notified_zones';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active';
const APP_RUNTIME_STATE_KEY = 'app_runtime_state';
const APP_RUNTIME_STATE_UPDATED_AT_KEY = 'app_runtime_state_updated_at';

export function useGeofenceService() {
  const [isGeofencingActive, setIsGeofencingActive] = useState(false);
  const [currentZone, setCurrentZoneState] = useState(null);
  const [nativeSupport, setNativeSupportState] = useState(false);
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
  const heartbeatIntervalRef = useRef(null);

  const appStateRef = useRef(AppState.currentState);
  const locationSubscription = useRef(null);
  const notifiedZones = useRef(new Set());
  const lastZoneCheckLocation = useRef(null);
  const isStartingRef = useRef(false);
  const currentZoneRef = useRef(null);
  const nativeSupportRef = useRef(false);
  const checkZoneEntryLock = useRef(false); // ✅ Lock to prevent concurrent zone entry processing

  const setCurrentZone = (zone) => {
    currentZoneRef.current = zone;
    setCurrentZoneState(zone);
  };

  const setNativeSupport = (value) => {
    const boolValue = Boolean(value);
    nativeSupportRef.current = boolValue;
    setNativeSupportState(boolValue);
  };

  const persistRuntimeState = async (state) => {
    const timestamp = Date.now().toString();

    await AsyncStorage.multiSet([
      [APP_RUNTIME_STATE_KEY, state],
      [APP_RUNTIME_STATE_UPDATED_AT_KEY, timestamp],
    ]);

    if (Platform.OS === 'android') {
      await NativeGeofenceService.setAppRuntimeState(state, Number(timestamp));
    }

    if (state === 'active') {
      await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, timestamp);
    }
  };

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

      // 🧹 SESSION CLEANUP: If app loads after a long time, wipe notified zones and active zone
      const lastActive = await AsyncStorage.getItem(SESSION_LAST_ACTIVE_KEY);
      const now = Date.now();
      const STALE_THRESHOLD = 30 * 60 * 1000; // ✅ PRODUCTION: 30 mins

      if (lastActive && (now - parseInt(lastActive) > STALE_THRESHOLD)) {
        console.log('🧹 Stale session found. Wiping notified zones and current zone.');
        await AsyncStorage.removeItem(NOTIFIED_ZONES_KEY);
        await AsyncStorage.removeItem(CURRENT_ZONE_KEY);
        await AsyncStorage.removeItem('wave_timer_expiry'); // WAVE_TIMER_KEY from WaveService
        setCurrentZone(null);
        notifiedZones.current = new Set();
      } else {
        const notified = await AsyncStorage.getItem(NOTIFIED_ZONES_KEY);
        if (notified) {
          notifiedZones.current = new Set(JSON.parse(notified));
        }

        const zone = await AsyncStorage.getItem(CURRENT_ZONE_KEY);
        if (zone) {
          setCurrentZone(zone);
          // ✅ Sync initial presence
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
      }

      // Update last active on every load
      await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, now.toString());
      await persistRuntimeState('active');

      await loadRecentEvents();

      const config = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
      if (config) {
        const parsedConfig = JSON.parse(config);
        setIsGeofencingActive(true);
        setActiveGeofences(parsedConfig.geofences || []);
        setLastUpdate(parsedConfig.startedAt);
        console.log('ℹ️ Geofencing state restored');

        // ✅ RE-VALIDATE native support on restore (don't trust stale config)
        let actualNativeSupport = false;
        if (parsedConfig.nativeSupport && Platform.OS === 'android') {
          try {
            actualNativeSupport = await NativeGeofenceService.isAvailable();
          } catch (_e) {
            actualNativeSupport = false;
          }
        }
        setNativeSupport(actualNativeSupport);
        console.log(`ℹ️ Native support re-validated: ${actualNativeSupport}`);

        if (actualNativeSupport && Platform.OS === 'android') {
          try {
            const registered = await NativeGeofenceService.getRegisteredGeofences();
            if (!registered.length && (parsedConfig.geofences || []).length) {
              console.log('⚠️ Native geofences missing on restore, registering again...');
              await NativeGeofenceService.registerGeofences(parsedConfig.geofences || []);
              console.log('✅ Native geofences restored from saved config');
            }

            try {
              await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
              console.log('Stopped Expo geofencing on restore because native geofencing is active');
            } catch (_stopError) {
              // No Expo task registered is fine here.
            }
          } catch (nativeRestoreError) {
            console.log('⚠️ Failed to restore native geofences:', nativeRestoreError.message);
          }
        }

        await startLocationMonitoring();
      } else {
        // 🧹 Auto-Clean: If no config exists, ensure no background task is running.
        // This prevents "zombie" tasks from firing on app open if the user previously cleared data/did not start.
        try {
          const isTaskDefined = await TaskManager.isTaskDefined(GEOFENCE_TASK_NAME);
          if (isTaskDefined) {
            console.log("🧹 Found zombie geofence task without config, stopping it...");
            await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          }
        } catch (e) {
          // Ignore TaskNotFoundException - it just means there was nothing to stop
          if (!e.message.includes('TaskNotFoundException')) {
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

      // ✅ START HEARTBEAT: Every 15 minutes to keep presence alive in DB
      startHeartbeat();

      // ✅ CRITICAL: Force immediate location update and zone check on startup
      // and REFRESH NEARBY GEOFENCES at the current location
      console.log('📍 Verifying initial zone presence and refreshing nearby geofences...');
      const userLocation = await updateCurrentLocation();
      if (userLocation) {
        // 🔥 Refresh geofences at OS level immediately on foreground open
        await refreshGeofencesAtLocation(userLocation, 'foreground');
        await checkZoneEntry(userLocation);
      }
    };

    init();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      stopLocationMonitoring();
      stopHeartbeat();
    };
  }, []);

  // ✅ HEARTBEAT SYSTEM: Very low battery impact (Every 15 mins)
  function startHeartbeat() {
    if (heartbeatIntervalRef.current) return;

    console.log('💓 Starting 15-minute heartbeat system');
    heartbeatIntervalRef.current = setInterval(async () => {
      if (currentZoneRef.current && appStateRef.current === 'active') {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            console.log(`💓 Heartbeat: Refreshing presence for ${currentZoneRef.current}`);
            const lastLocJson = await AsyncStorage.getItem('last_location');
            const lastLoc = lastLocJson ? JSON.parse(lastLocJson) : null;
            await WaveService.syncUserZone(user.id, currentZoneRef.current, lastLoc);
          }
        } catch (e) {
          console.warn('💓 Heartbeat failed:', e.message);
        }
      }
    }, 25 * 60 * 1000); // 25 minutes
  }

  function stopHeartbeat() {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      console.log('🛑 Stopped heartbeat system');
    }
  }

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
        radius: Math.min((zone.radius || 500) + 200, 1500), // ✅ PRODUCTION: 500m base + 200m buffer
        notifyOnEnter: true,
        notifyOnExit: false,
        zoneData: zone,
      }));

      try {
        // ✅ FIX: Dynamically check native availability instead of trusting stale ref
        let useNativeForUpdate = false;
        if (Platform.OS === 'android') {
          try {
            useNativeForUpdate = await NativeGeofenceService.isAvailable();
          } catch (_e) {
            useNativeForUpdate = false;
          }
        }

        if (useNativeForUpdate) {
          await NativeGeofenceService.registerGeofences(geofences);
          try {
            await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          } catch (_expoStopError) {
            // No Expo task registered is expected in native mode.
          }
          console.log(`✅ Updated ${geofences.length} native geofences`);
        } else {
          // ✅ CRITICAL FIX: Ensure task is DEFINED in JS
          const isTaskDefined = await TaskManager.isTaskDefined(GEOFENCE_TASK_NAME);
          if (!isTaskDefined) {
            console.warn(`[useGeofenceService] Task ${GEOFENCE_TASK_NAME} not defined! Skipping update.`);
            return false;
          }

          // Check if already registered (running)
          const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);

          if (isTaskRegistered) {
            try {
              await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
              console.log('[useGeofenceService] Stopped existing geofencing for update');
            } catch (stopError) {
              console.log('[useGeofenceService] Note: Failed to stop existing task:', stopError.message);
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

          // ✅ Add delay to ensure Android context is ready
          await new Promise(resolve => setTimeout(resolve, 500));

          let success = false;
          let attempts = 0;

          while (!success && attempts < 3) {
            try {
              await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, cleanZones);
              success = true;
              console.log(`✅ Updated to monitor ${geofences.length} zones`);
            } catch (e) {
              console.log(`⚠️ Geofencing start attempt ${attempts + 1} failed: ${e.message}`);
              attempts++;
              if (attempts < 3) await new Promise(r => setTimeout(r, 1000));
            }
          }

          if (!success) {
            throw new Error("Failed to start geofencing after 3 attempts");
          }
        }

        // ✅ START BACKGROUND LOCATION REFRESH FOR BOTH MODES
        // This ensures distance-based zone updates work in foreground, background, and killed states
        let locationRefreshSuccess = false;
        let refreshAttempts = 0;
        
        while (!locationRefreshSuccess && refreshAttempts < 3) {
          try {
            await Location.startLocationUpdatesAsync(LOCATION_REFRESH_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 500, // Trigger every 500m
              deferredUpdatesInterval: 60000, // 1 min
            });
            locationRefreshSuccess = true;
            console.log('✅ Location refresh task active for distance-based geofence updates');
          } catch (e) {
            console.log(`⚠️ Location refresh task start attempt ${refreshAttempts + 1} failed: ${e.message}`);
            refreshAttempts++;
            if (refreshAttempts < 3) await new Promise(r => setTimeout(r, 1000));
          }
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
    // ✅ LOCK: Prevent concurrent processing that causes duplicate notifications
    if (checkZoneEntryLock.current) return;
    checkZoneEntryLock.current = true;

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

        // No transition -> no notification/event spam.
        if (currentZoneRef.current === zoneName) {
          return;
        }

        console.log(`\n🎯 NEW ZONE ENTRY: ${zoneName} 🎯`);
        console.log(`Distance from center: ${Math.round(foundZone.distance)}m\n`);

        notifiedZones.current.add(zoneName);
        await saveNotifiedZones();

        // ✅ 0. Check LOCAL wave status first
        if (await WaveService.isWavedLocal()) {
          console.log(`[FG] 🌊 User already Waved (local), skipping alert for ${zoneName}`);
          // Sync silently to DB
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await WaveService.syncUserZone(user.id, zoneName, location);
          } catch (_e) { }
          setCurrentZone(zoneName);
          await AsyncStorage.setItem(CURRENT_ZONE_KEY, zoneName);
          return;
        }

        // ✅ 1. Sync with Supabase via WaveService
        let alreadyOpen = false;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const syncResult = await WaveService.syncUserZone(user.id, zoneName, location);
            alreadyOpen = syncResult?.openToWave || false;
          }
        } catch (dbError) {
          console.warn('[FG] ⚠️ Presence sync failed:', dbError.message);
        }

        // ✅ 2. Send foreground notification for zone entry
        // Always send from JS — the native geofence task only fires in background/killed.
        if (!alreadyOpen) {
          await sendSingleZoneNotification(zoneName, Math.round(foundZone.distance), location);
        } else {
          console.log(`[FG] 🌊 User already open to wave in ${zoneName}, skipping alert`);
        }

        setCurrentZone(zoneName);
        await AsyncStorage.setItem(CURRENT_ZONE_KEY, zoneName);
      } else {
        // Not in any zone
        if (currentZoneRef.current) {
          console.log(`🚪 Left zone: ${currentZoneRef.current}`);
          notifiedZones.current.delete(currentZoneRef.current);
          await saveNotifiedZones();

          setCurrentZone(null);
          await AsyncStorage.removeItem(CURRENT_ZONE_KEY);
        }
      }

    } catch (error) {
      console.log('⚠️ Entry check error:', error.message);
    } finally {
      checkZoneEntryLock.current = false;
    }
  }

  // ✅ FIXED: Send ONLY ONE notification (no FCM duplicate)
  async function sendSingleZoneNotification(zoneName, distance, location) {
    try {
      const timestamp = new Date().toISOString();
      const executionState = 'foreground';
      const stateLabel = executionState.toUpperCase();

      console.log(`📢 Sending SINGLE notification: ${zoneName}`);

      // ✅ COOLDOWN CHECK: Prevent Duplicate Notifications (Sync with Background Task)
      const outputKey = `last_notification_${zoneName}`;
      const lastSentTime = await AsyncStorage.getItem(outputKey);
      const now = Date.now();
      const cooldownMs = 30 * 60 * 1000; // 30 minutes
      if (lastSentTime && (now - parseInt(lastSentTime, 10) < cooldownMs)) {
        console.log(`[useGeofence] ⏳ Cooldown active for ${zoneName}, skipping notification.`);
        return;
      }

      await AsyncStorage.setItem(outputKey, now.toString());
      await AsyncStorage.setItem('last_notified_zone', zoneName);

      /* 
       * RE-ENABLED: Foreground Service Logic
       * This ensures immediate feedback when the app is open/monitored.
       * The Cooldown Logic prevents the Background Task from sending a duplicate.
       */
      await Notifications.scheduleNotificationAsync({
        content: {
          data: {
            url: '/home/HomeScreen',
            zoneId: zoneName,
            executionState,
            source: 'foreground_monitoring',
            timestamp,
            distance,
          },
          title: `Entered ${zoneName} [${stateLabel}]`,
          body: `[${stateLabel}] Tap 'Wave' to check in!`,
          categoryIdentifier: 'GEOFENCE_MATCH',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 300, 200, 300],
          badge: 1,
          channelId: 'geofence-alerts',
        },
        trigger: null,
      });

      console.log(`✅ Entry notification sent for ${zoneName}`);

      // Store event
      await storeGeofenceEvent({
        type: 'enter',
        zone: zoneName,
        timestamp: timestamp,
        lat: location.latitude,
        lng: location.longitude,
        distance: distance,
        accuracy: location.accuracy,
        appState: executionState,
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
      await persistRuntimeState('active');
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
      await persistRuntimeState(nextAppState);
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
    if (isStartingRef.current) {
      console.log('⏳ startGeofencing already in progress, skipping duplicate call');
      return { success: false, error: 'Geofencing startup already in progress' };
    }

    isStartingRef.current = true;
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

      // ✅ CRITICAL: Request battery optimization exemption for killed-state operation
      if (Platform.OS === 'android') {
        try {
          const { IntentLauncher } = require('expo-intent-launcher');
          const { NativeModules } = require('react-native');

          // Check if already exempted
          const PowerManager = NativeModules.PowerManager;
          if (PowerManager && PowerManager.isIgnoringBatteryOptimizations) {
            const isExempted = await PowerManager.isIgnoringBatteryOptimizations();

            if (!isExempted) {
              Alert.alert(
                '🔋 Battery Optimization',
                'For reliable notifications when app is closed, please disable battery optimization.\\n\\nThis ensures geofencing works even after device reboot.',
                [
                  {
                    text: 'Open Settings',
                    onPress: async () => {
                      try {
                        await Linking.openSettings();
                      } catch (e) {
                        console.log('Could not open battery settings:', e.message);
                      }
                    }
                  },
                  { text: 'Skip', style: 'cancel' }
                ]
              );
            } else {
              console.log('✅ Battery optimization already disabled');
            }
          }
        } catch (e) {
          console.log('⚠️ Could not check battery optimization:', e.message);
        }
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
        radius: Math.min((zone.radius || 500) + 200, 1500), // ✅ PRODUCTION: 500m base + 200m buffer
        notifyOnEnter: true,
        notifyOnExit: false,
        zoneData: zone,
      }));

      const cleanZones = geofences.map(z => ({
        identifier: String(z.identifier),
        latitude: Number(z.latitude),
        longitude: Number(z.longitude),
        radius: Number(z.radius),
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      const now = new Date().toISOString();

      // ✅ TRY NATIVE GEOFENCING FIRST (OS-level, works when killed)
      let nativeSuccess = false;
      let useNative = false;

      if (Platform.OS === 'android') {
        try {
          const nativeAvailable = await NativeGeofenceService.isAvailable();
          if (nativeAvailable) {
            console.log('🚀 Using NATIVE geofencing (OS-level, works when killed)');
            await NativeGeofenceService.registerGeofences(geofences);
            const registeredNative = await NativeGeofenceService.getRegisteredGeofences();
            if (!registeredNative.length) {
              throw new Error('Native geofence registry is empty after registration');
            }
            console.log(`✅ Verified ${registeredNative.length} native geofences are registered`);
            nativeSuccess = true;
            useNative = true;
            try {
              await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
              console.log('Stopped Expo geofencing because native geofencing is active');
            } catch (stopExpoError) {
              console.log('Expo geofencing task was already stopped while enabling native geofencing');
            }

            // ✅ ALWAYS: Start background location monitoring for distance-based refresh
            // even in native mode, we want JS to wake up every 500m to refresh the Os-level geofence list.
            await Location.startLocationUpdatesAsync(LOCATION_REFRESH_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 500, // Trigger every 500m
              deferredUpdatesInterval: 60000, // 1 min
            });
          } else {
            console.log('⚠️ Native geofencing not available, falling back to Expo');
          }
        } catch (nativeError) {
          console.log('⚠️ Native geofencing failed, falling back to Expo:', nativeError.message);
        }
      }

      // ✅ FALLBACK: Use Expo geofencing if native failed or unavailable
      if (!nativeSuccess) {
        console.log('📍 Native unavailable, starting Expo geofencing fallback...');

        // ✅ Ensure task is defined before starting
        const isTaskDefined = await TaskManager.isTaskDefined(GEOFENCE_TASK_NAME);
        if (!isTaskDefined) {
          throw new Error(`Task ${GEOFENCE_TASK_NAME} not defined. Cannot start Expo geofencing.`);
        }

        // Stop if already running to ensure clean start
        const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
        if (isTaskRegistered) {
          try {
            await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          } catch (e) {
            console.log('ℹ️ Failed to stop existing Expo geofencing task:', e.message);
          }
        }

        // ✅ Add delay to ensure Android context is ready
        await new Promise(resolve => setTimeout(resolve, 500));

        let startSuccess = false;
        let startAttempts = 0;

        while (!startSuccess && startAttempts < 3) {
          try {
            await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, cleanZones);

            // ✅ ALSO: Start background location monitoring for distance-based refresh
            await Location.startLocationUpdatesAsync(LOCATION_REFRESH_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 500, // Trigger every 500m
              deferredUpdatesInterval: 60000, // 1 min
            });

            startSuccess = true;
            console.log('✅ Expo geofencing + location refresh active');
          } catch (e) {
            console.log(`⚠️ Geofencing start attempt ${startAttempts + 1} failed: ${e.message}`);
            startAttempts++;
            if (startAttempts < 3) await new Promise(r => setTimeout(r, 1000));
          }
        }

        if (!startSuccess) {
          throw new Error("Failed to start Expo geofencing after 3 attempts");
        }
      }

      await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify({
        geofences: geofences,
        location: userLocation,
        startedAt: now,
        nativeSupport: useNative,
        version: useNative ? '6.0.0-native-geofencing' : '5.0.0-expo-fallback',
      }));

      await AsyncStorage.setItem('active_geofences', JSON.stringify(geofences));
      await AsyncStorage.setItem('last_update', now);

      notifiedZones.current.clear();
      await AsyncStorage.removeItem(NOTIFIED_ZONES_KEY);

      setIsGeofencingActive(true);
      setActiveGeofences(geofences);
      setNativeSupport(useNative);
      setLastUpdate(now);
      lastZoneCheckLocation.current = userLocation;

      await startLocationMonitoring();

      // ✅ MANUAL TRIGGER: Check if already inside a zone on startup
      console.log('🔍 Checking if already inside a zone...');
      await checkZoneEntry(userLocation);

      console.log(`\n✅ Geofencing active! (${useNative ? 'NATIVE - works when killed' : 'EXPO - background only'})\n`);

      return {
        success: true,
        zonesCount: geofences.length,
        zones: nearbyZones,
        location: userLocation,
        nativeSupport: useNative,
      };

    } catch (error) {
      console.error('❌ Failed to start geofencing:', error);
      Alert.alert('Error', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
      isStartingRef.current = false;
    }
  }

  async function stopGeofencing() {
    try {
      console.log('🛑 Stopping geofencing...');

      // ✅ Stop native geofencing if it was used
      try {
        await NativeGeofenceService.removeGeofences();
      } catch (e) {
        console.log('ℹ️ No native geofencing to stop');
      }

      // ✅ Stop Expo geofencing and location refresh
      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        await Location.stopLocationUpdatesAsync(LOCATION_REFRESH_TASK_NAME);
      } catch (e) {
        console.log('ℹ️ No Expo tasks to stop');
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
      setNativeSupport(false);
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
      nativeSupport,
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
    nativeSupport,
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


// hooks/useGeofenceService.js - FIXED WITH IMPROVED GEOFENCE REGISTRATION
import { useState, useEffect, useRef } from 'react';
import { Platform, Alert, Linking, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { GEOFENCE_TASK_NAME, setupGeofenceNotificationChannels } from '../services/GeofenceManager';
import GeofenceNativeBridge from '../services/GeofenceNativeBridge';

const GEOFENCE_EVENTS_KEY = 'geofence_events';
const GEOFENCE_CONFIG_KEY = 'geofence_config';

export function useGeofenceService() {
  const [isGeofencingActive, setIsGeofencingActive] = useState(false);
  const [activeGeofences, setActiveGeofences] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [nativeSupport, setNativeSupport] = useState(false);
  
  const appStateRef = useRef(AppState.currentState);
  const locationUpdateInterval = useRef(null);

  // Initialize
  useEffect(() => {
    console.log('🚀 useGeofenceService - Initializing');
    
    const init = async () => {
      // Setup notification channels FIRST
      await setupGeofenceNotificationChannels();
      
      // Check native support
      const isNativeAvailable = GeofenceNativeBridge.isAvailable();
      setNativeSupport(isNativeAvailable);
      
      if (isNativeAvailable) {
        console.log('✅ Native geofencing module available');
        await syncNativeEvents();
      } else {
        console.log('ℹ️ Native geofencing not available - using Expo only');
      }
      
      // Load recent events
      await loadRecentEvents();
      
      // Restore previous state
      const config = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
      if (config) {
        const parsedConfig = JSON.parse(config);
        setIsGeofencingActive(true);
        setActiveGeofences(parsedConfig.geofences || []);
        setLastUpdate(parsedConfig.startedAt);
        console.log('ℹ️ Geofencing state restored - was active');
        
        // Start location updates
        startLocationUpdates();
      }
      
      // Get initial location
      await updateCurrentLocation();
    };
    
    init();
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
      if (locationUpdateInterval.current) {
        clearInterval(locationUpdateInterval.current);
      }
    };
  }, []);

  // Start automatic location updates
  const startLocationUpdates = () => {
    if (locationUpdateInterval.current) {
      clearInterval(locationUpdateInterval.current);
    }
    
    console.log('📍 Starting automatic location updates (every 5 seconds)');
    
    // Update immediately
    updateCurrentLocation();
    
    // Then update every 5 seconds
    locationUpdateInterval.current = setInterval(() => {
      updateCurrentLocation();
    }, 5000);
  };

  // Stop automatic location updates
  const stopLocationUpdates = () => {
    if (locationUpdateInterval.current) {
      clearInterval(locationUpdateInterval.current);
      locationUpdateInterval.current = null;
      console.log('🛑 Stopped automatic location updates');
    }
  };

  // Handle app state changes
  const handleAppStateChange = async (nextAppState) => {
    if (appStateRef.current !== 'active' && nextAppState === 'active') {
      console.log('📱 App became active - syncing state');
      
      if (nativeSupport) {
        await syncNativeEvents();
      }
      
      await loadRecentEvents();
      await updateCurrentLocation();
      
      // Resume location updates if geofencing is active
      if (isGeofencingActive) {
        startLocationUpdates();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      console.log('📱 App went to background');
      // Location updates continue in background via geofencing
    }
    
    appStateRef.current = nextAppState;
  };

  // Sync events from native storage
  async function syncNativeEvents() {
    try {
      const nativeEvents = await GeofenceNativeBridge.getStoredEvents();
      
      if (nativeEvents.length > 0) {
        console.log(`📥 Syncing ${nativeEvents.length} native events`);
        
        const existingEventsJson = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
        const existingEvents = existingEventsJson ? JSON.parse(existingEventsJson) : [];
        
        const existingTimestamps = new Set(existingEvents.map(e => e.timestamp));
        const newEvents = nativeEvents.filter(e => !existingTimestamps.has(e.timestamp));
        
        if (newEvents.length > 0) {
          const mergedEvents = [...existingEvents, ...newEvents];
          await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(mergedEvents.slice(-100)));
          
          console.log(`✅ Synced ${newEvents.length} new events from native`);
          
          const killedEvents = newEvents.filter(e => e.appKilled);
          if (killedEvents.length > 0) {
            setTimeout(() => {
              Alert.alert(
                '🎯 Zones Entered While App Was Closed!',
                `${killedEvents.length} zone entries detected:\n\n` +
                killedEvents.map(e => `• ${e.zone}`).join('\n'),
                [{ text: 'Awesome!' }]
              );
            }, 1000);
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Native sync warning:', error.message);
    }
  }

  // Load recent events
  async function loadRecentEvents() {
    try {
      const events = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
      if (events) {
        const allEvents = JSON.parse(events);
        const entryEvents = allEvents.filter(e => e.type === 'enter');
        entryEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRecentEvents(entryEvents.slice(0, 15));
        
        const killedEvents = entryEvents.filter(e => e.appKilled === true);
        console.log(`📊 Loaded ${entryEvents.length} events (${killedEvents.length} from killed state)`);
      }
    } catch (error) {
      console.log('⚠️ Failed to load events:', error.message);
    }
  }

  // Update current location
  async function updateCurrentLocation() {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 10000,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
      };

      setCurrentLocation(newLocation);
      await AsyncStorage.setItem('last_location', JSON.stringify(newLocation));
      
      // Calculate distances to active geofences
      if (activeGeofences.length > 0) {
        const geofencesWithDistance = activeGeofences.map(fence => ({
          ...fence,
          distance: calculateDistance(
            newLocation.latitude,
            newLocation.longitude,
            fence.latitude,
            fence.longitude
          ),
        }));
        
        setActiveGeofences(geofencesWithDistance);
      }
      
      return newLocation;
    } catch (error) {
      console.log('⚠️ Location update failed:', error.message);
      return null;
    }
  }

  // Start geofencing
  async function startGeofencing() {
    setLoading(true);
    
    try {
      console.log('\n🚀 Starting geofencing...');

      // 1. Check permissions
      let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        const { status: newFgStatus } = await Location.requestForegroundPermissionsAsync();
        fgStatus = newFgStatus;
      }
      
      if (fgStatus !== 'granted') {
        throw new Error('Foreground location permission denied');
      }

      // 2. Background permission
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
          '2. Select "Allow all the time"\n\n' +
          'Required for killed-state geofencing.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        throw new Error('Background permission required');
      }

      // 3. Ensure notification channels are set up
      await setupGeofenceNotificationChannels();

      // 4. Get current location
      console.log('📍 Getting current location...');
      const userLocation = await updateCurrentLocation();
      
      if (!userLocation) {
        throw new Error('Could not get current location');
      }

      // 5. Fetch nearby zones
      console.log('🔍 Fetching nearby zones...');
      const nearbyZones = await fetchNearbyZones(
        userLocation.latitude,
        userLocation.longitude,
        3000
      );

      if (nearbyZones.length === 0) {
        throw new Error('No zones found within 3km radius');
      }

      console.log(`✅ Found ${nearbyZones.length} zones`);

      // 6. Prepare geofences with proper configuration
      const geofences = nearbyZones.slice(0, 15).map(zone => ({
        identifier: zone.name || `zone_${zone.id}`,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radius: Math.max(zone.radius || 150, 100),
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      // 7. Stop any existing geofencing first
      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        console.log('🛑 Stopped existing geofencing');
      } catch (e) {
        // No existing task, that's fine
      }

      // 8. Start Expo geofencing
      console.log('📌 Starting Expo Location geofencing...');
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, geofences);
      console.log('✅ Expo geofencing started successfully');

      // 9. Register with native if available
      if (nativeSupport) {
        console.log('📌 Registering with native Android GeofencingClient...');
        try {
          await GeofenceNativeBridge.registerGeofences(geofences);
          console.log('✅ Native geofences registered');
        } catch (nativeError) {
          console.log('⚠️ Native registration failed:', nativeError.message);
        }
      }

      // 10. Save config
      const now = new Date().toISOString();
      
      await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify({
        geofences: geofences,
        location: userLocation,
        startedAt: now,
        nativeSupport: nativeSupport,
        version: '2.1.0',
      }));

      await AsyncStorage.setItem('active_geofences', JSON.stringify(geofences));
      await AsyncStorage.setItem('last_update', now);

      // 11. Update state
      setIsGeofencingActive(true);
      setActiveGeofences(geofences);
      setLastUpdate(now);

      // 12. Start automatic location updates
      startLocationUpdates();

      console.log('\n✅ Geofencing fully active!\n');

      return {
        success: true,
        zonesCount: geofences.length,
        zones: nearbyZones,
        location: userLocation,
        nativeSupport: nativeSupport,
      };

    } catch (error) {
      console.error('❌ Failed to start geofencing:', error);
      Alert.alert('Error', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }

  // Stop geofencing
  async function stopGeofencing() {
    try {
      console.log('🛑 Stopping geofencing...');
      
      // Stop Expo geofencing
      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        console.log('✅ Expo geofencing stopped');
      } catch (e) {
        console.log('ℹ️ No Expo geofencing to stop');
      }
      
      // Stop native geofencing
      if (nativeSupport) {
        await GeofenceNativeBridge.unregisterGeofences();
        console.log('✅ Native geofencing stopped');
      }
      
      // Stop location updates
      stopLocationUpdates();
      
      // Clear config
      await AsyncStorage.multiRemove([
        'active_geofences',
        GEOFENCE_CONFIG_KEY,
        'last_update',
      ]);
      
      setIsGeofencingActive(false);
      setActiveGeofences([]);
      
      console.log('✅ Geofencing completely stopped');
      return { success: true };
    } catch (error) {
      console.log('⚠️ Stop warning:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Fetch nearby zones
  async function fetchNearbyZones(lat, lng, radiusMeters = 3000) {
    try {
      console.log(`🔍 Fetching zones near: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      
      const { data, error } = await supabase.rpc('get_nearby_zones', {
        user_lat: lat,
        user_lng: lng,
        search_radius_meters: radiusMeters,
        max_results: 15,
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      console.log(`✅ Found ${data.length} zones`);
      return data.map(zone => ({
        ...zone,
        radius: Math.max(zone.radius || 150, 100),
      }));

    } catch (error) {
      console.error('❌ Failed to fetch zones:', error);
      throw new Error(`Failed to fetch zones: ${error.message}`);
    }
  }

  // Refresh geofences
  async function refreshGeofences() {
    if (!isGeofencingActive) {
      return { success: false, error: 'Geofencing not active' };
    }

    try {
      const userLocation = await updateCurrentLocation();
      if (!userLocation) {
        return { success: false, error: 'Could not get location' };
      }

      const nearbyZones = await fetchNearbyZones(
        userLocation.latitude,
        userLocation.longitude,
        3000
      );

      const geofences = nearbyZones.slice(0, 15).map(zone => ({
        identifier: zone.name || `zone_${zone.id}`,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radius: Math.max(zone.radius || 150, 100),
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      // Restart geofencing with new zones
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, geofences);

      if (nativeSupport) {
        await GeofenceNativeBridge.unregisterGeofences();
        await GeofenceNativeBridge.registerGeofences(geofences);
      }

      await AsyncStorage.setItem('active_geofences', JSON.stringify(geofences));
      setActiveGeofences(geofences);

      console.log('✅ Geofences refreshed');
      return { success: true, zonesCount: geofences.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Clear event history
  async function clearEventHistory() {
    try {
      await AsyncStorage.removeItem(GEOFENCE_EVENTS_KEY);
      
      if (nativeSupport) {
        await GeofenceNativeBridge.clearStoredEvents();
      }
      
      setRecentEvents([]);
      console.log('✅ Event history cleared');
      return true;
    } catch (error) {
      console.log('⚠️ Clear failed:', error.message);
      return false;
    }
  }

  // Get stats
  function getGeofenceStats() {
    const killedEvents = recentEvents.filter(e => e.appKilled === true);
    const nativeEvents = recentEvents.filter(e => e.nativeHandler === true);
    
    let nearestZone = null;
    if (currentLocation && activeGeofences.length > 0) {
      const sorted = [...activeGeofences].sort((a, b) => {
        const distA = a.distance || calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          a.latitude,
          a.longitude
        );
        const distB = b.distance || calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          b.latitude,
          b.longitude
        );
        return distA - distB;
      });
      
      if (sorted[0]) {
        nearestZone = {
          identifier: sorted[0].identifier,
          distance: sorted[0].distance || calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            sorted[0].latitude,
            sorted[0].longitude
          ),
        };
      }
    }
    
    return {
      isActive: isGeofencingActive,
      nativeSupport,
      zonesCount: activeGeofences.length,
      location: currentLocation,
      lastUpdate: lastUpdate,
      recentEvents: recentEvents,
      recentEventsCount: recentEvents.length,
      killedEventsCount: killedEvents.length,
      nativeEventsCount: nativeEvents.length,
      nearestZone,
    };
  }

  // Calculate distance in meters
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  return {
    // State
    isGeofencingActive,
    activeGeofences,
    currentLocation,
    loading,
    lastUpdate,
    recentEvents,
    nativeSupport,
    
    // Actions
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
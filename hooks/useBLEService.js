// hooks/useBLEService.js - WITH REAL-TIME FRIEND DETECTION
import { useState, useEffect, useCallback, useRef } from "react";
import { Platform, PermissionsAndroid, Alert, AppState, Linking } from "react-native";
import { supabase } from "../lib/supabase";
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  rssiToDistance, 
  getProximityLevel, 
  BLE_DEFAULTS,
  generateBLEIdentifier
} from "../lib/bleutils";

// Safely import BLE Manager
let BleManager = null;
let bleManager = null;

try {
  const BleModule = require('react-native-ble-plx');
  BleManager = BleModule.BleManager;
  bleManager = new BleManager();
  console.log("✅ BLE Manager loaded successfully");
} catch (error) {
  console.warn("⚠️ BLE Manager not available:", error.message);
}

// NOTIFICATION CONFIGURATION
const NOTIFICATION_COOLDOWN = 120000; // 2 minutes between notifications per friend
const FINGERPRINT_MAX_AGE = 300000; // 5 minutes (300s) - more lenient than before

/**
 * Check if we already notified about this friend recently
 */
async function wasNotifiedRecently(userId, friendId) {
  try {
    const key = `ble_notif_${userId}_${friendId}`;
    const lastNotified = await AsyncStorage.getItem(key);
    
    if (!lastNotified) return false;
    
    const timeSince = Date.now() - parseInt(lastNotified, 10);
    return timeSince < NOTIFICATION_COOLDOWN;
  } catch (error) {
    console.error('❌ Error checking notification cooldown:', error);
    return false;
  }
}

/**
 * Mark that we sent a notification for this friend
 */
async function markNotificationSent(userId, friendId) {
  try {
    const key = `ble_notif_${userId}_${friendId}`;
    await AsyncStorage.setItem(key, Date.now().toString());
  } catch (error) {
    console.error('❌ Error saving notification timestamp:', error);
  }
}

/**
 * Send notification when friend is detected
 */
async function sendFriendDetectedNotification(friend, userId) {
  try {
    // Check cooldown
    const notifiedRecently = await wasNotifiedRecently(userId, friend.id);
    if (notifiedRecently) {
      console.log(`  ⏰ Already notified about ${friend.name} recently`);
      return;
    }

    const distance = friend.distance ? Math.round(friend.distance) : 'nearby';
    const proximity = friend.proximity || 'near';

    console.log(`📲 Sending notification: ${friend.name} detected at ${distance}m`);

    // Send notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📡 Friend Detected!',
        body: `${friend.name} is ${distance}m away via Bluetooth!`,
        data: { 
          friendId: friend.id,
          type: 'ble_friend_detected',
          distance: distance,
          rssi: friend.rssi,
          proximity: proximity,
          timestamp: Date.now(),
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        badge: 1,
        ...(Platform.OS === 'android' && {
          channelId: 'ble-proximity-alerts',
        }),
      },
      trigger: null,
    });

    console.log(`  ✅ Notification sent for ${friend.name}`);

    // Mark as sent
    await markNotificationSent(userId, friend.id);

    // Log to database
    supabase
      .from('proximity_notifications')
      .insert({
        user_id: userId,
        friend_id: friend.id,
        distance_meters: typeof distance === 'number' ? distance : null,
        detection_method: 'ble',
        rssi: friend.rssi,
        notified_at: new Date().toISOString(),
      })
      .then(() => console.log('  📝 Logged to database'))
      .catch(err => console.error('  ⚠️ Database log failed:', err.message));

  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}

/**
 * Calculate fingerprint similarity for friend detection
 */
function calculateFingerprintSimilarity(myDevices, friendDevices) {
  if (!myDevices || !friendDevices || myDevices.length === 0 || friendDevices.length === 0) {
    return 0;
  }

  const myMacs = new Set(myDevices.map(d => d.id.toLowerCase()));
  const friendMacs = new Set(friendDevices.map(d => d.id.toLowerCase()));
  
  const overlap = [...myMacs].filter(mac => friendMacs.has(mac));
  
  if (overlap.length === 0) {
    return 0;
  }

  let totalScore = 0;

  for (const mac of overlap) {
    const myDevice = myDevices.find(d => d.id.toLowerCase() === mac);
    const friendDevice = friendDevices.find(d => d.id.toLowerCase() === mac);
    
    if (myDevice && friendDevice) {
      const avgRssi = (myDevice.rssi + friendDevice.rssi) / 2;
      const rssiScore = Math.max(0, 100 + avgRssi);
      totalScore += rssiScore;
    }
  }

  const avgScore = totalScore / overlap.length;
  const overlapBonus = Math.min(overlap.length * 15, 50);
  const finalScore = Math.min(100, avgScore + overlapBonus);
  
  return finalScore;
}

/**
 * Check for nearby friends and send notifications
 * NOW ALSO RETURNS DETECTED FRIENDS FOR IMMEDIATE UI UPDATE
 */
async function checkAndNotifyNearbyFriends(nearbyDevices, userId, onFriendDetected) {
  try {
    if (!nearbyDevices || nearbyDevices.size === 0) {
      // Clear friends if no devices
      if (onFriendDetected) {
        onFriendDetected([]);
      }
      return [];
    }

    const myDevices = Array.from(nearbyDevices.values());

    // Get friendships
    const { data: friendships, error: friendshipError } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendshipError || !friendships || friendships.length === 0) {
      if (onFriendDetected) {
        onFriendDetected([]);
      }
      return [];
    }

    const friendIds = friendships.map(f => 
      f.user_id === userId ? f.friend_id : f.user_id
    );

    // Get friend profiles with active BLE
    const { data: friendProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, ble_device_id, ble_active, ble_fingerprint, ble_fingerprint_updated, proximity_notifications_enabled')
      .in('id', friendIds)
      .eq('ble_active', true);

    if (profileError || !friendProfiles || friendProfiles.length === 0) {
      if (onFriendDetected) {
        onFriendDetected([]);
      }
      return [];
    }

    const detectedFriends = [];

    // Check each friend
    for (const friend of friendProfiles) {
      try {
        // Skip if fingerprint is missing or empty
        if (!friend.ble_fingerprint || friend.ble_fingerprint.trim() === '' || friend.ble_fingerprint === '[]') {
          continue;
        }

        const friendDevices = JSON.parse(friend.ble_fingerprint);
        
        if (!Array.isArray(friendDevices) || friendDevices.length === 0) {
          continue;
        }

        // Check fingerprint age (should be recent - within 5 minutes)
        if (friend.ble_fingerprint_updated) {
          const age = Date.now() - new Date(friend.ble_fingerprint_updated).getTime();
          const ageInSeconds = Math.round(age / 1000);
          
          if (age > FINGERPRINT_MAX_AGE) {
            console.log(`  ⏭️ Skipping ${friend.name} - fingerprint too old (${ageInSeconds}s)`);
            continue; // Fingerprint too old
          } else {
            console.log(`  ✅ ${friend.name} fingerprint age: ${ageInSeconds}s (within ${FINGERPRINT_MAX_AGE/1000}s limit)`);
          }
        }

        // Calculate similarity
        const similarity = calculateFingerprintSimilarity(myDevices, friendDevices);
        
        // Threshold for detection (25% for testing)
        if (similarity < 25) {
          continue;
        }

        // Find common devices for distance estimation
        const myMacs = new Set(myDevices.map(d => d.id.toLowerCase()));
        const commonDevices = friendDevices.filter(d => myMacs.has(d.id.toLowerCase()));
        
        if (commonDevices.length === 0) {
          continue;
        }

        // Get best RSSI from common devices
        let bestRssi = -100;
        const strongestCommon = commonDevices.reduce((best, current) => 
          current.rssi > best.rssi ? current : best
        );
        
        const myDevice = myDevices.find(d => d.id.toLowerCase() === strongestCommon.id.toLowerCase());
        if (myDevice) {
          bestRssi = Math.round((strongestCommon.rssi + myDevice.rssi) / 2);
        } else {
          bestRssi = strongestCommon.rssi;
        }
        
        const estimatedDistance = rssiToDistance(bestRssi);
        const proximity = bestRssi >= -60 ? 'immediate' : bestRssi >= -80 ? 'near' : 'far';

        console.log(`✅ FRIEND DETECTED: ${friend.name} - ${Math.round(estimatedDistance)}m (${similarity.toFixed(1)}% match)`);

        const detectedFriend = {
          id: friend.id,
          name: friend.name,
          distance: estimatedDistance,
          rssi: bestRssi,
          proximity: proximity,
          similarity: Math.round(similarity),
          commonDevices: commonDevices.length,
          detectedAt: Date.now(),
        };

        // Add to detected friends list
        detectedFriends.push(detectedFriend);

        // Send notification (respects cooldown internally)
        await sendFriendDetectedNotification(detectedFriend, userId);

      } catch (err) {
        console.error(`❌ Error processing friend ${friend.name}:`, err);
      }
    }

    // Update UI immediately with detected friends
    if (onFriendDetected) {
      console.log(`🔄 Updating UI with ${detectedFriends.length} detected friends`);
      onFriendDetected(detectedFriends);
    }

    return detectedFriends;

  } catch (error) {
    console.error('❌ Error checking nearby friends for notifications:', error);
    if (onFriendDetected) {
      onFriendDetected([]);
    }
    return [];
  }
}

const checkBluetoothState = async () => {
  if (!bleManager) return false;
  try {
    const state = await bleManager.state();
    return state === 'PoweredOn';
  } catch (error) {
    console.error("❌ Error checking Bluetooth state:", error);
    return false;
  }
};

const requestBLEPermissions = async () => {
  if (Platform.OS !== 'android') return true;

  try {
    const androidVersion = Platform.Version;
    console.log(`📱 Android version: ${androidVersion}`);

    if (androidVersion >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);
      return Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );
    }
  } catch (err) {
    console.error("❌ BLE Permission request error:", err);
    return false;
  }
};

export const useBleService = (options = {}) => {
  const {
    updateInterval = 15000,
    autoStart = false,
    scanDuration = 8000,
  } = options;

  const [nearbyDevices, setNearbyDevices] = useState(new Map());
  const [detectedFriends, setDetectedFriends] = useState([]); // NEW: Real-time friend detection
  const [isScanning, setIsScanning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [bleEnabled, setBleEnabled] = useState(false);
  const [myBleId, setMyBleId] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [bleAvailable, setBleAvailable] = useState(bleManager !== null);
  
  const scanIntervalRef = useRef(null);
  const rssiHistoryRef = useRef(new Map());
  const appStateRef = useRef(AppState.currentState);
  const isInitialized = useRef(false);
  const bleStateSubscription = useRef(null);
  const lastFingerprintUpdate = useRef(0);

  useEffect(() => {
    if (!bleManager) {
      setError("BLE library not available. Please rebuild your dev build.");
      setBleAvailable(false);
    } else {
      setBleAvailable(true);
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    if (!bleManager) {
      setError("BLE not available");
      return { bleEnabled: false, hasPermission: false };
    }
    
    setIsCheckingPermissions(true);
    
    try {
      const btEnabled = await checkBluetoothState();
      setBleEnabled(btEnabled);

      if (!btEnabled) {
        setError("Bluetooth is OFF");
        setHasPermission(false);
        return { bleEnabled: false, hasPermission: false };
      }

      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version;
        
        if (androidVersion >= 31) {
          const scanGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
          );
          const connectGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
          const locationGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          const allGranted = scanGranted && connectGranted && locationGranted;
          setHasPermission(allGranted);
          
          if (!allGranted) {
            setError("Missing Bluetooth permissions");
          } else {
            setError(null);
          }

          return { bleEnabled: btEnabled, hasPermission: allGranted };
        } else {
          const locationGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          setHasPermission(locationGranted);
          
          if (!locationGranted) {
            setError("Missing Location permission");
          } else {
            setError(null);
          }

          return { bleEnabled: btEnabled, hasPermission: locationGranted };
        }
      } else {
        setHasPermission(btEnabled);
        if (btEnabled) {
          setError(null);
        }
        return { bleEnabled: btEnabled, hasPermission: btEnabled };
      }
    } catch (error) {
      console.error("❌ Error checking permissions:", error);
      setError(error.message);
      return { bleEnabled: false, hasPermission: false };
    } finally {
      setIsCheckingPermissions(false);
    }
  }, []);

  const initializeBLE = useCallback(async () => {
    if (!bleManager) {
      setError("BLE not supported - rebuild required");
      return false;
    }
    
    try {
      console.log("🔵 Initializing BLE Manager...");
      
      const { bleEnabled: btOn, hasPermission: permsOk } = await checkPermissions();
      
      if (!btOn || !permsOk) {
        return false;
      }
      
      const state = await bleManager.state();
      const enabled = state === 'PoweredOn';
      setBleEnabled(enabled);
      
      console.log("✅ BLE initialized successfully");
      isInitialized.current = true;
      return true;
    } catch (error) {
      console.error('❌ BLE initialization error:', error);
      setError(error.message);
      return false;
    }
  }, [checkPermissions]);

  const subscribeToBluetoothState = useCallback(() => {
    if (!bleManager) return;
    
    if (bleStateSubscription.current) {
      bleStateSubscription.current.remove();
    }

    bleStateSubscription.current = bleManager.onStateChange((state) => {
      console.log("📡 Bluetooth state changed:", state);
      const enabled = state === 'PoweredOn';
      setBleEnabled(enabled);
      
      if (!enabled && isScanning) {
        console.log("⚠️ Bluetooth turned off, stopping scan");
        stopTracking();
      }
    }, true);
  }, [isScanning]);

  const handleDeviceDiscovered = useCallback((device) => {
    try {
      const { id, name, rssi } = device;
      
      if (!id || rssi === null || rssi === undefined) {
        return;
      }
      
      if (rssi < BLE_DEFAULTS.MIN_RSSI_THRESHOLD) {
        return;
      }
      
      const history = rssiHistoryRef.current.get(id) || [];
      history.push(rssi);
      
      if (history.length > BLE_DEFAULTS.RSSI_SAMPLE_SIZE) {
        history.shift();
      }
      rssiHistoryRef.current.set(id, history);
      
      const avgRssi = history.reduce((sum, val) => sum + val, 0) / history.length;
      const smoothedRssi = Math.round(avgRssi);
      
      const distance = rssiToDistance(smoothedRssi);
      const proximity = getProximityLevel(smoothedRssi);
      
      setNearbyDevices(prev => {
        const updated = new Map(prev);
        updated.set(id, {
          id,
          name: name || 'Unknown Device',
          rssi: smoothedRssi,
          rawRssi: rssi,
          distance,
          proximity,
          lastSeen: Date.now(),
          rssiHistory: [...history]
        });
        return updated;
      });
    } catch (err) {
      console.error("❌ Error processing device:", err);
    }
  }, []);

  const updateBLEFingerprint = useCallback(async (userId, devices) => {
    try {
      const now = Date.now();
      if (now - lastFingerprintUpdate.current < 3000) {
        console.log("⏭️ Skipping fingerprint update (too soon)");
        return;
      }
      lastFingerprintUpdate.current = now;

      const allDevices = Array.from(devices.values())
        .filter(d => d.rssi >= -100)
        .sort((a, b) => b.rssi - a.rssi)
        .slice(0, 20)
        .map(d => ({
          id: d.id,
          rssi: d.rssi,
          name: d.name
        }));

      if (allDevices.length === 0) {
        console.log("⚠️ No devices to update in fingerprint");
        return;
      }

      console.log(`📍 Updating BLE fingerprint with ${allDevices.length} devices`);

      const { error } = await supabase
        .from('profiles')
        .update({
          ble_last_seen: new Date().toISOString(),
          ble_active: true,
          ble_fingerprint: JSON.stringify(allDevices),
          ble_fingerprint_updated: new Date().toISOString(),
        })
        .eq('id', userId);
      
      if (error) {
        console.error("❌ Database update error:", error);
      } else {
        console.log("✅ BLE fingerprint updated successfully");
      }
    } catch (error) {
      console.error('❌ Error updating BLE fingerprint:', error);
    }
  }, []);

  // NEW: Callback to update detected friends in state
  const handleFriendDetected = useCallback((friends) => {
    console.log(`🎯 UI UPDATE: ${friends.length} friends detected`);
    setDetectedFriends(friends);
  }, []);

  const performBLEScan = useCallback(async () => {
    if (!bleManager) {
      console.warn("⚠️ BLE not available");
      return;
    }
    
    const { bleEnabled: btOn, hasPermission: permsOk } = await checkPermissions();
    
    if (!btOn || !permsOk) {
      return;
    }

    if (!isInitialized.current) {
      const initialized = await initializeBLE();
      if (!initialized) {
        return;
      }
    }

    try {
      console.log("\n📡 Starting BLE scan...");
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log("⚠️ No authenticated user");
        return;
      }

      setIsScanning(true);
      setError(null);

      await bleManager.stopDeviceScan();

      console.log("📡 Scanning for BLE devices...");

      bleManager.startDeviceScan(
        null,
        {
          allowDuplicates: true,
          scanMode: Platform.OS === 'android' ? 2 : undefined,
        },
        (error, device) => {
          if (error) {
            console.error("❌ Scan error:", error.message);
            setError(error.message);
            return;
          }

          if (device) {
            handleDeviceDiscovered({
              id: device.id,
              name: device.name || device.localName,
              rssi: device.rssi
            });
          }
        }
      );

      setTimeout(async () => {
        try {
          await bleManager.stopDeviceScan();
          setIsScanning(false);
          setLastUpdate(new Date());
          
          const deviceCount = nearbyDevices.size;
          console.log(`✅ Scan completed. Found ${deviceCount} devices`);
          
          // Update fingerprint
          await updateBLEFingerprint(user.id, nearbyDevices);
          
          // Check for nearby friends and IMMEDIATELY update UI
          await checkAndNotifyNearbyFriends(nearbyDevices, user.id, handleFriendDetected);
          
          setDebugInfo(prev => ({
            ...prev,
            lastScanEnd: new Date().toISOString(),
            devicesFound: deviceCount
          }));
        } catch (err) {
          console.error("❌ Error stopping scan:", err);
        }
      }, scanDuration);
      
    } catch (err) {
      console.error("❌ BLE scan error:", err);
      setError(err.message);
      setIsScanning(false);
    }
  }, [scanDuration, handleDeviceDiscovered, nearbyDevices, checkPermissions, initializeBLE, updateBLEFingerprint, handleFriendDetected]);

  const startTracking = useCallback(async () => {
    if (!bleManager) {
      Alert.alert(
        "BLE Not Available",
        "Please rebuild your dev build with BLE support.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    try {
      console.log("🚀 Starting BLE tracking...");
      
      const { bleEnabled: btOn, hasPermission: permsOk } = await checkPermissions();
      
      if (!btOn) {
        Alert.alert(
          "Bluetooth Disabled",
          "Please enable Bluetooth in your device settings.",
          [{ text: "OK" }]
        );
        return false;
      }

      if (!permsOk) {
        console.log("❌ Requesting permissions...");
        const granted = await requestBLEPermissions();
        if (!granted) {
          return false;
        }
        await checkPermissions();
      }

      const bleReady = await initializeBLE();
      if (!bleReady) {
        return false;
      }

      subscribeToBluetoothState();

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const bleId = generateBLEIdentifier(user.id);
        setMyBleId(bleId);
        
        await supabase
          .from('profiles')
          .update({
            ble_device_id: bleId,
            ble_active: true,
            ble_last_seen: new Date().toISOString(),
          })
          .eq('id', user.id);

        console.log(`📱 My BLE ID: ${bleId}`);
      }

      // Start first scan immediately
      await performBLEScan();

      // Then continue periodic scans
      scanIntervalRef.current = setInterval(async () => {
        if (appStateRef.current === 'active') {
          console.log("🔄 Periodic scan");
          await performBLEScan();
        }
      }, updateInterval);

      console.log(`✅ BLE tracking started (${updateInterval/1000}s intervals)`);
      return true;
    } catch (err) {
      console.error("❌ Error starting tracking:", err);
      setError(err.message);
      return false;
    }
  }, [initializeBLE, performBLEScan, updateInterval, checkPermissions, subscribeToBluetoothState]);

  const stopTracking = useCallback(async () => {
    console.log("⏹️ Stopping BLE tracking...");
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (bleStateSubscription.current) {
      bleStateSubscription.current.remove();
      bleStateSubscription.current = null;
    }

    if (bleManager) {
      try {
        await bleManager.stopDeviceScan();
      } catch (err) {
        console.log("⚠️ Error stopping scan:", err);
      }
    }

    setIsScanning(false);
    setDetectedFriends([]); // Clear detected friends

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({
          ble_active: false,
          ble_last_seen: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    setMyBleId(null);
    setNearbyDevices(new Map());
    rssiHistoryRef.current.clear();
    isInitialized.current = false;
  }, []);

  const refreshLocation = useCallback(async () => {
    console.log("🔄 Manual refresh");
    await performBLEScan();
  }, [performBLEScan]);

  const getCurrentLocation = useCallback(() => {
    return {
      ble_active: bleEnabled && nearbyDevices.size > 0,
      nearby_devices: nearbyDevices.size,
      nearbyDevices: Array.from(nearbyDevices.values()),
      timestamp: new Date().toISOString()
    };
  }, [bleEnabled, nearbyDevices]);

  const cleanupStaleDevices = useCallback(() => {
    const now = Date.now();
    const staleThreshold = 30000;
    
    setNearbyDevices(prev => {
      const updated = new Map(prev);
      let removedCount = 0;
      
      for (const [id, device] of updated.entries()) {
        if (now - device.lastSeen > staleThreshold) {
          updated.delete(id);
          rssiHistoryRef.current.delete(id);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        console.log(`🧹 Cleaned ${removedCount} stale devices`);
      }
      
      return updated;
    });

    // Also cleanup stale detected friends
    setDetectedFriends(prev => {
      const updated = prev.filter(friend => {
        const age = now - friend.detectedAt;
        return age < 60000; // Keep friends detected in last 60 seconds
      });
      
      if (updated.length !== prev.length) {
        console.log(`🧹 Cleaned ${prev.length - updated.length} stale detected friends`);
      }
      
      return updated;
    });
  }, []);

  const handleAppStateChange = useCallback((nextAppState) => {
    console.log("📱 App state:", appStateRef.current, "->", nextAppState);
    
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      if (scanIntervalRef.current && isInitialized.current) {
        console.log("🔄 App resumed");
        checkPermissions().then(() => performBLEScan());
      }
    }
    
    appStateRef.current = nextAppState;
  }, [performBLEScan, checkPermissions]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [handleAppStateChange]);

  useEffect(() => {
    const cleanupInterval = setInterval(cleanupStaleDevices, 10000);
    return () => clearInterval(cleanupInterval);
  }, [cleanupStaleDevices]);

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        stopTracking();
      }
      if (bleStateSubscription.current) {
        bleStateSubscription.current.remove();
      }
    };
  }, [stopTracking]);

  const isLocationStale = useCallback(() => {
    if (!lastUpdate) return true;
    const staleThreshold = updateInterval * 2;
    return Date.now() - lastUpdate.getTime() > staleThreshold;
  }, [lastUpdate, updateInterval]);

  return {
    location: getCurrentLocation(),
    isTracking: isScanning || scanIntervalRef.current !== null,
    lastUpdate,
    error,
    debugInfo: {
      ...debugInfo,
      nearbyDevices: nearbyDevices.size,
      bleEnabled,
      hasPermission,
      myBleId,
      isInitialized: isInitialized.current,
      isCheckingPermissions,
      bleAvailable,
      detectedFriends: detectedFriends.length, // NEW
    },
    
    nearbyDevices: Array.from(nearbyDevices.values()),
    detectedFriends, // NEW: Export detected friends for UI
    hasPermission,
    bleEnabled,
    bleAvailable,
    myBleId,
    isScanning,
    
    startTracking,
    stopTracking,
    refreshLocation,
    getCurrentLocation,
    isLocationStale,
    checkPermissions,
  };
};
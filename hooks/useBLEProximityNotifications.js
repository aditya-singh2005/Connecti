// hooks/useBLEProximityNotifications.js - OPTIMIZED FOR TESTING
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isWithinProximity } from '../lib/bleutils';

const PROXIMITY_RSSI_THRESHOLD = -100; // VERY LENIENT for testing (~50m)
const NOTIFICATION_COOLDOWN = 120000; // 2 minutes for testing (was 10 min)
const CHECK_INTERVAL = 10000; // 10 seconds for testing (was 20 sec)

console.log('⚙️ BLE Proximity notifications loaded');

/**
 * Configure notification handler
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

/**
 * Setup Android notification channel
 */
async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('ble-proximity-alerts', {
        name: 'BLE Friend Proximity Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
      console.log('✅ BLE notification channel created');
    } catch (error) {
      console.error('❌ Error creating notification channel:', error);
    }
  }
}

setupNotificationChannel();

/**
 * Check if notification was sent recently
 */
async function wasNotifiedRecently(userId, friendId) {
  try {
    const key = `ble_notif_${userId}_${friendId}`;
    const lastNotified = await AsyncStorage.getItem(key);
    
    if (!lastNotified) return false;
    
    const timeSinceNotification = Date.now() - parseInt(lastNotified, 10);
    const wasRecent = timeSinceNotification < NOTIFICATION_COOLDOWN;
    
    if (wasRecent) {
      const minutesAgo = Math.floor(timeSinceNotification / 60000);
      console.log(`  ⏰ Notified ${minutesAgo}m ago (cooldown: ${NOTIFICATION_COOLDOWN/60000}m)`);
    }
    
    return wasRecent;
  } catch (error) {
    console.error('❌ Error checking notification history:', error);
    return false;
  }
}

/**
 * Mark notification as sent
 */
async function markNotificationSent(userId, friendId) {
  try {
    const key = `ble_notif_${userId}_${friendId}`;
    await AsyncStorage.setItem(key, Date.now().toString());
    console.log(`📝 Marked notification sent for ${friendId}`);
  } catch (error) {
    console.error('❌ Error saving notification history:', error);
  }
}

/**
 * Register for push notifications
 */
async function registerForPushNotificationsAsync() {
  try {
    if (Platform.OS === 'android') {
      await setupNotificationChannel();
    }

    if (!Device.isDevice) {
      console.log('⚠️ Simulator - using local notifications');
      return 'simulator-mode';
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('❌ Notification permission denied');
      return 'permission-denied';
    }

    console.log('✅ Notification permissions granted');
    return 'local-only-mode';
    
  } catch (error) {
    console.error('❌ Error in registerForPushNotificationsAsync:', error.message);
    return 'error-fallback';
  }
}

/**
 * Send proximity notification
 */
async function sendBLEProximityNotification(friend, userId) {
  try {
    console.log(`📤 Sending notification for ${friend.name}...`);
    
    // Check cooldown
    const notifiedRecently = await wasNotifiedRecently(userId, friend.id);
    if (notifiedRecently) {
      console.log(`  ⏰ Cooldown active for ${friend.name}`);
      return;
    }

    const distance = friend.distance ? Math.round(friend.distance) : 'nearby';
    const proximity = friend.proximity || 'near';

    console.log(`  📍 ${friend.name} is ${distance}m away (${proximity})`);

    // Send notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📡 Friend Detected Nearby!',
        body: `${friend.name} is ${distance}m away via Bluetooth!`,
        data: { 
          friendId: friend.id,
          type: 'ble_proximity',
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

    console.log(`  ✅ Notification sent! ID: ${notificationId}`);

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
 * Check for nearby friends using BLE data
 */
async function checkNearbyFriendsBLE(bleState, userId = null) {
  try {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🔍 [${timestamp}] Checking nearby friends via BLE...`);
    
    // Get user ID
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('❌ No authenticated user');
        return;
      }
      currentUserId = user.id;
    }

    if (!bleState || !bleState.ble_active) {
      console.log('⚠️ BLE not active');
      return;
    }

    const nearbyDevices = bleState.nearbyDevices || [];
    
    if (nearbyDevices.length === 0) {
      console.log('📡 No BLE devices detected');
      return;
    }

    console.log(`📡 Detected ${nearbyDevices.length} BLE devices`);

    // Get friendships
    const { data: friendships, error: friendError } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
      .eq('status', 'accepted');

    if (friendError) {
      console.error('❌ Error fetching friendships:', friendError.message);
      return;
    }

    if (!friendships || friendships.length === 0) {
      console.log('👥 No friends found');
      return;
    }

    const friendIds = friendships.map(f => 
      f.user_id === currentUserId ? f.friend_id : f.user_id
    );

    console.log(`👥 Checking ${friendIds.length} friends`);

    // Get friend profiles with BLE data
    const { data: friendProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, ble_device_id, ble_active')
      .in('id', friendIds)
      .eq('ble_active', true)
      .not('ble_device_id', 'is', null);

    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError.message);
      return;
    }

    if (!friendProfiles || friendProfiles.length === 0) {
      console.log('📱 No friends with active BLE');
      return;
    }

    console.log(`📱 ${friendProfiles.length} friends with BLE active`);

    // Match friends with detected devices using improved logic
    const nearbyFriends = [];
    
    for (const friend of friendProfiles) {
      let matchedDevice = null;
      
      for (const device of nearbyDevices) {
        const deviceId = device.id || '';
        const deviceName = device.name || '';
        const friendBleId = friend.ble_device_id || '';
        
        // Try multiple matching strategies
        if (deviceId === friendBleId ||
            deviceId.toLowerCase() === friendBleId.toLowerCase() ||
            (deviceName && friendBleId && deviceName.toLowerCase().includes(friendBleId.toLowerCase())) ||
            (deviceId && friendBleId && deviceId.toLowerCase().includes(friendBleId.toLowerCase())) ||
            (friendBleId.startsWith('BLE_') && deviceId.toLowerCase().includes(friendBleId.substring(4).toLowerCase()))) {
          matchedDevice = device;
          break;
        }
      }

      if (!matchedDevice) {
        continue;
      }

      // Check proximity with lenient threshold
      if (!isWithinProximity(matchedDevice.rssi, PROXIMITY_RSSI_THRESHOLD)) {
        console.log(`  ⚠️ ${friend.name} signal too weak (${matchedDevice.rssi} dBm)`);
        continue;
      }

      nearbyFriends.push({
        ...friend,
        rssi: matchedDevice.rssi,
        distance: matchedDevice.distance,
        proximity: matchedDevice.proximity,
        lastSeen: matchedDevice.lastSeen,
      });
    }

    if (nearbyFriends.length > 0) {
      console.log(`✨ Found ${nearbyFriends.length} nearby friends:`);
      nearbyFriends.forEach(f => {
        console.log(`  - ${f.name}: ${Math.round(f.distance)}m (RSSI: ${f.rssi})`);
      });

      // Send notifications
      for (const friend of nearbyFriends) {
        await sendBLEProximityNotification(friend, currentUserId);
      }
    } else {
      console.log('😔 No friends within proximity threshold');
    }

  } catch (error) {
    console.error('❌ Error in checkNearbyFriendsBLE:', error);
  }
}

/**
 * BLE Proximity Notifications Hook
 */
export function useBleProximityNotifications() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const checkIntervalRef = useRef(null);

  /**
   * Request permissions
   */
  const requestPermissions = useCallback(async () => {
    try {
      console.log('🔐 Requesting permissions...');

      const token = await registerForPushNotificationsAsync();
      setPushToken(token);

      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      
      const granted = notifStatus === 'granted';
      setHasPermissions(granted);
      
      console.log('✅ Permission status:', notifStatus);
      
      return granted;
    } catch (error) {
      console.error('❌ Error requesting permissions:', error);
      return false;
    }
  }, []);

  /**
   * Enable proximity notifications
   */
  const enableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🚀 Enabling proximity notifications...');

      // Request permissions
      const hasPerms = await requestPermissions();
      if (!hasPerms) {
        alert('❌ Notification permission required');
        setIsLoading(false);
        return false;
      }

      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('❌ Must be logged in');
        setIsLoading(false);
        return false;
      }

      // Update database
      await supabase
        .from('profiles')
        .update({ 
          proximity_notifications_enabled: true,
          expo_push_token: pushToken,
        })
        .eq('id', user.id);

      setIsEnabled(true);
      setIsLoading(false);
      
      alert('✅ Proximity Alerts Enabled!\n\nYou\'ll be notified when friends are nearby via Bluetooth (cooldown: 2 minutes).');
      return true;
    } catch (error) {
      console.error('❌ Error enabling:', error);
      alert(`Failed: ${error.message}`);
      setIsLoading(false);
      return false;
    }
  }, [requestPermissions, pushToken]);

  /**
   * Disable proximity notifications
   */
  const disableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🛑 Disabling proximity notifications...');

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ proximity_notifications_enabled: false })
          .eq('id', user.id);
      }

      setIsEnabled(false);
      setIsLoading(false);
      alert('✅ Proximity Alerts Disabled');
      return true;
    } catch (error) {
      console.error('❌ Error disabling:', error);
      setIsLoading(false);
      return false;
    }
  }, []);

  /**
   * Manual check
   */
  const checkNow = useCallback(async (bleState) => {
    try {
      console.log('🔍 Manual check...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('❌ Must be logged in');
        return;
      }
      
      await checkNearbyFriendsBLE(bleState, user.id);
      alert('✅ Check complete!');
    } catch (error) {
      console.error('❌ Error:', error);
      alert(`Failed: ${error.message}`);
    }
  }, []);

  /**
   * Check status on mount
   */
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('proximity_notifications_enabled, expo_push_token')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.proximity_notifications_enabled) {
            setIsEnabled(true);
          }
          
          if (profile?.expo_push_token) {
            setPushToken(profile.expo_push_token);
          }
        }

        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        setHasPermissions(notifStatus === 'granted');
        
        console.log('📊 Status:', {
          notifications: notifStatus,
          enabled: isEnabled
        });
      } catch (error) {
        console.error('❌ Error checking status:', error);
      }
    };

    checkStatus();
  }, []);

  return {
    isEnabled,
    hasPermissions,
    isLoading,
    pushToken,
    enableProximityNotifications,
    disableProximityNotifications,
    requestPermissions,
    checkNow,
    checkNearbyFriendsBLE,
  };
}
// hooks/useProximityNotifications.jsx - FULLY FIXED VERSION
import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
const PROXIMITY_RADIUS_METERS = 5000; // 5km for testing
const LOCATION_UPDATE_INTERVAL = 3000; // 3 seconds
const NOTIFICATION_COOLDOWN = 3000; // 3 seconds

console.log('⚙️ Proximity notifications module loaded - FIXED VERSION');

// FIXED: Updated notification handler with new API
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,  // FIXED: New API
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

// Create Android notification channel
async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('proximity-alerts', {
        name: 'Friend Proximity Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
      console.log('✅ Notification channel created');
    } catch (error) {
      console.error('❌ Error creating notification channel:', error);
    }
  }
}

// Initialize channel immediately
setupNotificationChannel();

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Check if notification was sent recently
async function wasNotifiedRecently(userId, friendId) {
  try {
    const key = `notif_${userId}_${friendId}`;
    const lastNotified = await AsyncStorage.getItem(key);
    
    if (!lastNotified) return false;
    
    const timeSinceNotification = Date.now() - parseInt(lastNotified, 10);
    const cooldownActive = timeSinceNotification < NOTIFICATION_COOLDOWN;
    
    if (cooldownActive) {
      const remaining = Math.round((NOTIFICATION_COOLDOWN - timeSinceNotification) / 1000);
      console.log(`⏰ Cooldown: ${remaining}s remaining for friend ${friendId}`);
    }
    
    return cooldownActive;
  } catch (error) {
    console.error('❌ Error checking notification history:', error);
    return false;
  }
}

// Mark notification as sent
async function markNotificationSent(userId, friendId) {
  try {
    const key = `notif_${userId}_${friendId}`;
    await AsyncStorage.setItem(key, Date.now().toString());
    console.log(`📝 Marked notification sent for friend ${friendId}`);
  } catch (error) {
    console.error('❌ Error saving notification history:', error);
  }
}

// FIXED: Register for push notifications without crashing
async function registerForPushNotificationsAsync() {
  try {
    if (Platform.OS === 'android') {
      await setupNotificationChannel();
    }

    if (!Device.isDevice) {
      console.log('⚠️ Simulator detected - using local notifications only');
      return 'simulator-mode';
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('❌ Notification permission not granted');
      return 'permission-denied';
    }

    console.log('✅ Notification permissions granted');
    
    // Don't try to get FCM token - not needed for local notifications
    return 'local-only-mode';
    
  } catch (error) {
    console.error('❌ Error in registerForPushNotificationsAsync:', error.message);
    return 'error-fallback';
  }
}

// Send notification
async function sendProximityNotification(friend, userId) {
  try {
    console.log(`📤 Attempting to send notification for ${friend.name}...`);
    
    // Check cooldown
    const notifiedRecently = await wasNotifiedRecently(userId, friend.id);
    if (notifiedRecently) {
      console.log(`⏰ Notification cooldown active for ${friend.name}`);
      return;
    }

    // Calculate distance
    const distance = friend.distance 
      ? Math.round(friend.distance) 
      : 'nearby';

    console.log(`📍 Sending notification: ${friend.name} is ${distance}m away`);

    // Send local notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '👋 Friend Nearby!',
        body: `${friend.name} is ${distance}m away! Say hello!`,
        data: { 
          friendId: friend.id,
          type: 'proximity',
          distance: distance,
          timestamp: Date.now(),
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        badge: 1,
        ...(Platform.OS === 'android' && {
          channelId: 'proximity-alerts',
        }),
      },
      trigger: null, // Send immediately
    });

    console.log(`✅ Notification sent successfully! ID: ${notificationId}`);

    // Mark as sent
    await markNotificationSent(userId, friend.id);

    // Log to database (non-blocking)
    supabase
      .from('proximity_notifications')
      .insert({
        user_id: userId,
        friend_id: friend.id,
        distance_meters: typeof distance === 'number' ? distance : null,
        notified_at: new Date().toISOString(),
      })
      .then(() => console.log('📝 Logged to database'))
      .catch(err => console.error('⚠️ Database log failed:', err.message));

  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}

// Check for nearby friends
async function checkNearbyFriends(coords, userId = null) {
  try {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔍 [${timestamp}] Checking for nearby friends...`);
    console.log(`📍 Current location: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
    
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

    // Update location
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        last_location_update: new Date().toISOString(),
      })
      .eq('id', currentUserId);

    if (updateError) {
      console.error('❌ Error updating location:', updateError.message);
    } else {
      console.log('✅ Location updated in database');
    }

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

    // Extract friend IDs
    const friendIds = friendships.map(f => 
      f.user_id === currentUserId ? f.friend_id : f.user_id
    );

    console.log(`👥 Checking ${friendIds.length} friend(s)`);

    // Get friend profiles
    const { data: friendProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, latitude, longitude, last_location_update')
      .in('id', friendIds)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError.message);
      return;
    }

    if (!friendProfiles || friendProfiles.length === 0) {
      console.log('📍 No friends with location data');
      return;
    }

    console.log(`📍 Found ${friendProfiles.length} friend(s) with location`);

    // Calculate distances
    const nearbyFriends = friendProfiles
      .map(friend => {
        const distance = calculateDistance(
          coords.latitude,
          coords.longitude,
          friend.latitude,
          friend.longitude
        );
        return { ...friend, distance };
      })
      .filter(friend => friend.distance <= PROXIMITY_RADIUS_METERS)
      .sort((a, b) => a.distance - b.distance);

    if (nearbyFriends.length > 0) {
      console.log(`✨ Found ${nearbyFriends.length} nearby friend(s):`);
      nearbyFriends.forEach(f => {
        console.log(`  - ${f.name}: ${Math.round(f.distance)}m away`);
      });

      // Send notifications
      for (const friend of nearbyFriends) {
        await sendProximityNotification(friend, currentUserId);
      }
    } else {
      console.log('😔 No friends within proximity radius');
    }

  } catch (error) {
    console.error('❌ Error in checkNearbyFriends:', error);
  }
}

// CRITICAL: Define background task BEFORE export
console.log('🔧 Defining background location task...');

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  const timestamp = new Date().toLocaleTimeString();
  
  if (error) {
    console.error(`❌ [${timestamp}] Background task error:`, error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];
    
    if (location) {
      console.log(`🌍 [${timestamp}] BACKGROUND UPDATE - App may be closed!`);
      console.log(`📍 Location: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`);
      
      try {
        // Get user ID from storage
        const userIdStr = await AsyncStorage.getItem('current_user_id');
        
        if (!userIdStr) {
          console.warn('⚠️ No user ID in storage - cannot check friends');
          return;
        }

        console.log(`👤 User ID from storage: ${userIdStr.substring(0, 8)}...`);
        
        // Check for nearby friends
        await checkNearbyFriends(location.coords, userIdStr);
        
        console.log(`✅ [${timestamp}] Background check complete`);
        
      } catch (bgError) {
        console.error('❌ Error in background task:', bgError);
      }
    }
  }
});

console.log('✅ Background task defined successfully');

export function useProximityNotifications() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pushToken, setPushToken] = useState(null);

  // Request permissions
  const requestPermissions = useCallback(async () => {
    try {
      console.log('🔐 Requesting permissions...');

      // Get notification permission (don't block on token)
      const token = await registerForPushNotificationsAsync();
      setPushToken(token);

      // Get location permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 Foreground location:', foregroundStatus);
      
      if (foregroundStatus !== 'granted') {
        alert('❌ Location permission required');
        return false;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      console.log('📍 Background location:', backgroundStatus);
      
      if (backgroundStatus !== 'granted') {
        alert('⚠️ Background location required!\n\nPlease enable "Allow all the time" in Settings.');
        return false;
      }

      const hasPerms = foregroundStatus === 'granted' && backgroundStatus === 'granted';
      setHasPermissions(hasPerms);
      console.log('✅ All permissions granted');
      
      return hasPerms;
    } catch (error) {
      console.error('❌ Error requesting permissions:', error);
      return false;
    }
  }, []);

  // Enable proximity notifications
  const enableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🚀 Enabling proximity notifications...');

      // Request permissions
      const hasPerms = await requestPermissions();
      if (!hasPerms) {
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

      // Store user ID for background task
      await AsyncStorage.setItem('current_user_id', user.id);
      console.log('✅ User ID stored for background task');

      // Check if task is defined
      const isTaskDefined = await TaskManager.isTaskDefined(LOCATION_TASK_NAME);
      console.log(`🔧 Task defined: ${isTaskDefined}`);
      
      if (!isTaskDefined) {
        console.error('❌ Background task not defined!');
        alert('Background task error. Please restart the app.');
        setIsLoading(false);
        return false;
      }

      // Stop existing task if running
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isTaskRegistered) {
        console.log('🛑 Stopping existing background task...');
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      // Start background location tracking
      console.log('▶️ Starting background location tracking...');
      
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        distanceInterval: 50,
        deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
        showsBackgroundLocationIndicator: Platform.OS === 'ios',
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: '📍 Friend Proximity Active (TEST)',
          notificationBody: 'Updates every 30s • 5km radius • 10s cooldown',
          notificationColor: '#2196F3',
        } : undefined,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Other,
      });

      console.log('✅ Background tracking started!');

      // Update database
      await supabase
        .from('profiles')
        .update({ 
          proximity_notifications_enabled: true,
          expo_push_token: pushToken,
          last_location_update: new Date().toISOString()
        })
        .eq('id', user.id);

      setIsEnabled(true);
      setIsLoading(false);
      
      // Do immediate check
      console.log('🔍 Performing initial check...');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await checkNearbyFriends(location.coords, user.id);

      alert('✅ TEST MODE Enabled!\n\n• 30s updates\n• 5km radius\n• 10s cooldown\n\nClose the app completely to test!');
      return true;
    } catch (error) {
      console.error('❌ Error enabling:', error);
      alert(`Failed:\n${error.message}`);
      setIsLoading(false);
      return false;
    }
  }, [requestPermissions, pushToken]);

  // Disable
  const disableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('🛑 Disabling...');

      const hasTask = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (hasTask) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('✅ Stopped');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ proximity_notifications_enabled: false })
          .eq('id', user.id);
      }

      setIsEnabled(false);
      setIsLoading(false);
      alert('✅ Disabled');
      return true;
    } catch (error) {
      console.error('❌ Error disabling:', error);
      setIsLoading(false);
      return false;
    }
  }, []);

  // Check status on mount
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
        const { status: locationStatus } = await Location.getForegroundPermissionsAsync();
        const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
        
        const allGranted = notifStatus === 'granted' && 
                          locationStatus === 'granted' && 
                          backgroundStatus === 'granted';
        
        setHasPermissions(allGranted);
        
        console.log('📊 Status:', {
          notifications: notifStatus,
          foreground: locationStatus,
          background: backgroundStatus,
          enabled: isEnabled
        });
      } catch (error) {
        console.error('❌ Error checking status:', error);
      }
    };

    checkStatus();
  }, []);

  // Manual check
  const checkNow = useCallback(async () => {
    try {
      console.log('🔍 Manual check...');
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('❌ Must be logged in');
        return;
      }
      
      await checkNearbyFriends(location.coords, user.id);
      alert('✅ Check complete!');
    } catch (error) {
      console.error('❌ Error:', error);
      alert(`Failed:\n${error.message}`);
    }
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
  };
}
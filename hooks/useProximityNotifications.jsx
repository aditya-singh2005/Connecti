// hooks/useProximityNotifications.jsx
import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../lib/supabase';
import { Platform, AppState } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';
const PROXIMITY_RADIUS_METERS = 1000; // 1km radius
const LOCATION_UPDATE_INTERVAL = 30000; // 5 minutes

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Helper function to calculate distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Check for nearby friends
async function checkNearbyFriends(coords) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Update current user's location
    await supabase
      .from('profiles')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        last_location_update: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Get friends with their locations (bidirectional)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) return;

    const friendIds = friendships.map(f => 
      f.user_id === user.id ? f.friend_id : f.user_id
    );

    const { data: friendProfiles } = await supabase
      .from('profiles')
      .select('id, name, latitude, longitude, last_location_update')
      .in('id', friendIds)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (!friendProfiles) return;

    // Check which friends are nearby
    const nearbyFriends = friendProfiles.filter(friend => {
      const distance = calculateDistance(
        coords.latitude,
        coords.longitude,
        friend.latitude,
        friend.longitude
      );
      return distance <= PROXIMITY_RADIUS_METERS;
    });

    // Send notifications for nearby friends
    for (const friend of nearbyFriends) {
      await sendProximityNotification(friend, user.id);
    }
  } catch (error) {
    console.error('Error checking nearby friends:', error);
  }
}

// Send notification (with deduplication)
async function sendProximityNotification(friend, userId) {
  try {
    // Check if notification was sent recently (within 1 hour)
    const { data: recentNotif } = await supabase
      .from('proximity_notifications')
      .select('notified_at')
      .eq('user_id', userId)
      .eq('friend_id', friend.id)
      .gte('notified_at', new Date(Date.now() - 3600000).toISOString())
      .maybeSingle();

    // Don't send if already notified recently
    if (recentNotif) return;

    // Send notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '👋 Friend Nearby!',
        body: `${friend.name} is nearby! Say hello!`,
        data: { friendId: friend.id, type: 'proximity' },
      },
      trigger: null, // Send immediately
    });

    // Log notification
    await supabase
      .from('proximity_notifications')
      .insert({
        user_id: userId,
        friend_id: friend.id,
      });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

// Define background location task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];
    
    if (location) {
      await checkNearbyFriends(location.coords);
    }
  }
});

export function useProximityNotifications() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Request permissions
  const requestPermissions = useCallback(async () => {
    try {
      // Request notification permissions
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      
      // Request foreground location permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        alert('Location permission is required for proximity notifications');
        return false;
      }

      // Request background location permission
      if (Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          alert('Background location permission is required for proximity notifications');
          return false;
        }
      }

      const hasPerms = notifStatus === 'granted' && foregroundStatus === 'granted';
      setHasPermissions(hasPerms);
      return hasPerms;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }, []);

  // Enable proximity notifications
  const enableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);

      const hasPerms = await requestPermissions();
      if (!hasPerms) {
        setIsLoading(false);
        return false;
      }

      // Start background location tracking
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        distanceInterval: 100, // Update every 100 meters
        foregroundService: {
          notificationTitle: 'Friend Proximity Active',
          notificationBody: 'Tracking location to notify you of nearby friends',
          notificationColor: '#1E88E5',
        },
        pausesUpdatesAutomatically: true,
      });

      // Update user preference in database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ proximity_notifications_enabled: true })
          .eq('id', user.id);
      }

      setIsEnabled(true);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error enabling proximity notifications:', error);
      setIsLoading(false);
      return false;
    }
  }, [requestPermissions]);

  // Disable proximity notifications
  const disableProximityNotifications = useCallback(async () => {
    try {
      setIsLoading(true);

      // Stop background location tracking
      const hasTask = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (hasTask) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      // Update user preference in database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ proximity_notifications_enabled: false })
          .eq('id', user.id);
      }

      setIsEnabled(false);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error disabling proximity notifications:', error);
      setIsLoading(false);
      return false;
    }
  }, []);

  // Check current status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('proximity_notifications_enabled')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.proximity_notifications_enabled) {
            setIsEnabled(true);
          }
        }

        // Check permissions
        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        const { status: locationStatus } = await Location.getForegroundPermissionsAsync();
        setHasPermissions(notifStatus === 'granted' && locationStatus === 'granted');
      } catch (error) {
        console.error('Error checking status:', error);
      }
    };

    checkStatus();
  }, []);

  // Manual check for nearby friends
  const checkNow = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await checkNearbyFriends(location.coords);
    } catch (error) {
      console.error('Error checking now:', error);
    }
  }, []);

  return {
    isEnabled,
    hasPermissions,
    isLoading,
    enableProximityNotifications,
    disableProximityNotifications,
    requestPermissions,
    checkNow,
  };
}
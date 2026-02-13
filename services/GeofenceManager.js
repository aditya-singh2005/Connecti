// services/GeofenceManager.js - FIXED: Single notifications + Better detection
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { sendGeofenceTrigger } from './api';
import { WaveService } from './WaveService';

// ⚠️ CRITICAL: Set the handler globally so it handles notifications even when app is in background/foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const GEOFENCE_TASK_NAME = 'CONNECTI_GEOFENCE_TASK';
const GEOFENCE_EVENTS_KEY = 'geofence_events';
const FCM_DEVICE_TOKEN_KEY = 'fcm_device_token';
const CURRENT_ZONE_KEY = 'current_zone';
const NOTIFIED_ZONES_KEY = 'notified_zones';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active';

export async function storeFCMToken(token) {
  try {
    await AsyncStorage.setItem(FCM_DEVICE_TOKEN_KEY, token);
    console.log('✅ FCM Token stored');
    return true;
  } catch (error) {
    console.error('❌ Failed to store token:', error);
    return false;
  }
}

export async function getFCMToken() {
  try {
    return await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

export async function setupGeofenceNotificationChannels() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('geofence-alerts', {
        name: 'Zone Alerts',
        description: 'Notifications when entering zones',
        importance: Notifications.AndroidImportance.HIGH, // MAX deprecated in Expo 51+
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableVibrate: true,
        enableLights: true,
        priority: 'max',
      });

      console.log('✅ Notification channel ready');
      return true;
    } catch (error) {
      console.warn('⚠️ Channel setup warning:', error.message);
      return false;
    }
  }
  return true;
}

// ✅ FIXED: Single notification function (no duplicates)
async function sendSingleNotification(zoneName, distance, timestamp) {
  try {
    console.log(`📢 Sending SINGLE notification: ${zoneName}`);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 Entered ${zoneName}`,
        body: "Tap 'Wave' to check in! 👋",
        data: { url: '/home/HomeScreen', zoneName },
        categoryIdentifier: 'GEOFENCE_MATCH',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        badge: 1,
        channelId: 'geofence-alerts',
      },
      trigger: null,
    });

    console.log(`✅ Notification sent for ${zoneName}`);
    return true;
  } catch (error) {
    console.error('❌ Notification failed:', error.message);
    return false;
  }
}

async function storeGeofenceEvent(eventData) {
  try {
    const storedEvents = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
    const eventsList = storedEvents ? JSON.parse(storedEvents) : [];

    eventsList.push(eventData);

    const trimmedEvents = eventsList.slice(-100);
    await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(trimmedEvents));

    console.log(`✅ Event stored: ${eventData.zone}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to store event:', error.message);
    return false;
  }
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    // Silent fail on error to keep logs clean
    return;
  }

  if (!data) {
    return;
  }

  const { eventType, region } = data;
  const zoneName = region.identifier;

  if (eventType === Location.GeofencingEventType.Exit) {
    console.log(`[BG] 🚪 Exited ${zoneName}`);
    // ✅ NEW LOGIC: Do NOT delete on exit. 
    // This allows open_to_wave to persist if moving between zones.
    // Stale records are handled by the 30-min DB cleanup trigger.
    return;
  }

  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[BG] ✅ Entered ${zoneName}`);

    const timestamp = new Date().toISOString();

    // Calculate distance for internal logic (optional, keep simple log)
    // ... logic to store event and send notification ...

    try {
      await AsyncStorage.setItem(CURRENT_ZONE_KEY, zoneName);

      // 🧹 SESSION CLEANUP: Wipe notified zones if stale
      const lastActive = await AsyncStorage.getItem(SESSION_LAST_ACTIVE_KEY);
      const currentTime = new Date().getTime();
      const STALE_THRESHOLD = 30 * 60 * 1000; // 30 mins

      if (lastActive && (currentTime - parseInt(lastActive) > STALE_THRESHOLD)) {
        console.log('[BG] 🧹 Stale session. Wiping notified zones.');
        await AsyncStorage.removeItem(NOTIFIED_ZONES_KEY);
      }
      await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, currentTime.toString());

      // ✅ Sync with Supabase via WaveService
      let alreadyOpen = false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const syncResult = await WaveService.syncUserZone(user.id, zoneName, {
            latitude: region.latitude,
            longitude: region.longitude
          });
          alreadyOpen = syncResult?.openToWave || false;
        }
      } catch (dbError) {
        console.warn('[BG] ⚠️ Presence sync failed:', dbError.message);
      }

      if (alreadyOpen) {
        console.log(`[BG] 🌊 User already open to wave in ${zoneName}, skipping notification`);
        return;
      }

      // ✅ NEW: ONE-SHOT CHECK - Don't ask again if neglected
      const notifiedStr = await AsyncStorage.getItem(NOTIFIED_ZONES_KEY);
      let notifiedList = notifiedStr ? JSON.parse(notifiedStr) : [];
      if (notifiedList.includes(zoneName)) {
        console.log(`[BG] ⏳ Already prompted for ${zoneName} once, skipping.`);
        return;
      }

      // Add to notified list before sending
      notifiedList.push(zoneName);
      await AsyncStorage.setItem(NOTIFIED_ZONES_KEY, JSON.stringify(notifiedList));

      const eventData = {
        type: 'enter',
        zone: zoneName,
        timestamp: timestamp,
        lat: region.latitude,
        lng: region.longitude,
        appState: 'background', // Assume background for this task
        source: 'background_task',
        notificationSent: false,
      };

      await storeGeofenceEvent(eventData);

      // ✅ COOLDOWN CHECK
      const outputKey = `last_notification_${zoneName}`;
      const lastSentTime = await AsyncStorage.getItem(outputKey);
      const now = new Date().getTime();

      // REDUCED COOLDOWN: 1 second for testing (was 15s)
      if (lastSentTime && (now - parseInt(lastSentTime) < 1000)) {
        // Silent cooldown return
        return;
      }

      await AsyncStorage.setItem(outputKey, now.toString());

      // ✅ SEND SINGLE INTERACTIVE NOTIFICATION
      // Calculate rough distance just for log/record, or pass 0 if not needed for payload
      const distance = 0; // Payload doesn't strictly need precise distance for the "Wave" message
      const notificationSent = await sendSingleNotification(zoneName, distance, timestamp);

      eventData.notificationSent = notificationSent;

      // 🌐 API Trigger (DISABLED TO PREVENT DUPLICATE PUSH NOTIFICATION)
      // The backend echoes the notification back to the user token, causing double alerts.
      // We rely on the LOCAL notification above for immediate feedback.
      try {
        /* 
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const token = await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
          // Only send if we need server-side logic, but do NOT ask server to notify us back
        }
        */
      } catch (apiError) {
        // Silent API fail
      }

    } catch (taskError) {
      // Silent task error
    }
  }
});

if (Platform.OS === 'android') {
  setupGeofenceNotificationChannels();
}

console.log('✅ GeofenceManager loaded');
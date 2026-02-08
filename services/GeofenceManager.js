// services/GeofenceManager.js - FIXED: Single notifications + Better detection
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const GEOFENCE_TASK_NAME = 'CONNECTI_GEOFENCE_TASK';
const GEOFENCE_EVENTS_KEY = 'geofence_events';
const FCM_DEVICE_TOKEN_KEY = 'fcm_device_token';
const CURRENT_ZONE_KEY = 'current_zone';

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
        importance: Notifications.AndroidImportance.MAX,
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
    
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 Entered ${zoneName}!`,
        body: `You're ${distance}m from center`,
        data: {
          type: 'geofence_entry',
          zone: zoneName,
          timestamp: timestamp,
          distance: distance,
          source: 'background_task',
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 300, 200, 300],
        badge: 1,
        channelId: 'geofence-alerts',
      },
      trigger: null,
    });
    
    console.log(`✅ Notification sent! ID: ${notificationId}`);
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
  const timestamp = new Date().toISOString();
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[BG TASK ${new Date().toLocaleTimeString()}] 🎯 GEOFENCE EVENT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (error) {
    console.error(`[BG TASK] ❌ Error: ${error.message}`);
    return;
  }

  if (!data) {
    console.warn('[BG TASK] ⚠️ No data received');
    return;
  }

  const { eventType, region } = data;
  
  console.log('[BG TASK] Event Details:');
  console.log(`  Type: ${eventType}`);
  console.log(`  Zone: ${region?.identifier}`);
  console.log(`  Coords: ${region?.latitude}, ${region?.longitude}`);
  
  const isEnter = eventType === Location.GeofencingEventType.Enter;
  
  console.log(`  Action: ${isEnter ? 'ENTER ✅' : 'EXIT ❌'}`);

  if (isEnter) {
    const zoneName = region.identifier;
    
    console.log(`\n[BG TASK] 🎯 ZONE ENTRY: ${zoneName}\n`);
    
    try {
      await AsyncStorage.setItem(CURRENT_ZONE_KEY, zoneName);
      
      const eventData = {
        type: 'enter',
        zone: zoneName,
        timestamp: timestamp,
        lat: region.latitude,
        lng: region.longitude,
        appState: 'killed',
        source: 'background_task',
        notificationSent: false,
      };
      
      await storeGeofenceEvent(eventData);
      
      // ✅ FIXED: Send ONLY ONE notification
      const notificationSent = await sendSingleNotification(zoneName, 0, timestamp);
      
      eventData.notificationSent = notificationSent;
      
      console.log(`\n[BG TASK] Results:`);
      console.log(`  Zone: ${zoneName}`);
      console.log(`  Notification: ${notificationSent ? '✅' : '❌'}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
    } catch (taskError) {
      console.error('[BG TASK] ❌ Task error:', taskError.message);
    }
  } else {
    console.log(`[BG TASK] EXIT ignored`);
  }
});

if (Platform.OS === 'android') {
  setupGeofenceNotificationChannels();
}

console.log('✅ GeofenceManager loaded');
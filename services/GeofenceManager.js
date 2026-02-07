// services/GeofenceManager.js - UPDATED FOR FCM DEVICE TOKENS
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const GEOFENCE_TASK_NAME = 'CONNECTI_GEOFENCE_TASK';
const GEOFENCE_EVENTS_KEY = 'geofence_events';
const FCM_DEVICE_TOKEN_KEY = 'fcm_device_token';
const API_URL = 'https://connecti-push-api.vercel.app/api/send-notification';

// Store FCM Device Token for background use
export async function storeFCMToken(token) {
  try {
    await AsyncStorage.setItem(FCM_DEVICE_TOKEN_KEY, token);
    console.log('✅ FCM Device Token stored for geofencing');
    return true;
  } catch (error) {
    console.error('❌ Failed to store token:', error);
    return false;
  }
}

// Get FCM Device Token
export async function getFCMToken() {
  try {
    const token = await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
    return token;
  } catch (error) {
    return null;
  }
}

// Setup notification channels
export async function setupGeofenceNotificationChannels() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('geofence-alerts', {
        name: 'Geofence Zone Alerts',
        description: 'High priority notifications when you enter monitored zones',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF0000',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableVibrate: true,
        enableLights: true,
      });
      
      console.log('✅ Geofence notification channel ready');
      return true;
    } catch (error) {
      console.warn('⚠️ Channel setup warning:', error.message);
      return false;
    }
  }
  return true;
}

// Send local notification (ALWAYS works)
async function sendLocalNotification(zoneName, timestamp) {
  try {
    console.log(`📢 Sending local notification for: ${zoneName}`);
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎯 Zone Entered!',
        body: `You entered ${zoneName}`,
        data: {
          type: 'geofence_entry',
          zone: zoneName,
          timestamp: timestamp,
          appKilled: true,
          source: 'local',
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        badge: 1,
        channelId: 'geofence-alerts',
      },
      trigger: null,
    });
    
    console.log('✅ Local notification sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Local notification failed:', error.message);
    return false;
  }
}

// Send remote notification via FCM API
async function sendRemoteNotification(zoneName, timestamp) {
  try {
    const fcmDeviceToken = await getFCMToken();
    
    if (!fcmDeviceToken) {
      console.log('ℹ️ No FCM Device Token available, skipping remote notification');
      return false;
    }
    
    console.log('📡 Sending remote notification via FCM...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: fcmDeviceToken,
        title: '🎯 Zone Entered!',
        body: `You entered ${zoneName} (Remote)`,
        data: {
          type: 'geofence_entry',
          zone: zoneName,
          timestamp: timestamp,
          appKilled: true,
          source: 'fcm_remote',
        }
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Remote notification sent via FCM');
      return true;
    } else {
      console.log('⚠️ FCM API returned error:', result.message);
      return false;
    }
    
  } catch (error) {
    console.log('⚠️ Remote notification failed:', error.message);
    return false;
  }
}

// Store geofence event
async function storeGeofenceEvent(eventData) {
  try {
    const storedEvents = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
    const eventsList = storedEvents ? JSON.parse(storedEvents) : [];
    
    eventsList.push(eventData);
    
    // Keep only last 100 events
    const trimmedEvents = eventsList.slice(-100);
    await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(trimmedEvents));
    
    console.log(`✅ Event stored: ${eventData.zone}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to store event:', error.message);
    return false;
  }
}

// Define the Background Task
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  const timestamp = new Date().toISOString();
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[BG TASK ${new Date().toLocaleTimeString()}] 🎯 Geofence event triggered`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (error) {
    console.error(`[BG TASK] ❌ Error: ${error.message}`);
    return;
  }

  if (!data) {
    console.warn('[BG TASK] ⚠️ No data received');
    return;
  }

  const { eventType, region } = data;
  console.log(`[BG TASK] Event Type: ${eventType === Location.GeofencingEventType.Enter ? 'ENTER' : 'EXIT'}`);
  console.log(`[BG TASK] Zone: ${region.identifier}`);

  if (eventType === Location.GeofencingEventType.Enter) {
    const zoneName = region.identifier;
    
    try {
      // 1. Store event first
      const eventData = {
        type: 'enter',
        zone: zoneName,
        timestamp: timestamp,
        lat: region.latitude,
        lng: region.longitude,
        bgTask: true,
        appKilled: true,
        notificationSent: false,
      };
      
      await storeGeofenceEvent(eventData);
      
      // 2. Send LOCAL notification (primary method)
      const localSent = await sendLocalNotification(zoneName, timestamp);
      
      if (localSent) {
        console.log(`[BG TASK] ✅ LOCAL notification delivered for: ${zoneName}`);
      } else {
        console.log(`[BG TASK] ⚠️ LOCAL notification failed for: ${zoneName}`);
      }
      
      // 3. Send REMOTE notification via FCM (backup method)
      const remoteSent = await sendRemoteNotification(zoneName, timestamp);
      
      if (remoteSent) {
        console.log(`[BG TASK] ✅ REMOTE FCM notification delivered for: ${zoneName}`);
      } else {
        console.log(`[BG TASK] ℹ️ REMOTE notification skipped (no token or error)`);
      }
      
      // Update event with notification status
      eventData.notificationSent = localSent || remoteSent;
      
      console.log(`\n[BG TASK] ✅ Zone entry processed successfully!`);
      console.log(`[BG TASK] Zone: ${zoneName}`);
      console.log(`[BG TASK] Local Notification: ${localSent ? '✅' : '❌'}`);
      console.log(`[BG TASK] Remote FCM Notification: ${remoteSent ? '✅' : '❌'}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
    } catch (taskError) {
      console.error(`[BG TASK] ❌ Failed to process event:`, taskError.message);
      console.error(`[BG TASK] Stack:`, taskError.stack);
    }
  } else if (eventType === Location.GeofencingEventType.Exit) {
    console.log(`[BG TASK] 📤 Exited zone: ${region.identifier}`);
  }
});

// Initialize channels on module load
if (Platform.OS === 'android') {
  setupGeofenceNotificationChannels();
}

console.log('✅ GeofenceManager loaded - Dual notification system (Local + FCM Remote)');
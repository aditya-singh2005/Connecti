// app/_layout.jsx
// ⚠️ CRITICAL: Import GeofenceManager FIRST
import '../services/GeofenceManager';

import { Stack } from "expo-router";
import { useEffect } from 'react';
import { AuthProvider } from "../context/AuthProvider";
import { ThemeProvider } from "../context/ThemeContext";
import NotificationHandler from "../components/NotificationHandler";
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEOFENCE_TASK_NAME } from '../services/GeofenceManager';

export default function RootLayout() {
  useEffect(() => {
    initializeApp();
    
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification tapped:', response.notification.request.content.data);
    });

    return () => subscription.remove();
  }, []);

  async function initializeApp() {
    try {
      console.log('\n🚀 ========================================');
      console.log('🚀 APP STARTED - Connecti');
      console.log('🚀 ========================================\n');

      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
      
      if (isTaskRegistered) {
        console.log('✅ OS-LEVEL GEOFENCING IS ACTIVE');
        
        const activeGeofences = await AsyncStorage.getItem('active_geofences');
        if (activeGeofences) {
          const zones = JSON.parse(activeGeofences);
          console.log(`✅ Monitoring ${zones.length} zones at OS level`);
        }
      } else {
        console.log('ℹ️ Geofencing not active yet');
        console.log('ℹ️ Will auto-start if permissions granted...\n');
      }

      const { status } = await Notifications.requestPermissionsAsync();
      console.log('✅ Notification permissions:', status);

      const events = await AsyncStorage.getItem('geofence_events');
      if (events) {
        const eventsList = JSON.parse(events);
        const entryEvents = eventsList.filter(e => e.type === 'enter');
        if (entryEvents.length > 0) {
          console.log(`📜 ${entryEvents.length} entry events in history\n`);
        }
      }

      console.log('🚀 App initialization complete\n');

    } catch (error) {
      console.error('❌ App initialization error:', error);
    }
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="create-profile" />
          <Stack.Screen name="location-test" />
          <Stack.Screen name="home" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
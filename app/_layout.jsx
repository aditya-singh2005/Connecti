// app/_layout.jsx
// ⚠️ CRITICAL: Import tasks/geofenceTask FIRST (Side Effects)
import '../tasks/geofenceTask';

import { Stack } from "expo-router";
import { useEffect } from 'react';
import { AuthProvider } from "../context/AuthProvider";
import { ThemeProvider } from "../context/ThemeContext";
import NotificationHandler from "../components/NotificationHandler";
// GeofenceController removed - useGeofenceService handles all geofencing logic
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEOFENCE_TASK_NAME } from '../tasks/geofenceTask'; // ✅ UPDATED

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
        console.log('✅ EXPO GEOFENCING TASK REGISTERED: ', GEOFENCE_TASK_NAME);
      } else {
        console.log('ℹ️ Geofencing Task NOT registered (Controller will handle this)');
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
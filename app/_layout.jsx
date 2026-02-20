// app/_layout.jsx
// CRITICAL: Import tasks/geofenceTask FIRST (Side Effects)
import '../tasks/geofenceTask';

import { Stack } from "expo-router";
import { useEffect } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { AuthProvider } from "../context/AuthProvider";
import { ThemeProvider } from "../context/ThemeContext";
import NotificationHandler from "../components/NotificationHandler";
import { WaveService } from '../services/WaveService';
// GeofenceController removed - useGeofenceService handles all geofencing logic
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEOFENCE_TASK_NAME } from '../tasks/geofenceTask';

const APP_RUNTIME_STATE_KEY = 'app_runtime_state';
const APP_RUNTIME_STATE_UPDATED_AT_KEY = 'app_runtime_state_updated_at';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active';

export default function RootLayout() {
  const persistRuntimeState = async (state) => {
    const timestamp = Date.now().toString();

    await AsyncStorage.multiSet([
      [APP_RUNTIME_STATE_KEY, state],
      [APP_RUNTIME_STATE_UPDATED_AT_KEY, timestamp],
    ]);

    if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule?.updateAppRuntimeState) {
      try {
        await NativeModules.NativeGeofenceModule.updateAppRuntimeState(state, Number(timestamp));
      } catch (nativeStateError) {
        console.log('Failed to sync runtime state to native:', nativeStateError?.message || nativeStateError);
      }
    }

    if (state === 'active') {
      await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, timestamp);
    }
  };

  useEffect(() => {
    initializeApp();
    persistRuntimeState('active');

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response.notification.request.content.data);
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      persistRuntimeState(nextState);
    });

    return () => {
      notificationSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  async function initializeApp() {
    try {
      console.log('\n=== APP STARTED - Connecti ===\n');

      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);

      if (isTaskRegistered) {
        console.log('EXPO GEOFENCING TASK REGISTERED:', GEOFENCE_TASK_NAME);
      } else {
        console.log('Geofencing task not registered (controller/hook will handle startup)');
      }

      // Process any waves that occurred while app was killed/backgrounded.
      try {
        if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule) {
          const waves = await NativeModules.NativeGeofenceModule.getPendingWaves();
          if (waves && waves.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              console.warn('Pending waves detected but no authenticated user available');
              return;
            }

            console.log(`Processing ${waves.length} pending waves from native`);
            for (const wave of waves) {
              try {
                await WaveService.syncUserZone(user.id, wave.zoneId, null);
                console.log('Synced pending native wave for zone:', wave.zoneId);
              } catch (err) {
                console.warn('Failed to sync pending wave:', wave, err.message || err);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error while processing pending waves:', err.message || err);
      }
    } catch (error) {
      console.error('App initialization error:', error);
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

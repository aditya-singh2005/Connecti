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
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
// GeofenceController removed - useGeofenceService handles all geofencing logic
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEOFENCE_TASK_NAME } from '../tasks/geofenceTask';

const APP_RUNTIME_STATE_KEY = 'app_runtime_state';
const APP_RUNTIME_STATE_UPDATED_AT_KEY = 'app_runtime_state_updated_at';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active';

// Supabase constants (mirrored here so we can pass them to native for killed-state REST)
const SUPABASE_URL = 'https://qczxsjfkjpcvjbqvcqbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjenhzamZranBjdmpicXZjcWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4OTE1ODIsImV4cCI6MjA3MjQ2NzU4Mn0.B4LAlYkS4U1dYjph6QdexQmKFhIyBG69Dg6C3VmGeeY';

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

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // Start initialization in a non-blocking timeout to avoid blocking the UI thread on startup
    const timer = setTimeout(() => {
      initializeApp();
    }, 0);

    persistRuntimeState('active');

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response.notification.request.content.data);
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      persistRuntimeState(nextState);
    });

    return () => {
      clearTimeout(timer);
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

      // 0. Handle initial notification redirection (Redirection from killed state)
      try {
        if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule?.getInitialNotificationData) {
          const initialData = await NativeModules.NativeGeofenceModule.getInitialNotificationData();
          if (initialData) {
            console.log('📍 Initial notification data found:', initialData);
            // JS will handle redirection later in a dedicated effect or here if router is ready.
            // Storing in a global or passing to NotificationHandler is also an option.
            if (initialData.type === 'GEOFENCE_ENTER' || initialData.type === 'WAVE_HINT') {
              // Navigation will be handled once user is authenticated
              await AsyncStorage.setItem('pending_redirection', JSON.stringify(initialData));
            }
          }
        }
      } catch (redirErr) {
        console.warn('Failed to get initial notification data:', redirErr);
      }

      // Process any waves that occurred while app was killed/backgrounded.
      try {
        if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule) {
          const nativeMod = NativeModules.NativeGeofenceModule;

          // 1. Drain old-style pending waves (zone entry presence sync)
          const waves = await nativeMod.getPendingWaves();
          if (waves && waves.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
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

          // 2. Drain pending Wave/Later actions from notification buttons (killed state)
          await drainNativePendingActions();

          // 3. Store Supabase creds and sync suppressions
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              if (nativeMod.storeSupabaseCreds) {
                await nativeMod.storeSupabaseCreds(SUPABASE_URL, SUPABASE_ANON_KEY, user.id);
                console.log('✅ Supabase creds stored in native SharedPreferences');
              }
              // Sync suppressions from DB to local/native cache
              await WaveService.syncSuppressions(user.id);
            }
          } catch (credErr) {
            console.warn('Could not store Supabase creds or sync suppressions:', credErr?.message || credErr);
          }

          // 4. Start zone poll (10s for testing)
          try {
            if (nativeMod.startZonePoll) {
              await nativeMod.startZonePoll();
              console.log('✅ Zone poll AlarmManager started');
            }
          } catch (pollErr) {
            console.warn('Could not start zone poll:', pollErr?.message || pollErr);
          }
        }
      } catch (err) {
        console.warn('Error while processing native startup queue:', err.message || err);
      }
    } catch (error) {
      console.error('App initialization error:', error);
    }
  }

  /**
   * Drain the pending-action queue from WaveActionReceiver (killed-state taps).
   * Called on startup and on every foreground resume.
   */
  async function drainNativePendingActions() {
    try {
      const nativeMod = NativeModules?.NativeGeofenceModule;
      if (!nativeMod?.getPendingActions) return;

      const actions = await nativeMod.getPendingActions();
      if (!actions || actions.length === 0) return;

      console.log(`[drainNative] Processing ${actions.length} pending native actions`);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[drainNative] No authed user, cannot process pending actions');
        return;
      }

      for (const act of actions) {
        try {
          if (act.action === 'WAVE') {
            console.log(`[drainNative] 🌊 Processing WAVE for zone ${act.zoneId}`);
            await WaveService.setOpenToWave(user.id, act.zoneId);
          } else if (act.action === 'LATER') {
            console.log(`[drainNative] ⏳ Processing LATER for zone ${act.zoneId}`);
            await WaveService.setLaterForZone(user.id, act.zoneId, act.zoneId);
          }
        } catch (actErr) {
          console.warn('[drainNative] Failed to process action', act, actErr?.message || actErr);
        }
      }
    } catch (err) {
      console.warn('[drainNative] Error draining pending native actions:', err?.message || err);
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

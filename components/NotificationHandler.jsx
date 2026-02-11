// components/NotificationHandler.jsx - FIXED WITH FCM DEVICE TOKENS
import { useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthProvider';
import { useRouter } from 'expo-router';
import FCMTokenService from '../services/FCMTokenService';
import { WaveService } from '../services/WaveService';

export default function NotificationHandler() {
  const { user } = useAuth();
  const router = useRouter();
  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);
  const hasAttemptedRef = useRef(false);
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    if (user?.id && !hasAttemptedRef.current) {
      console.log('✅ User ID set:', user.id);
      setupNotifications();
      hasAttemptedRef.current = true;
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user?.id]);

  const handleAppStateChange = (nextAppState) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('📱 App became active - checking for FCM token');
      // Retry getting token if we don't have one
      retryFCMToken();
    }
    appState.current = nextAppState;
  };

  async function setupNotifications() {
    console.log('🔍 Setting up notifications...');

    try {
      // Setup notification channels first
      await setupNotificationChannels();

      // ✅ Check for expired wave timer on app startup
      await WaveService.checkAndResumeTimer();

      // ✅ Register Categories
      if (Platform.OS !== 'web') {
        // 1. Zone Entry Notification (First Notification)
        await Notifications.setNotificationCategoryAsync('GEOFENCE_MATCH', [
          {
            identifier: 'WAVE',
            buttonTitle: 'Wave 👋',
            options: {
              opensAppToForeground: true,
            },
          },
          {
            identifier: 'LATER',
            buttonTitle: 'Later',
            options: {
              isDestructive: true,
            },
          },
        ]);

        // 2. Friend Match Hint (Second Notification)
        await Notifications.setNotificationCategoryAsync('MATCH_HINT', [
          {
            identifier: 'REVEAL',
            buttonTitle: 'Reveal 👁️',
            options: {
              opensAppToForeground: true,
            },
          },
          {
            identifier: 'CHECK_HINTS',
            buttonTitle: 'Check Hints 🔍',
            options: {
              opensAppToForeground: true,
            },
          },
        ]);
        console.log('✅ Registered Categories: GEOFENCE_MATCH & MATCH_HINT');
      }

      // Set up notification listeners
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('📨 Notification received:', notification.request.content.title);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data;
        const notificationId = response.notification.request.identifier;

        console.log('👆 Notification Response Received:', actionId);

        // Helper: Dismiss notification and collapse panel
        const dismissAndCollapse = async () => {
          try {
            await Notifications.dismissNotificationAsync(notificationId);
          } catch (e) {
            console.warn('⚠️ Could not dismiss notification:', e.message);
          }

          if (Platform.OS === 'android') {
            try {
              const { NativeModules } = require('react-native');
              if (NativeModules.StatusBarManager?.collapsePanels) {
                NativeModules.StatusBarManager.collapsePanels();
              }
            } catch (e) { }
          }
        };

        // ✅ HANDLE WAVE_HINT NOTIFICATIONS
        if (data?.type === 'WAVE_HINT') {
          console.log('🌊 WAVE HINT NOTIFICATION DETECTED');
        }

        // --- ACTIONS ---

        // 1. WAVE (From Zone Entry)
        if (actionId === 'WAVE') {
          console.log('🌊 WAVE ACTION -> Setting open_to_wave = true');
          if (user?.id) {
            const zoneName = data?.zoneName || data?.zoneId || 'Unknown Zone';
            await WaveService.setOpenToWave(user.id, zoneName);
          }
          await dismissAndCollapse();
          setTimeout(() => {
            router.replace('/home/HomeScreen');
          }, 100);
        }

        // 2. LATER (From Zone Entry)
        else if (actionId === 'LATER') {
          console.log('👋 LATER clicked');
          await dismissAndCollapse();
        }

        // 3. REVEAL (From Hint Match)
        else if (actionId === 'REVEAL') {
          console.log('👁️ REVEAL clicked -> Showing Match');
          await dismissAndCollapse();
          setTimeout(() => {
            // Determine where to go - active match screen? or just home?
            // For now, Home is fine as it shows active status
            router.replace('/home/HomeScreen');
          }, 100);
        }

        // 4. CHECK HINTS (From Hint Match)
        else if (actionId === 'CHECK_HINTS') {
          console.log('🔍 CHECK HINTS clicked');
          await dismissAndCollapse();
          setTimeout(() => {
            router.replace('/home/HomeScreen');
          }, 100);
        }

        // 5. BODY TAP (Default)
        else if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          console.log('👆 Body Tapped');
          await dismissAndCollapse();
          setTimeout(() => {
            router.replace('/home/HomeScreen');
          }, 100);
        }
      });

      // Check if chat notifications are enabled
      const { data: profile } = await supabase
        .from('profiles')
        .select('chat_notifications_enabled')
        .eq('id', user.id)
        .single();

      if (profile?.chat_notifications_enabled) {
        console.log('🔔 Chat notifications enabled, getting FCM token...');
        await enableChatNotifications();
      } else {
        console.log('🔕 Chat notifications disabled in settings');
      }

    } catch (error) {
      console.log('⚠️ Setup warning:', error.message);
    }
  }

  async function setupNotificationChannels() {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('geofence-alerts', {
          name: 'Geofence Zone Alerts',
          importance: Notifications.AndroidImportance.HIGH, // MAX deprecated
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF0000',
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
          enableVibrate: true,
          enableLights: true,
        });

        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default Notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
          sound: 'default',
        });

        console.log('✅ Notification channels configured');
      } catch (error) {
        console.log('⚠️ Channel setup warning:', error.message);
      }
    }
  }

  async function enableChatNotifications() {
    try {
      // Get tokens using the correct service
      const tokens = await FCMTokenService.getToken();

      if (tokens) {
        // Store in database
        await supabase
          .from('profiles')
          .update({
            fcm_token: tokens.fcmToken,
            expo_push_token: tokens.expoToken,
            chat_notifications_enabled: true
          })
          .eq('id', user.id);

        console.log('✅ Push tokens saved to database');
        console.log('✅ Remote notifications fully enabled!');
      } else {
        console.log('⚠️ Tokens not available');
        console.log('💡 Scheduling retry in 60 seconds...');

        // Schedule retry
        scheduleRetry();
      }
    } catch (error) {
      console.log('⚠️ Token setup error:', error.message);
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    // Clear existing retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Retry after 60 seconds
    retryTimeoutRef.current = setTimeout(() => {
      console.log('🔄 Retrying FCM token fetch...');
      retryFCMToken();
    }, 60000);
  }

  async function retryFCMToken() {
    try {
      const tokens = await FCMTokenService.forceRetry();

      if (tokens) {
        await supabase
          .from('profiles')
          .update({
            fcm_token: tokens.fcmToken,
            expo_push_token: tokens.expoToken
          })
          .eq('id', user.id);

        console.log('✅ Tokens obtained on retry!');

        // Clear retry timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      } else {
        console.log('⚠️ Retry failed, will try again later');
        scheduleRetry();
      }
    } catch (error) {
      console.log('⚠️ Retry error:', error.message);
    }
  }

  return null;
}
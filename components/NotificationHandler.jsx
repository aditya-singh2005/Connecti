// components/NotificationHandler.jsx - Wave/Later action buttons + pending-action drain
import { useEffect, useRef } from 'react';
import { Platform, AppState, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthProvider';
import { useRouter } from 'expo-router';
import FCMTokenService from '../services/FCMTokenService';
import { WaveService } from '../services/WaveService';

// Module-level guard to prevent duplicate listener registration
let listenersRegistered = false;

// ✅ Ensure notifications show when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
      // Note: we don't automatically remove global listeners here because
      // we only want to register them once per app lifecycle.
      // If we remove them on component unmount, they might not receive
      // responses if the user taps a notification while outside this component.
    };
  }, [user?.id]);

  const handleAppStateChange = async (nextAppState) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('📱 App became active - checking for FCM token and pending actions');
      retryFCMToken();
      await drainPendingNativeActions();
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

        // 3. Match Revealed (Final Celebration)
        await Notifications.setNotificationCategoryAsync('MATCH_REVEALED', [
          {
            identifier: 'START_CHAT',
            buttonTitle: 'Chat 💬',
            options: {
              opensAppToForeground: true,
            },
          },
          {
            identifier: 'MISS_MOMENT',
            buttonTitle: 'Miss the Moment',
            options: {
              isDestructive: true,
            },
          },
        ]);
        console.log('✅ Registered Categories: GEOFENCE_MATCH, MATCH_HINT, MATCH_REVEALED');
      }

      // ✅ GUARD: Only set up global listeners once per app session
      if (!listenersRegistered) {
        listenersRegistered = true;
        
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
            if (notificationId) {
              await Notifications.dismissNotificationAsync(notificationId);
            }
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

        // 2. LATER (From Zone Entry) - suppress this zone for the rest of today
        else if (actionId === 'LATER') {
          console.log('⏳ LATER clicked - suppressing zone for today');
          const zoneId = data?.zoneId;
          const zoneName = data?.zoneName || zoneId || 'Unknown Zone';
          if (user?.id && zoneId) {
            await WaveService.setLaterForZone(user.id, zoneId, zoneName);
          }
          await dismissAndCollapse();
        }

        // 3. REVEAL (From Hint Match)
        else if (actionId === 'REVEAL') {
          console.log('👁️ REVEAL clicked -> Revealing match and opening HintScreen');
          const matchId = data?.matchId;

          if (matchId && user?.id) {
            try {
              // Call reveal_match RPC
              const { data: revealData, error } = await supabase
                .rpc('reveal_match', {
                  match_id: matchId,
                  user_id: user.id
                });

              if (error) {
                console.error('❌ Reveal error:', error);
              } else {
                console.log('✅ Reveal successful:', revealData);
              }
            } catch (err) {
              console.error('❌ Reveal exception:', err);
            }
          }

          await dismissAndCollapse();
          setTimeout(() => {
            if (matchId) {
              router.push({ pathname: '/home/HintScreen', params: { matchId } });
            } else {
              router.replace('/home/HomeScreen');
            }
          }, 100);
        }

        // 4. CHECK HINTS (From Hint Match)
        else if (actionId === 'CHECK_HINTS') {
          console.log('🔍 CHECK HINTS clicked');
          await dismissAndCollapse();
          setTimeout(() => {
            const matchId = data?.matchId;
            if (matchId) {
              router.push({ pathname: '/home/HintScreen', params: { matchId } });
            } else {
              router.replace('/home/HomeScreen');
            }
          }, 100);
        }

        // 4.5 START CHAT (From Reveal Match)
        else if (actionId === 'START_CHAT') {
          console.log('💬 START CHAT clicked');
          await dismissAndCollapse();
          setTimeout(async () => {
            const matchId = data?.matchId;
            let partnerId = data?.partnerId;

            try {
              if (!partnerId && matchId && user?.id) {
                const { data: matchData } = await supabase.from('wave_notification_logs').select('user1_id, user2_id').eq('id', matchId).single();
                if (matchData) {
                  partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id;
                }
              }
            } catch (err) {
              console.log('Error fetching partnerId:', err);
            }

            if (partnerId) {
              router.push({ pathname: '/home/ChatConversationScreen', params: { friendId: partnerId } });
            } else if (matchId) {
              router.push({ pathname: '/home/HintScreen', params: { matchId } });
            } else {
              router.replace('/home/HomeScreen');
            }
          }, 100);
        }

        // 4.6 MISS MOMENT (From Reveal Match)
        else if (actionId === 'MISS_MOMENT') {
          console.log('🚫 MISS MOMENT clicked');
          const matchId = data?.matchId;
          if (user?.id && matchId) {
            try {
              // Mark as skipped in DB
              await supabase.from('wave_notification_logs').update({
                skipped_by: user.id,
                skipped_at: new Date().toISOString()
              }).eq('id', matchId);

              // Notify the other person immediately just like HintScreen
              const { data: matchData } = await supabase.from('wave_notification_logs').select('user1_id, user2_id, user1_expo_push_token, user2_expo_push_token').eq('id', matchId).single();
              if (matchData) {
                const amIUser1 = matchData.user1_id === user.id;
                const partnerToken = amIUser1 ? matchData.user2_expo_push_token : matchData.user1_expo_push_token;
                
                if (partnerToken && partnerToken.startsWith('ExponentPushToken')) {
                  await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                      to: partnerToken,
                      title: '🌫️ Moment Passed',
                      body: 'The other person skipped this moment.',
                      data: { type: 'skipped', matchId },
                      sound: 'default',
                      channelId: 'geofence-alerts'
                    })
                  });
                }
              }
            } catch (err) {
              console.error('Failed to skip from notification:', err);
            }
          }
          await dismissAndCollapse();
          setTimeout(() => {
            if (matchId) {
              router.push({ pathname: '/home/HintScreen', params: { matchId } });
            } else {
              router.replace('/home/HomeScreen');
            }
          }, 100);
        }

        // 5. BODY TAP (Default)
        else if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          console.log('👆 Body Tapped:', data?.type);
          await dismissAndCollapse();
          setTimeout(() => {
            const matchId = data?.matchId;
            // Route any hint/reveal/skipped notification to HintScreen
            const hintTypes = ['MATCH_REVEALED', 'WAVE_HINT', 'reveal', 'skipped'];
            if (matchId && hintTypes.includes(data?.type)) {
              router.push({ pathname: '/home/HintScreen', params: { matchId } });
              return;
            }
            router.replace('/home/HomeScreen');
          }, 100);
        }
      });
      } // <-- CLOSED if (!listenersRegistered) guard

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

      if (tokens && tokens.fcmToken) {
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
        console.log('⚠️ Tokens not available or invalid structure', tokens);
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

  /**
   * Drain pending WAVE/LATER actions from the native SharedPreferences queue.
   * Called when the app comes to the foreground (in case the user tapped a
   * notification button while the app was backgrounded or killed).
   */
  async function drainPendingNativeActions() {
    try {
      const nativeMod = NativeModules?.NativeGeofenceModule;
      if (!nativeMod?.getPendingActions) return;

      const actions = await nativeMod.getPendingActions();
      if (!actions || actions.length === 0) return;

      console.log(`[NotifHandler] Processing ${actions.length} pending native actions`);
      const { data: { user: curUser } } = await supabase.auth.getUser();
      if (!curUser) return;

      for (const act of actions) {
        try {
          if (act.action === 'WAVE') {
            console.log(`[NotifHandler] 🌊 WAVE from native for zone ${act.zoneId}`);
            await WaveService.setOpenToWave(curUser.id, act.zoneId);
          } else if (act.action === 'LATER') {
            console.log(`[NotifHandler] ⏳ LATER from native for zone ${act.zoneId}`);
            await WaveService.setLaterForZone(curUser.id, act.zoneId, act.zoneId);
          }
        } catch (actErr) {
          console.warn('[NotifHandler] Failed to process action', act, actErr?.message || actErr);
        }
      }
    } catch (err) {
      console.warn('[NotifHandler] Error draining native pending actions:', err?.message || err);
    }
  }

  return null;
}

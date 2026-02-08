// hooks/useChatNotifications.jsx - USING FCM DEVICE TOKENS
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import ExpoPushTokenService from '../services/ExpoPushTokenService';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export function useChatNotifications() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [userId, setUserId] = useState(null);
  const [fcmDeviceToken, setFcmDeviceToken] = useState(null);
  const subscriptionRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const currentScreenRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Register for Push Notifications and get FCM Device Token
  const registerForPushNotificationsAsync = async () => {
    try {
      // Setup notification channel first
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat-messages', {
          name: '💬 Chat Messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1E88E5',
          sound: 'default',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        console.log('✅ Chat notification channel created');
      }

      // Check if physical device
      if (!Device.isDevice) {
        console.log('⚠️ Emulator detected - push notifications not available');
        return null;
      }

      // Check/request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('❌ Notification permission not granted');
        return null;
      }

      console.log('✅ Notification permissions granted');
      setHasPermissions(true);

      // Get FCM Device Token (NOT Expo Push Token!)
      console.log('🔑 Fetching FCM Device Token...');
      const token = await ExpoPushTokenService.getToken();
      
      if (token) {
        console.log('✅ FCM Device Token obtained successfully');
        console.log(`📝 Token preview: ${token.substring(0, 50)}...`);
        setFcmDeviceToken(token);
        return token;
      } else {
        console.log('⚠️ FCM Device Token not available');
        return null;
      }

    } catch (error) {
      console.log('⚠️ Push token error:', error.message);
      return null;
    }
  };

  // Save token to Supabase
  const saveTokenToDatabase = async (token) => {
    if (!userId) {
      console.log('⚠️ No user ID, cannot save token');
      return;
    }

    try {
      const updateData = {
        chat_notifications_enabled: true
      };

      if (token) {
        updateData.expo_push_token = token; // Changed from expo_push_token to fcm_token
        console.log('💾 Saving FCM Device Token to database...');
      } else {
        console.log('💾 Enabling notifications without token...');
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;
      
      if (token) {
        console.log('✅ FCM Device Token saved to database');
      } else {
        console.log('✅ Chat notifications enabled (local only)');
      }
    } catch (error) {
      console.error('❌ Error saving to database:', error.message);
    }
  };

  // Get current user
  useEffect(() => {
    if (userId) return;

    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          console.log('✅ User ID set:', user.id);
        }
      } catch (error) {
        console.error('❌ Error getting current user:', error.message);
      }
    };

    getCurrentUser();
  }, []);

  // Setup realtime subscription for new messages
  const setupMessageSubscription = useCallback(() => {
    if (!userId || subscriptionRef.current) return;

    console.log('🔔 Setting up realtime subscription...');

    subscriptionRef.current = supabase
      .channel(`chat_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          const newMessage = payload.new;
          
          const isBackground = appStateRef.current.match(/inactive|background/);
          const isOnChatScreen = currentScreenRef.current === `chat-${newMessage.sender_id}`;
          
          console.log('📨 New message received via realtime:', {
            isBackground,
            isOnChatScreen,
            senderId: newMessage.sender_id
          });
          
          // Only show local notification if in foreground and NOT on chat screen
          if (!isBackground && !isOnChatScreen) {
            await sendLocalNotification(newMessage);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

  }, [userId]);

  // Send local notification
  const sendLocalNotification = async (message) => {
    try {
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('name, username')
        .eq('id', message.sender_id)
        .single();

      const senderName = senderProfile?.name?.trim().split(' ')[0] || 
                        senderProfile?.username || 'Someone';
      
      const messagePreview = message.content.length > 100 
        ? message.content.substring(0, 97) + '...' 
        : message.content;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `💬 ${senderName}`,
          body: messagePreview,
          data: { 
            type: 'chat_message',
            senderId: message.sender_id,
            senderName: senderProfile?.name || senderProfile?.username,
            messageId: message.id,
            screen: 'ChatConversationScreen',
          },
          sound: 'default',
          channelId: 'chat-messages',
        },
        trigger: null,
      });
      
      console.log('✅ Local notification sent');
    } catch (error) {
      console.error('❌ Error sending local notification:', error.message);
    }
  };

  // Update badge count
  const updateBadgeCount = useCallback(async () => {
    try {
      if (!userId) return;

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .is('read_at', null);

      await Notifications.setBadgeCountAsync(count || 0);
      console.log('🔢 Badge count updated:', count || 0);
    } catch (error) {
      console.error('❌ Error updating badge:', error.message);
    }
  }, [userId]);

  // Clear badge
  const clearBadge = useCallback(async () => {
    try {
      await Notifications.setBadgeCountAsync(0);
      console.log('🧹 Badge cleared');
    } catch (error) {
      console.error('❌ Error clearing badge:', error.message);
    }
  }, []);

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextAppState;
      
      console.log('📱 App state changed:', prevState, '→', nextAppState);
      
      if (nextAppState === 'active') {
        clearBadge();
        updateBadgeCount();
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [clearBadge, updateBadgeCount]);

  // Setup notification listeners
  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received in foreground:', notification.request.content.title);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('👆 Notification tapped:', data);
    });

    return () => {
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, []);

  // Enable chat notifications
  const enableChatNotifications = useCallback(async () => {
    try {
      if (!userId) {
        console.log('⚠️ Cannot enable notifications: No user ID');
        return false;
      }

      console.log('🔄 Enabling chat notifications...');

      // Get FCM Device Token
      const token = await registerForPushNotificationsAsync();
      
      // Save to database
      await saveTokenToDatabase(token);

      // Setup realtime subscription
      setupMessageSubscription();
      
      setIsEnabled(true);
      
      if (token) {
        console.log('✅ Chat notifications enabled with FCM Device Token');
      } else {
        console.log('✅ Chat notifications enabled (local only)');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error enabling notifications:', error.message);
      
      // Still enable local notifications
      try {
        setupMessageSubscription();
        setIsEnabled(true);
        console.log('✅ Chat notifications enabled in fallback mode');
        return true;
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
        return false;
      }
    }
  }, [userId, setupMessageSubscription]);

  // Disable chat notifications
  const disableChatNotifications = useCallback(async () => {
    try {
      console.log('🔄 Disabling chat notifications...');

      if (subscriptionRef.current) {
        await subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }

      if (userId) {
        await supabase
          .from('profiles')
          .update({ chat_notifications_enabled: false })
          .eq('id', userId);
      }

      setIsEnabled(false);
      console.log('✅ Chat notifications disabled');
      return true;
    } catch (error) {
      console.error('❌ Error disabling notifications:', error.message);
      return false;
    }
  }, [userId]);

  // Set current screen
  const setCurrentScreen = useCallback((screen) => {
    currentScreenRef.current = screen;
    console.log('📍 Current screen set to:', screen);
  }, []);

  // Clear current screen
  const clearCurrentScreen = useCallback(() => {
    currentScreenRef.current = null;
    console.log('📍 Current screen cleared');
  }, []);

  // Auto-enable notifications on mount
  useEffect(() => {
    if (!userId || isInitializedRef.current) return;

    const checkAndEnableNotifications = async () => {
      try {
        console.log('🔍 Checking notification preferences...');

        const { data: profile } = await supabase
          .from('profiles')
          .select('chat_notifications_enabled, fcm_token')
          .eq('id', userId)
          .single();

        console.log('📊 Profile preferences:', {
          enabled: profile?.chat_notifications_enabled,
          hasToken: !!profile?.expo_push_token
        });

        // Always re-register to ensure notifications work
        await enableChatNotifications();
        
        isInitializedRef.current = true;
      } catch (error) {
        console.error('❌ Error checking preferences:', error.message);
        
        // Try to enable anyway
        try {
          await enableChatNotifications();
          isInitializedRef.current = true;
        } catch (retryError) {
          console.error('❌ Retry failed:', retryError.message);
        }
      }
    };

    checkAndEnableNotifications();
  }, [userId, enableChatNotifications]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
          console.log('🧹 Subscription cleaned up');
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  return {
    isEnabled,
    hasPermissions,
    userId,
    fcmDeviceToken, // Changed from expoPushToken
    enableChatNotifications,
    disableChatNotifications,
    setCurrentScreen,
    clearCurrentScreen,
    updateBadgeCount,
    clearBadge,
  };
}
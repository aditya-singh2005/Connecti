// hooks/useChatNotifications.jsx - Updated with Expo Push Token
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';

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
  const [expoPushToken, setExpoPushToken] = useState(null);
  const subscriptionRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const currentScreenRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Register for Expo Push Notifications and get token
  const registerForPushNotificationsAsync = async () => {
    let token;

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
    }

    if (Device.isDevice) {
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

      // Get Expo Push Token
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: '9a700934-ca0a-4a5f-b4a5-27c670756c94', // Get from app.json
      })).data;
      
      console.log('✅ Expo Push Token:', token);
      setExpoPushToken(token);
      setHasPermissions(true);
      
      return token;
    } else {
      console.log('⚠️ Must use physical device for Push Notifications');
      return null;
    }
  };

  // Save token to Supabase
  const saveTokenToDatabase = async (token) => {
    if (!userId || !token) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          expo_push_token: token,
          chat_notifications_enabled: true 
        })
        .eq('id', userId);

      if (error) throw error;
      console.log('✅ Push token saved to database');
    } catch (error) {
      console.error('❌ Error saving token:', error);
    }
  };

  // Get current user - only once
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
        console.error('❌ Error getting current user:', error);
      }
    };

    getCurrentUser();
  }, []);

  // Setup realtime subscription for new messages (for foreground updates)
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
          // Background notifications are handled by Edge Function
          if (!isBackground && !isOnChatScreen) {
            await sendLocalNotification(newMessage);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

  }, [userId]);

  // Send local notification (only for foreground)
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
        },
        trigger: null,
      });
    } catch (error) {
      console.error('❌ Error sending local notification:', error);
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
      console.error('❌ Error updating badge:', error);
    }
  }, [userId]);

  // Clear badge
  const clearBadge = useCallback(async () => {
    try {
      await Notifications.setBadgeCountAsync(0);
      console.log('🧹 Badge cleared');
    } catch (error) {
      console.error('❌ Error clearing badge:', error);
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
      try {
        Notifications.removeNotificationSubscription(receivedSubscription);
      } catch (e) {
        console.log('Cleanup: received subscription');
      }
      
      try {
        Notifications.removeNotificationSubscription(responseSubscription);
      } catch (e) {
        console.log('Cleanup: response subscription');
      }
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

      // Get Expo push token
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        console.log('❌ Failed to get push token');
        return false;
      }

      // Save token to database
      await saveTokenToDatabase(token);

      // Setup realtime subscription
      setupMessageSubscription();
      
      setIsEnabled(true);
      console.log('✅ Chat notifications enabled');
      return true;
    } catch (error) {
      console.error('❌ Error enabling notifications:', error);
      return false;
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
        // Don't remove token, just disable notifications
        await supabase
          .from('profiles')
          .update({ chat_notifications_enabled: false })
          .eq('id', userId);
      }

      setIsEnabled(false);
      console.log('✅ Chat notifications disabled');
      return true;
    } catch (error) {
      console.error('❌ Error disabling notifications:', error);
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

  // Auto-enable notifications on mount - only once
  useEffect(() => {
    if (!userId || isInitializedRef.current) return;

    const checkAndEnableNotifications = async () => {
      try {
        console.log('🔍 Checking notification preferences...');

        const { data: profile } = await supabase
          .from('profiles')
          .select('chat_notifications_enabled, expo_push_token')
          .eq('id', userId)
          .single();

        // Always re-register to get latest token
        await enableChatNotifications();
        
        isInitializedRef.current = true;
      } catch (error) {
        console.error('❌ Error checking preferences:', error);
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
          console.log('Cleanup: subscription');
        }
      }
    };
  }, []);

  return {
    isEnabled,
    hasPermissions,
    userId,
    expoPushToken,
    enableChatNotifications,
    disableChatNotifications,
    setCurrentScreen,
    clearCurrentScreen,
    updateBadgeCount,
    clearBadge,
  };
}
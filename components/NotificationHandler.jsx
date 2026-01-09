// components/NotificationHandler.jsx
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useChatNotifications } from '../hooks/useChatNotifications';

export default function NotificationHandler() {
  const router = useRouter();
  
  // Safely get chat notifications hook
  let chatNotifications;
  try {
    chatNotifications = useChatNotifications();
  } catch (error) {
    console.warn('⚠️ Chat notifications not available:', error.message);
    chatNotifications = {
      enableChatNotifications: () => Promise.resolve(),
      clearBadge: () => Promise.resolve(),
      updateBadgeCount: () => Promise.resolve(),
    };
  }
  
  const { enableChatNotifications, clearBadge, updateBadgeCount } = chatNotifications;
  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Auto-enable notifications on app start with a slight delay
    const initTimeout = setTimeout(async () => {
      try {
        await enableChatNotifications();
      } catch (error) {
        console.warn('⚠️ Could not enable chat notifications:', error.message);
      }
    }, 1000);

    // Monitor app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground
        try {
          clearBadge();
          updateBadgeCount();
        } catch (error) {
          console.warn('⚠️ Badge update error:', error.message);
        }
      }
      appState.current = nextAppState;
    });

    // Handle notification received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received:', notification);
      const data = notification.request.content.data;
      
      // Update badge count for chat messages
      if (data.type === 'chat_message') {
        try {
          updateBadgeCount();
        } catch (error) {
          console.warn('⚠️ Badge update error:', error.message);
        }
      }
      
      // Log proximity notifications
      if (data.type === 'proximity') {
        console.log('📍 Proximity notification received:', {
          friendId: data.friendId,
          distance: data.distance
        });
      }
    });

    // Handle notification tapped by user
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      console.log('👆 Notification tapped:', data);
      
      // Navigate based on notification type
      if (data.type === 'chat_message' && data.senderId) {
        // Navigate to chat conversation
        setTimeout(() => {
          router.push({
            pathname: '/home/ChatConversationScreen',
            params: {
              friendId: data.senderId,
              friendName: data.senderName || 'Unknown',
            }
          });
        }, 100);
      } else if (data.type === 'proximity' && data.friendId) {
        // Navigate to friends list or home screen when proximity notification is tapped
        setTimeout(() => {
          router.push('/home/FriendsListScreen');
          console.log('📍 Navigating to friends list for nearby friend:', data.friendId);
        }, 100);
      }
    });

    // Cleanup
    return () => {
      clearTimeout(initTimeout);
      subscription.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      isInitialized.current = false;
    };
  }, []);

  return null; // This is a logic-only component
}
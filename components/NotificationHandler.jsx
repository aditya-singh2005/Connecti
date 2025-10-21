// components/NotificationHandler.jsx
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useChatNotifications } from '../hooks/useChatNotifications';

export default function NotificationHandler() {
  const router = useRouter();
  const { enableChatNotifications, clearBadge, updateBadgeCount } = useChatNotifications();
  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Auto-enable notifications on app start with a slight delay
    const initTimeout = setTimeout(() => {
      enableChatNotifications();
    }, 1000);

    // Monitor app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground
        clearBadge();
        updateBadgeCount();
      }
      appState.current = nextAppState;
    });

    // Handle notification received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received:', notification);
      // Update badge count
      updateBadgeCount();
    });

    // Handle notification tapped by user
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      console.log('👆 Notification tapped:', data);
      
      // Navigate to the appropriate screen
      if (data.type === 'chat_message' && data.senderId) {
        // Use a timeout to ensure navigation happens after app is fully active
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
        // Handle proximity notification tap if needed
        console.log('Proximity notification for friend:', data.friendId);
      }
    });

    // Cleanup
    return () => {
      clearTimeout(initTimeout);
      subscription.remove();
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      isInitialized.current = false;
    };
  }, []);

  return null; // This is a logic-only component
}
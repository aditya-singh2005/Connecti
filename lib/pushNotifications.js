import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export class PushNotificationService {
  static async registerForPushNotifications() {
    try {
      if (!Device.isDevice) {
        console.log('❌ Must use physical device for push notifications');
        return null;
      }

      // Get current permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Push notification permission not granted');
        return null;
      }

      // Get Expo push token
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: '9a700934-ca0a-4a5f-b4a5-27c670756c94', // Your EAS project ID
      })).data;

      console.log('✅ Push token obtained:', token);

      // Save token to Supabase
      await this.savePushToken(token);

      return token;
    } catch (error) {
      console.error('❌ Error getting push token:', error);
      return null;
    }
  }

  static async savePushToken(token) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('❌ No user logged in');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          expo_push_token: token,
          push_token_updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        console.error('❌ Error saving push token:', error);
      } else {
        console.log('✅ Push token saved to database');
      }
    } catch (error) {
      console.error('❌ Error in savePushToken:', error);
    }
  }

  static async removePushToken() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          expo_push_token: null,
          push_token_updated_at: null
        })
        .eq('id', user.id);

      if (error) {
        console.error('❌ Error removing push token:', error);
      }
    } catch (error) {
      console.error('❌ Error in removePushToken:', error);
    }
  }

  static async setupNotificationListeners(navigation) {
    // Listen for notifications received while app is foreground
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received in foreground:', notification.request.content);
    });

    // Listen for notification responses (user taps notification)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('👆 Notification tapped:', data);

      // Handle navigation based on notification type
      this.handleNotificationNavigation(data, navigation);
    });

    return {
      receivedSubscription,
      responseSubscription
    };
  }

  static handleNotificationNavigation(data, navigation) {
    if (!navigation) return;

    switch (data.type) {
      case 'chat_message':
        if (data.senderId) {
          navigation.navigate('home', {
            screen: 'ChatConversationScreen',
            params: {
              friendId: data.senderId,
              friendName: data.senderName || 'Unknown'
            }
          });
        }
        break;

      case 'friend_request':
        navigation.navigate('home', {
          screen: 'FriendRequestsScreen'
        });
        break;

      case 'proximity':
        if (data.friendId) {
          navigation.navigate('home', {
            screen: 'ChatConversationScreen',
            params: {
              friendId: data.friendId,
              friendName: data.friendName || 'Friend'
            }
          });
        }
        break;

      default:
        console.log('Unknown notification type:', data.type);
    }
  }

  static async scheduleLocalNotification(title, body, data = {}) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
          badge: 1,
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error('❌ Error scheduling local notification:', error);
    }
  }
}
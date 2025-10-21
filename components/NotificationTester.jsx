import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { PushNotificationService } from '../lib/pushNotifications';

export default function NotificationTester() {
  const testLocalNotification = async () => {
    await PushNotificationService.scheduleLocalNotification(
      'Test Notification',
      'This is a test notification from Connecti!',
      { type: 'test', timestamp: Date.now() }
    );
    Alert.alert('Success', 'Test notification sent!');
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 20 }}>Push Notification Test</Text>
      
      <TouchableOpacity
        onPress={testLocalNotification}
        style={{
          backgroundColor: '#2196F3',
          padding: 15,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontSize: 16 }}>Send Test Notification</Text>
      </TouchableOpacity>
    </View>
  );
}
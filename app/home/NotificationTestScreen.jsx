// app/home/NotificationTestScreen.jsx - FCM DEVICE TOKENS
import React, { useState, useEffect } from "react";
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, 
  Platform, ScrollView, ActivityIndicator, TextInput 
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import ExpoPushTokenService from '../../services/ExpoPushTokenService';
import { storeFCMToken } from '../../services/GeofenceManager';

const API_URL = 'https://connecti-push-api.vercel.app/api/send-notification';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function NotificationTestScreen() {
  const router = useRouter();
  const [fcmDeviceToken, setFcmDeviceToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [remoteTitle, setRemoteTitle] = useState('Geofence Alert 📍');
  const [remoteBody, setRemoteBody] = useState('This works from a killed state!');
  const [tokenStoredForGeofencing, setTokenStoredForGeofencing] = useState(false);
  const [localNotificationsReady, setLocalNotificationsReady] = useState(false);
  const [tokenStatus, setTokenStatus] = useState(null);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;
      
      // Setup notification channels
      await setupNotificationChannels();
      setLocalNotificationsReady(true);
      
      // Get FCM Device Token
      await getFCMDeviceToken();
      
      // Get token status
      const status = await ExpoPushTokenService.getStatus();
      setTokenStatus(status);
      
      if (mounted) {
        setLoading(false);
      }
    };

    initialize();

    // Setup notification listener
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      Alert.alert("Notification Tapped", response.notification.request.content.title);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  async function setupNotificationChannels() {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
        });

        await Notifications.setNotificationChannelAsync('geofence-killed-alerts', {
          name: 'Geofence Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF0000',
          sound: 'default',
        });

        console.log('✅ Notification channels ready');
      } catch (e) {
        console.log('⚠️ Channel setup warning:', e.message);
      }
    }
  }

  async function getFCMDeviceToken() {
    if (!Device.isDevice) {
      console.log("ℹ️ Emulator detected - FCM Device Tokens not available");
      return;
    }

    try {
      // Request permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log("⚠️ Notification permission denied");
        return;
      }

      console.log('🔑 Fetching FCM Device Token...');
      
      // Get FCM Device Token (NOT Expo Push Token!)
      const token = await ExpoPushTokenService.getToken();
      
      if (token) {
        setFcmDeviceToken(token);
        
        // Store for geofencing
        const stored = await storeFCMToken(token);
        setTokenStoredForGeofencing(stored);
        
        console.log('✅ FCM Device Token obtained and stored');
        
        // Update status
        const status = await ExpoPushTokenService.getStatus();
        setTokenStatus(status);
      } else {
        console.log('⚠️ FCM Device Token not available');
        
        // Update status
        const status = await ExpoPushTokenService.getStatus();
        setTokenStatus(status);
      }
      
    } catch (error) {
      console.log('⚠️ FCM Device Token error:', error.message);
      
      // Update status
      const status = await ExpoPushTokenService.getStatus();
      setTokenStatus(status);
    }
  }

  async function handleForceRetry() {
    try {
      console.log('🔄 Force retrying FCM Device Token...');
      const token = await ExpoPushTokenService.forceRetry();
      
      if (token) {
        setFcmDeviceToken(token);
        const stored = await storeFCMToken(token);
        setTokenStoredForGeofencing(stored);
        
        const status = await ExpoPushTokenService.getStatus();
        setTokenStatus(status);
        
        Alert.alert('✅ Success!', 'FCM Device Token obtained successfully!');
      } else {
        Alert.alert('⚠️ Failed', 'Could not get FCM Device Token. Check Google Play Services.');
      }
    } catch (error) {
      Alert.alert('❌ Error', error.message);
    }
  }

  async function sendLocalNotification() {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📍 Local Notification',
          body: 'This works without remote token!',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      });
      
      Alert.alert("✅ Success", "Local notification sent! Close app to see it.");
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  }

  async function sendRemoteNotification() {
    if (!fcmDeviceToken) {
      Alert.alert(
        "No FCM Device Token", 
        "Remote notifications require FCM Device Token from Google Play Services.\n\n" +
        "Try the 'Force Retry' button."
      );
      return;
    }
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fcmDeviceToken,
          title: remoteTitle,
          body: remoteBody,
        }),
      });
      const result = await response.json();
      
      if (result.success) {
        Alert.alert("Success ✅", "Remote notification sent! Close the app to see it.");
      } else {
        Alert.alert("Error", result.message || "Failed to send notification");
      }
    } catch (error) {
      Alert.alert("API Error", error.message);
    }
  }

  async function sendGeofenceTestNotification() {
    if (!fcmDeviceToken) {
      // Fall back to local notification
      await sendLocalNotification();
      return;
    }
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fcmDeviceToken,
          title: '🎯 Zone Entered (Test)',
          body: 'Simulated geofence entry',
          data: {
            type: 'geofence_entry',
            zone: 'Test Zone',
            timestamp: new Date().toISOString(),
            appKilled: true,
          }
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        Alert.alert(
          "✅ Test Sent!", 
          "Close app completely to see the notification."
        );
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingText}>Setting up notifications...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero Section */}
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="notifications" size={48} color="#F59E0B" />
        </View>
        <Text style={styles.heroTitle}>Push Notifications</Text>
        <Text style={styles.heroSubtitle}>
          {localNotificationsReady 
            ? "Local notifications ready • Remote notifications " + (fcmDeviceToken ? "ready" : "pending")
            : "Setting up notification system..."
          }
        </Text>
      </View>

      {/* System Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle" size={20} color="#F59E0B" />
          <Text style={styles.cardTitle}>System Status</Text>
        </View>
        
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Local Notifications</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name="checkmark-circle" 
                size={16} 
                color="#10B981" 
              />
              <Text style={[styles.statusValue, { color: '#10B981' }]}>
                Ready
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>FCM Device Token</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={fcmDeviceToken ? "checkmark-circle" : "alert-circle"} 
                size={16} 
                color={fcmDeviceToken ? "#10B981" : "#F59E0B"} 
              />
              <Text style={[
                styles.statusValue,
                { color: fcmDeviceToken ? '#10B981' : '#F59E0B' }
              ]}>
                {fcmDeviceToken ? 'Available' : 'Not Available'}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Stored for Geofencing</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={tokenStoredForGeofencing ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={tokenStoredForGeofencing ? "#10B981" : "#9CA3AF"} 
              />
              <Text style={[
                styles.statusValue,
                { color: tokenStoredForGeofencing ? '#10B981' : '#9CA3AF' }
              ]}>
                {tokenStoredForGeofencing ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Device Type</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={Device.isDevice ? "checkmark-circle" : "alert-circle"} 
                size={16} 
                color={Device.isDevice ? "#10B981" : "#F59E0B"} 
              />
              <Text style={styles.statusValue}>
                {Device.isDevice ? 'Physical' : 'Emulator'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Token Status Details */}
      {tokenStatus && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="bug" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Debug Info</Text>
          </View>
          
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Has Token:</Text>
            <Text style={styles.debugValue}>{tokenStatus.hasToken ? 'Yes' : 'No'}</Text>
          </View>
          
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Cached Token:</Text>
            <Text style={styles.debugValue}>{tokenStatus.hasCachedToken ? 'Yes' : 'No'}</Text>
          </View>
          
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Token Type:</Text>
            <Text style={styles.debugValue}>{tokenStatus.tokenType}</Text>
          </View>
          
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Platform:</Text>
            <Text style={styles.debugValue}>{tokenStatus.platform}</Text>
          </View>
        </View>
      )}

      {/* FCM Device Token Card */}
      {fcmDeviceToken && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="key" size={20} color="#10B981" />
            <Text style={styles.cardTitle}>FCM Device Token</Text>
          </View>
          
          <View style={styles.tokenContainer}>
            <Text style={styles.tokenText} numberOfLines={3}>
              {fcmDeviceToken}
            </Text>
          </View>
          
          <TouchableOpacity 
            onPress={() => {
              Clipboard.setStringAsync(fcmDeviceToken);
              Alert.alert("Copied! 📋", "Token copied to clipboard");
            }}
            style={styles.button}
          >
            <Ionicons name="copy" size={20} color="#10B981" />
            <Text style={[styles.buttonText, { color: '#10B981' }]}>Copy Token</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info Box for No Token */}
      {!fcmDeviceToken && (
        <View style={styles.warningCard}>
          <Ionicons name="information-circle" size={32} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>FCM Device Token Not Available</Text>
            <Text style={styles.warningText}>
              {!Device.isDevice 
                ? "You're using an emulator. FCM Device Tokens require a physical device with Google Play Services."
                : "Could not get FCM Device Token.\n\n" +
                  "This might be due to:\n" +
                  "• Google Play Services not available/updating\n" +
                  "• Device just booted (wait 2-5 minutes)\n" +
                  "• Network connectivity issues\n" +
                  "• Invalid google-services.json configuration\n\n" +
                  "Try the 'Force Retry' button below."
              }
            </Text>
            
            {Device.isDevice && (
              <TouchableOpacity 
                onPress={handleForceRetry}
                style={[styles.button, { marginTop: 12, backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={[styles.buttonText, { color: '#FFF' }]}>
                  Force Retry
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Test Notifications */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flask" size={20} color="#F59E0B" />
          <Text style={styles.cardTitle}>Test Notifications</Text>
        </View>
        
        {/* Local Notification Test */}
        <TouchableOpacity 
          style={[styles.button, styles.localButton]} 
          onPress={sendLocalNotification}
        >
          <Ionicons name="notifications" size={20} color="#FFF" />
          <Text style={[styles.buttonText, { color: '#FFF' }]}>
            Send Local Notification
          </Text>
        </TouchableOpacity>
        
        {/* Remote Notification Test */}
        {fcmDeviceToken && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Title</Text>
              <TextInput 
                style={styles.input} 
                value={remoteTitle} 
                onChangeText={setRemoteTitle}
                placeholder="Notification title"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Message</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                value={remoteBody} 
                onChangeText={setRemoteBody}
                placeholder="Notification body"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>
            
            <TouchableOpacity 
              style={[styles.button, styles.remoteButton]} 
              onPress={sendRemoteNotification}
            >
              <Ionicons name="paper-plane" size={20} color="#FFF" />
              <Text style={[styles.buttonText, { color: '#FFF' }]}>
                Send Remote Notification
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.geofenceButton]} 
              onPress={sendGeofenceTestNotification}
            >
              <Ionicons name="location" size={20} color="#FFF" />
              <Text style={[styles.buttonText, { color: '#FFF' }]}>
                Test Geofence Alert
              </Text>
            </TouchableOpacity>
          </>
        )}
        
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>
            {fcmDeviceToken 
              ? "✅ FCM Device Tokens work with Google Play Services!\nClose app completely to test background notifications."
              : "Local notifications work without token. Remote needs FCM Device Token from Google Play Services."
            }
          </Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  heroCard: {
    backgroundColor: '#FFFBEB',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#B45309',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  tokenContainer: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tokenText: {
    fontSize: 11,
    color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
  },
  debugBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  debugLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  debugValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusItem: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  localButton: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  remoteButton: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  geofenceButton: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F59E0B',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
});
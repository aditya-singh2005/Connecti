// app/home/NotificationTestScreen.jsx - FCM NOTIFICATIONS
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
  const [fcmToken, setFcmToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [remoteTitle, setRemoteTitle] = useState('Geofence Alert 📍');
  const [remoteBody, setRemoteBody] = useState('This works from a killed state!');

  useEffect(() => {
    let mounted = true;
    let notificationListener = null;

    const initialize = async () => {
      if (!mounted) return;
      
      await setupNotificationChannels();
      await getFcmTokenWithRetry();
      
      if (mounted) {
        setLoading(false);
      }
    };

    initialize();

    try {
      notificationListener = Notifications.addNotificationResponseReceivedListener(response => {
        Alert.alert("Notification Tapped", response.notification.request.content.title);
      });
    } catch (e) {
      console.log('Notification listener setup failed:', e);
    }

    return () => {
      mounted = false;
      if (notificationListener && typeof notificationListener.remove === 'function') {
        try {
          notificationListener.remove();
        } catch (e) {
          console.log('Notification cleanup failed:', e);
        }
      }
    };
  }, []);

  async function setupNotificationChannels() {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
        });
      } catch (e) {
        console.log('Channel setup failed:', e);
      }
    }
  }

  async function getFcmTokenWithRetry(retries = 3, delay = 2000) {
    if (!Device.isDevice) {
      console.log("Not a physical device, skipping token fetch.");
      setLoading(false);
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log("Permission not granted");
        setLoading(false);
        return;
      }

      for (let i = 0; i < retries; i++) {
        try {
          console.log(`Attempting to fetch FCM token (Try ${i + 1})...`);
          const tokenData = await Notifications.getDevicePushTokenAsync();
          setFcmToken(tokenData.data);
          console.log("✅ Success! FCM Token:", tokenData.data);
          setIsRetrying(false);
          return;
        } catch (e) {
          console.log(`⚠️ Token fetch attempt ${i + 1} failed:`, e.message);
          if (i < retries - 1) {
            setIsRetrying(true);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            setIsRetrying(false);
            console.error("❌ Final attempt failed. Google Play Services might be busy.");
          }
        }
      }
    } catch (error) {
      console.error('Error in token fetch:', error);
      setIsRetrying(false);
    }
  }

  async function sendRemoteNotification() {
    if (!fcmToken) {
      Alert.alert("Error", "No FCM token available yet.");
      return;
    }
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fcmToken,
          title: remoteTitle,
          body: remoteBody,
        }),
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert("Success ✅", "Notification sent! Close the app to see it.");
      } else {
        Alert.alert("Error", result.message || "Failed to send notification");
      }
    } catch (error) {
      Alert.alert("API Error", error.message);
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
        <Text style={styles.headerTitle}>FCM Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero Section */}
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="notifications" size={48} color="#F59E0B" />
        </View>
        <Text style={styles.heroTitle}>Push Notifications</Text>
        <Text style={styles.heroSubtitle}>
          Test Firebase Cloud Messaging for friend proximity alerts
        </Text>
      </View>

      {/* FCM Token Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="key" size={20} color="#F59E0B" />
          <Text style={styles.cardTitle}>FCM Device Token</Text>
        </View>
        
        {fcmToken ? (
          <>
            <View style={styles.tokenContainer}>
              <Text style={styles.tokenText} numberOfLines={3}>
                {fcmToken}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                Clipboard.setStringAsync(fcmToken);
                Alert.alert("Copied! 📋", "Token copied to clipboard");
              }}
              style={styles.button}
            >
              <Ionicons name="copy" size={20} color="#F59E0B" />
              <Text style={styles.buttonText}>Copy Token</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
              <Text style={styles.errorText}>
                {isRetrying 
                  ? "Connecting to Google Play Services..." 
                  : "Token unavailable. Try restarting the app."
                }
              </Text>
            </View>
            {!isRetrying && (
              <TouchableOpacity 
                onPress={() => getFcmTokenWithRetry()}
                style={[styles.button, styles.retryButton]}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={[styles.buttonText, { color: '#FFF' }]}>Retry Fetch</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Send Test Notification */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="send" size={20} color="#F59E0B" />
          <Text style={styles.cardTitle}>Send Test Notification</Text>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>📝 Title</Text>
          <TextInput 
            style={styles.input} 
            value={remoteTitle} 
            onChangeText={setRemoteTitle}
            placeholder="Notification title"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>💬 Message</Text>
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
          style={[
            styles.button, 
            styles.sendButton,
            !fcmToken && styles.buttonDisabled
          ]} 
          onPress={sendRemoteNotification}
          disabled={!fcmToken}
        >
          <Ionicons name="paper-plane" size={20} color="#FFF" />
          <Text style={[styles.buttonText, { color: '#FFF' }]}>
            Send Remote Notification
          </Text>
        </TouchableOpacity>
        
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>
            Close the app completely to test notifications in killed state
          </Text>
        </View>
      </View>

      {/* System Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle" size={20} color="#F59E0B" />
          <Text style={styles.cardTitle}>System Status</Text>
        </View>
        
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Device Type</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={Device.isDevice ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={Device.isDevice ? "#10B981" : "#EF4444"} 
              />
              <Text style={styles.statusValue}>
                {Device.isDevice ? 'Physical' : 'Emulator'}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>FCM Token</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={fcmToken ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={fcmToken ? "#10B981" : "#EF4444"} 
              />
              <Text style={styles.statusValue}>
                {fcmToken ? 'Available' : 'Missing'}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Platform</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name={Platform.OS === 'android' ? 'logo-android' : 'logo-apple'} 
                size={16} 
                color="#6B7280" 
              />
              <Text style={styles.statusValue}>
                {Platform.OS}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>API Status</Text>
            <View style={styles.statusBadge}>
              <Ionicons 
                name="server" 
                size={16} 
                color="#10B981" 
              />
              <Text style={styles.statusValue}>Ready</Text>
            </View>
          </View>
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

  // Hero Card
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

  // Cards
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
  
  // Token Display
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
  
  // Error Container
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  
  // Input Group
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
  
  // Buttons
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
  },
  retryButton: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  sendButton: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#E5E7EB',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F59E0B',
  },
  
  // Info Box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
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
  
  // Status Grid
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
});
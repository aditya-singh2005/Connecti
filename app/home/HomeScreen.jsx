import React, { useState, useEffect } from "react";
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, 
  Platform, ScrollView, ActivityIndicator, TextInput 
} from "react-native";
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

export default function HomeScreen() {
  const [fcmToken, setFcmToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [remoteTitle, setRemoteTitle] = useState('Geofence Alert 📍');
  const [remoteBody, setRemoteBody] = useState('This works from a killed state!');

  useEffect(() => {
    // Initial Setup
    const initialize = async () => {
      await setupNotificationChannels();
      await getFcmTokenWithRetry();
      setLoading(false);
    };

    initialize();

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      Alert.alert("Notification Tapped", response.notification.request.content.title);
    });

    return () => Notifications.removeNotificationSubscription(responseListener);
  }, []);

  async function setupNotificationChannels() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }
  }

  // 🔥 NEW: Retry logic to fix SERVICE_NOT_AVAILABLE
  async function getFcmTokenWithRetry(retries = 3, delay = 2000) {
    if (!Device.isDevice) {
      console.log("Not a physical device, skipping token fetch.");
      return;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log("Permission not granted");
      return;
    }

    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Attempting to fetch FCM token (Try ${i + 1})...`);
        const tokenData = await Notifications.getDevicePushTokenAsync();
        setFcmToken(tokenData.data);
        console.log("✅ Success! FCM Token:", tokenData.data);
        return; // Exit loop on success
      } catch (e) {
        console.log(`⚠️ Token fetch attempt ${i + 1} failed:`, e.message);
        if (i < retries - 1) {
          setIsRetrying(true);
          await new Promise(resolve => setTimeout(resolve, delay)); // Wait before next try
        } else {
          setIsRetrying(false);
          console.error("❌ Final attempt failed. Google Play Services might be busy.");
        }
      }
    }
  }

  async function sendRemoteNotification() {
    if (!fcmToken) return Alert.alert("Error", "No FCM token available yet.");
    
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
      if (result.success) Alert.alert("Success", "Check your notifications after closing the app.");
    } catch (error) {
      Alert.alert("API Error", error.message);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366F1" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>FCM v1 Control Panel</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Native FCM Token:</Text>
        {fcmToken ? (
          <Text style={styles.tokenText}>{fcmToken}</Text>
        ) : (
          <Text style={styles.errorText}>{isRetrying ? "Retrying connection to Google..." : "Token unavailable. Try restarting the app."}</Text>
        )}
        
        {fcmToken && (
          <TouchableOpacity 
            onPress={() => Clipboard.setStringAsync(fcmToken)}
            style={styles.copyBtn}
          >
            <Text style={styles.copyBtnText}>Copy Token</Text>
          </TouchableOpacity>
        )}

        {!fcmToken && !isRetrying && (
          <TouchableOpacity 
            onPress={() => getFcmTokenWithRetry()}
            style={[styles.copyBtn, {marginTop: 10}]}
          >
            <Text style={styles.copyBtnText}>Retry Manual Fetch</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <TextInput style={styles.input} value={remoteTitle} onChangeText={setRemoteTitle} />
        <TextInput style={styles.input} value={remoteBody} onChangeText={setRemoteBody} />
        <TouchableOpacity style={styles.sendBtn} onPress={sendRemoteNotification}>
          <Text style={styles.sendBtnText}>Send Remote Test</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f9' },
  content: { padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 3 },
  label: { fontWeight: '600', marginBottom: 5 },
  tokenText: { fontSize: 10, color: '#444', marginBottom: 10, backgroundColor: '#eee', padding: 5 },
  errorText: { color: 'orange', fontSize: 12, marginBottom: 10 },
  copyBtn: { backgroundColor: '#eef2ff', padding: 10, borderRadius: 5, alignItems: 'center' },
  copyBtnText: { color: '#6366f1', fontWeight: 'bold' },
  input: { borderBottomWidth: 1, borderColor: '#ddd', marginBottom: 15, padding: 8 },
  sendBtn: { backgroundColor: '#6366f1', padding: 15, borderRadius: 8, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: 'bold' }
});
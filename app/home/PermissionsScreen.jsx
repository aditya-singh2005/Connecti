// app/home/PermissionsScreen.jsx - Honest Status + Settings Guide
import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Linking,
  Platform,
  PermissionsAndroid,
  AppState,
  NativeModules
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

const { BluetoothAdapter } = NativeModules;

export default function PermissionsScreen() {
  const router = useRouter();
  
  const [status, setStatus] = useState({
    bluetooth: false,
    location: false,
    notifications: false,
  });

  useEffect(() => {
    checkAllStatus();
    
    // Real-time status monitoring
    const interval = setInterval(() => {
      checkAllStatus();
    }, 1000);

    // Monitor app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAllStatus();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  const checkAllStatus = async () => {
    const newStatus = {};

    try {
      // BLUETOOTH STATUS - Check both permission AND hardware state
      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version;
        let hasPermission = false;
        let hardwareEnabled = false;

        // Check permission
        if (androidVersion >= 31) {
          const scanGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
          );
          const connectGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
          hasPermission = scanGranted && connectGranted;
        } else {
          hasPermission = true;
        }

        // Check hardware state using react-native-bluetooth-state-manager
        try {
          const BluetoothStateManager = require('react-native-bluetooth-state-manager').default;
          const state = await BluetoothStateManager.getState();
          hardwareEnabled = state === 'PoweredOn';
        } catch (e) {
          // Fallback: assume enabled if we can't check
          hardwareEnabled = hasPermission;
        }

        newStatus.bluetooth = hasPermission && hardwareEnabled;
      } else {
        // iOS - Check hardware state
        try {
          const BluetoothStateManager = require('react-native-bluetooth-state-manager').default;
          const state = await BluetoothStateManager.getState();
          newStatus.bluetooth = state === 'PoweredOn';
        } catch (e) {
          newStatus.bluetooth = true; // Fallback
        }
      }

      // LOCATION STATUS - Check both permission AND hardware state
      if (Platform.OS === 'android') {
        const locationGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        // Check if Location services are enabled
        const locationEnabled = await Location.hasServicesEnabledAsync();
        
        newStatus.location = locationGranted && locationEnabled;
      } else {
        const { status: locStatus } = await Location.getForegroundPermissionsAsync();
        const locationEnabled = await Location.hasServicesEnabledAsync();
        
        newStatus.location = locStatus === 'granted' && locationEnabled;
      }

      // NOTIFICATIONS STATUS
      const notifStatus = await Notifications.getPermissionsAsync();
      newStatus.notifications = notifStatus.status === 'granted';

      setStatus(newStatus);
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  const openPermissionSettings = (permissionType) => {
    let title = '';
    let message = '';

    switch(permissionType) {
      case 'bluetooth':
        title = 'Enable Bluetooth';
        message = Platform.OS === 'android' 
          ? '1. Turn ON Bluetooth in Quick Settings or Settings\n2. Go to Settings → Apps → Connecti → Permissions → Enable "Nearby devices"'
          : '1. Turn ON Bluetooth in Control Center or Settings\n2. Go to Settings → Connecti → Enable Bluetooth';
        break;
      case 'location':
        title = 'Enable Location';
        message = Platform.OS === 'android'
          ? '1. Turn ON Location in Quick Settings or Settings\n2. Go to Settings → Apps → Connecti → Permissions → Location → Allow all the time or While using the app'
          : '1. Turn ON Location Services in Settings → Privacy\n2. Go to Settings → Connecti → Location → While Using the App';
        break;
      case 'notifications':
        title = 'Enable Notifications';
        message = Platform.OS === 'android'
          ? 'Go to Settings → Apps → Connecti → Notifications → Enable All notifications'
          : 'Go to Settings → Connecti → Notifications → Allow Notifications';
        break;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    );
  };

  const PermissionCard = ({ icon, title, description, isEnabled, onPress, color }) => (
    <View style={styles.permissionCard}>
      <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      
      <View style={styles.permissionContent}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionDescription}>{description}</Text>
        
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isEnabled ? '#10B981' : '#EF4444' }]} />
          <Text style={[styles.statusText, { color: isEnabled ? '#10B981' : '#EF4444' }]}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.actionButton, isEnabled && styles.actionButtonEnabled]}
        onPress={onPress}
      >
        <Ionicons 
          name={isEnabled ? "checkmark" : "settings-outline"} 
          size={20} 
          color={isEnabled ? '#10B981' : '#FFFFFF'} 
        />
      </TouchableOpacity>
    </View>
  );

  const allEnabled = status.bluetooth && status.location && status.notifications;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permissions</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusIndicator, { backgroundColor: allEnabled ? '#10B981' : '#F59E0B' }]}>
            <Ionicons 
              name={allEnabled ? "checkmark-circle" : "alert-circle"} 
              size={48} 
              color="white" 
            />
          </View>
          <Text style={styles.statusTitle}>
            {allEnabled ? 'All Set!' : 'Setup Required'}
          </Text>
          <Text style={styles.statusDescription}>
            {allEnabled 
              ? 'All permissions are enabled. You can detect friends nearby!'
              : 'Please enable the required permissions below to start detecting friends.'}
          </Text>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#6366F1" />
          <Text style={styles.infoBannerText}>
            Tap the settings icon on each card to enable permissions
          </Text>
        </View>

        {/* Permissions List */}
        <View style={styles.permissionsContainer}>
          <PermissionCard
            icon="bluetooth"
            title="Bluetooth"
            description="Detect friends nearby using Bluetooth"
            isEnabled={status.bluetooth}
            onPress={() => openPermissionSettings('bluetooth')}
            color="#6366F1"
          />

          <PermissionCard
            icon="location"
            title="Location"
            description="Required for Bluetooth scanning on Android"
            isEnabled={status.location}
            onPress={() => openPermissionSettings('location')}
            color="#EC4899"
          />

          <PermissionCard
            icon="notifications"
            title="Notifications"
            description="Get alerts when friends are nearby"
            isEnabled={status.notifications}
            onPress={() => openPermissionSettings('notifications')}
            color="#F59E0B"
          />
        </View>

        {/* Quick Settings Button */}
        {!allEnabled && (
          <TouchableOpacity 
            style={styles.quickSettingsButton}
            onPress={() => Linking.openSettings()}
          >
            <Ionicons name="settings" size={20} color="#FFFFFF" />
            <Text style={styles.quickSettingsText}>Open App Settings</Text>
          </TouchableOpacity>
        )}

        {/* Help Card */}
        <View style={styles.helpCard}>
          <Ionicons name="help-circle" size={24} color="#6B7280" />
          <View style={styles.helpContent}>
            <Text style={styles.helpTitle}>How to Enable Permissions</Text>
            <Text style={styles.helpText}>
              1. Tap the settings icon on any disabled permission{'\n'}
              2. Follow the instructions to enable in Settings{'\n'}
              3. Return here to see the updated status
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statusIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  statusDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#4F46E5',
    lineHeight: 18,
  },
  permissionsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonEnabled: {
    backgroundColor: '#D1FAE5',
  },
  quickSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  quickSettingsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helpCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  helpContent: {
    flex: 1,
    marginLeft: 12,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
});
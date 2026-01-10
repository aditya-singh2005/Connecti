// app/home/PermissionsScreen.jsx - Complete Permissions Management
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
  Switch,
  PermissionsAndroid
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { supabase } from "../../lib/supabase";

export default function PermissionsScreen() {
  const router = useRouter();
  
  // Permission states
  const [permissions, setPermissions] = useState({
    bluetooth: false,
    bluetoothScan: false,
    bluetoothConnect: false,
    location: false,
    locationBackground: false,
    camera: false,
    notifications: false,
    proximityAlerts: false,
  });

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    initializePermissions();
    
    // Refresh permissions periodically to catch changes from Settings
    const interval = setInterval(() => {
      checkAllPermissions();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const initializePermissions = async () => {
    setLoading(true);
    
    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      await loadProximitySettings(user.id);
    }

    await checkAllPermissions();
    setLoading(false);
  };

  const loadProximitySettings = async (uid) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('proximity_notifications_enabled')
        .eq('id', uid)
        .single();

      if (!error && data) {
        setPermissions(prev => ({
          ...prev,
          proximityAlerts: data.proximity_notifications_enabled || false
        }));
      }
    } catch (error) {
      console.error('Error loading proximity settings:', error);
    }
  };

  const checkAllPermissions = async () => {
    const newPermissions = { ...permissions };

    try {
      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version;

        // Bluetooth permissions (Android 12+)
        if (androidVersion >= 31) {
          try {
            const scanGranted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
            );
            const connectGranted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            );
            
            newPermissions.bluetoothScan = scanGranted;
            newPermissions.bluetoothConnect = connectGranted;
            newPermissions.bluetooth = scanGranted && connectGranted;
          } catch (error) {
            // If check fails, assume permission not needed
            newPermissions.bluetooth = true;
            newPermissions.bluetoothScan = true;
            newPermissions.bluetoothConnect = true;
          }
        } else {
          // Older Android - no runtime permission needed
          newPermissions.bluetooth = true;
          newPermissions.bluetoothScan = true;
          newPermissions.bluetoothConnect = true;
        }

        // Location permission
        try {
          const locationGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          newPermissions.location = locationGranted;
        } catch (error) {
          console.error('Error checking location:', error);
        }

        // Background location (Android 10+)
        if (androidVersion >= 29) {
          try {
            const bgLocationGranted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
            );
            newPermissions.locationBackground = bgLocationGranted;
          } catch (error) {
            console.error('Error checking background location:', error);
          }
        } else {
          // Auto-granted on older versions
          newPermissions.locationBackground = newPermissions.location;
        }

        // Camera permission
        try {
          const cameraGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.CAMERA
          );
          newPermissions.camera = cameraGranted;
        } catch (error) {
          console.error('Error checking camera:', error);
        }
      } else {
        // iOS permissions
        
        // Location
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          newPermissions.location = status === 'granted';
          
          const bgStatus = await Location.getBackgroundPermissionsAsync();
          newPermissions.locationBackground = bgStatus.status === 'granted';
        } catch (error) {
          console.error('Error checking iOS location:', error);
        }

        // Camera
        try {
          const { status } = await Camera.getCameraPermissionsAsync();
          newPermissions.camera = status === 'granted';
        } catch (error) {
          console.error('Error checking camera:', error);
        }

        // Bluetooth - iOS doesn't need explicit permission
        newPermissions.bluetooth = true;
        newPermissions.bluetoothScan = true;
        newPermissions.bluetoothConnect = true;
      }

      // Notifications (cross-platform)
      try {
        const notifStatus = await Notifications.getPermissionsAsync();
        newPermissions.notifications = notifStatus.status === 'granted';
      } catch (error) {
        console.error('Error checking notifications:', error);
      }

      setPermissions(newPermissions);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  // BLUETOOTH
  const requestBluetoothPermissions = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Bluetooth Available',
        'Bluetooth is available on iOS. Ensure it\'s enabled in device settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    const androidVersion = Platform.Version;
    if (androidVersion >= 31) {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (allGranted) {
          Alert.alert('Success', 'Bluetooth permissions granted!');
          await checkAllPermissions();
        } else {
          Alert.alert(
            'Permission Denied',
            'Bluetooth permissions are required for friend detection.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        }
      } catch (error) {
        console.error('Error requesting Bluetooth:', error);
        Alert.alert('Error', 'Failed to request Bluetooth permissions.');
      }
    } else {
      Alert.alert('Info', 'Bluetooth is available. Make sure it\'s turned on in Settings.');
    }
  };

  // LOCATION
  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'Connecti needs location to detect nearby friends via Bluetooth.',
            buttonPositive: 'OK',
          }
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Success', 'Location permission granted!');
          await checkAllPermissions();
        } else {
          Alert.alert(
            'Permission Denied',
            'Location is required for Bluetooth scanning.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        }
      } catch (error) {
        console.error('Error requesting location:', error);
      }
    } else {
      // iOS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        Alert.alert('Success', 'Location permission granted!');
        await checkAllPermissions();
      } else {
        Alert.alert(
          'Permission Denied',
          'Location is required for Bluetooth scanning.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    }
  };

  // BACKGROUND LOCATION
  const requestBackgroundLocation = async () => {
    if (Platform.OS === 'android') {
      const androidVersion = Platform.Version;
      
      if (androidVersion >= 29) {
        const foregroundGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (!foregroundGranted) {
          Alert.alert(
            'Foreground Location Required',
            'Please grant location permission first.',
            [{ text: 'OK', onPress: () => requestLocationPermission() }]
          );
          return;
        }

        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
              title: 'Background Location',
              message: 'Allow Connecti to detect friends when app is in background?',
              buttonPositive: 'OK',
            }
          );

          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Success', 'Background location granted!');
            await checkAllPermissions();
          } else {
            Alert.alert(
              'Permission Denied', 
              'You can enable it later in Settings if needed.',
              [
                { text: 'OK', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() }
              ]
            );
          }
        } catch (error) {
          console.error('Error requesting background location:', error);
        }
      } else {
        Alert.alert('Info', 'Background location is automatically available on your Android version.');
      }
    } else {
      // iOS
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status === 'granted') {
        Alert.alert('Success', 'Background location granted!');
        await checkAllPermissions();
      } else {
        Alert.alert(
          'Permission Denied',
          'Background location was not granted.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    }
  };

  // CAMERA
  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Connecti needs camera access to scan QR codes for adding friends.',
            buttonPositive: 'OK',
          }
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Success', 'Camera permission granted!');
          await checkAllPermissions();
        } else {
          Alert.alert(
            'Permission Denied',
            'Camera is needed to scan QR codes.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        }
      } catch (error) {
        console.error('Error requesting camera:', error);
      }
    } else {
      // iOS
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status === 'granted') {
        Alert.alert('Success', 'Camera permission granted!');
        await checkAllPermissions();
      } else {
        Alert.alert(
          'Permission Denied',
          'Camera is needed to scan QR codes.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    }
  };

  // NOTIFICATIONS
  const requestNotificationPermission = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        Alert.alert('Success', 'Notification permission granted!');
        await checkAllPermissions();
      } else {
        Alert.alert(
          'Permission Denied',
          'Notifications are required for friend alerts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting notifications:', error);
    }
  };

  // PROXIMITY ALERTS TOGGLE
  const toggleProximityAlerts = async (value) => {
    if (!userId) return;

    if (value && !permissions.notifications) {
      Alert.alert(
        'Notifications Required',
        'Please enable notifications first to receive proximity alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable Notifications', onPress: () => requestNotificationPermission() }
        ]
      );
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ proximity_notifications_enabled: value })
        .eq('id', userId);

      if (error) {
        console.error('Error updating proximity settings:', error);
        Alert.alert('Error', 'Failed to update proximity alert settings.');
        return;
      }

      setPermissions(prev => ({ ...prev, proximityAlerts: value }));
      Alert.alert(
        'Success',
        value 
          ? 'Proximity alerts enabled! You\'ll be notified when friends are nearby.'
          : 'Proximity alerts disabled.'
      );
    } catch (error) {
      console.error('Error toggling proximity alerts:', error);
    }
  };

  const PermissionCard = ({ 
    icon, 
    title, 
    description, 
    granted, 
    onPress, 
    isToggle = false,
    toggleValue = false,
    onToggle = null,
    required = true
  }) => (
    <View style={styles.permissionCard}>
      <View style={[styles.iconContainer, { backgroundColor: granted ? '#ECFDF5' : '#FEF2F2' }]}>
        <Ionicons 
          name={icon} 
          size={24} 
          color={granted ? '#10B981' : '#EF4444'} 
        />
      </View>
      
      <View style={styles.permissionInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.permissionTitle}>{title}</Text>
          {required && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Required</Text>
            </View>
          )}
        </View>
        <Text style={styles.permissionDescription}>{description}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: granted ? '#10B981' : '#EF4444' }]} />
          <Text style={[styles.statusText, { color: granted ? '#10B981' : '#EF4444' }]}>
            {granted ? 'Granted' : 'Not Granted'}
          </Text>
        </View>
      </View>

      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
          thumbColor={toggleValue ? '#10B981' : '#F3F4F6'}
        />
      ) : (
        <TouchableOpacity 
          style={[styles.actionButton, granted && styles.actionButtonGranted]}
          onPress={onPress}
        >
          <Text style={[styles.actionButtonText, granted && styles.actionButtonTextGranted]}>
            {granted ? 'Settings' : 'Enable'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#2D3436" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permissions</Text>
        <View style={styles.backButton} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={24} color="#4A90E2" />
        <Text style={styles.infoBannerText}>
          Connecti needs these permissions to help you find and connect with friends nearby.
        </Text>
      </View>

      {/* Bluetooth Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔵 Bluetooth</Text>
        <Text style={styles.sectionSubtitle}>Required for friend detection</Text>
        
        {Platform.OS === 'android' && Platform.Version >= 31 ? (
          <>
            <PermissionCard
              icon="bluetooth"
              title="Bluetooth Scan"
              description="Scan for nearby Bluetooth devices to detect friends"
              granted={permissions.bluetoothScan}
              onPress={permissions.bluetoothScan ? () => Linking.openSettings() : requestBluetoothPermissions}
            />
            
            <PermissionCard
              icon="bluetooth"
              title="Bluetooth Connect"
              description="Connect to Bluetooth devices for friend detection"
              granted={permissions.bluetoothConnect}
              onPress={permissions.bluetoothConnect ? () => Linking.openSettings() : requestBluetoothPermissions}
            />
          </>
        ) : (
          <PermissionCard
            icon="bluetooth"
            title="Bluetooth"
            description="Access Bluetooth to find friends nearby"
            granted={permissions.bluetooth}
            onPress={() => {
              if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
              } else {
                Linking.openSettings();
              }
            }}
          />
        )}
      </View>

      {/* Location Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 Location</Text>
        <Text style={styles.sectionSubtitle}>Required for Bluetooth scanning</Text>
        
        <PermissionCard
          icon="location"
          title="Location Access"
          description="Needed for Bluetooth Low Energy scanning"
          granted={permissions.location}
          onPress={permissions.location ? () => Linking.openSettings() : requestLocationPermission}
        />
        
        <PermissionCard
          icon="navigate"
          title="Background Location"
          description="Detect friends even when app is in background"
          granted={permissions.locationBackground}
          onPress={permissions.locationBackground ? () => Linking.openSettings() : requestBackgroundLocation}
          required={false}
        />
      </View>

      {/* Camera Permission */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📷 Camera</Text>
        <Text style={styles.sectionSubtitle}>For QR code scanning</Text>
        
        <PermissionCard
          icon="camera"
          title="Camera Access"
          description="Scan QR codes to quickly add friends"
          granted={permissions.camera}
          onPress={permissions.camera ? () => Linking.openSettings() : requestCameraPermission}
        />
      </View>

      {/* Notification Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔔 Notifications</Text>
        <Text style={styles.sectionSubtitle}>Stay updated about nearby friends</Text>
        
        <PermissionCard
          icon="notifications"
          title="Push Notifications"
          description="Receive alerts about nearby friends and messages"
          granted={permissions.notifications}
          onPress={permissions.notifications ? () => Linking.openSettings() : requestNotificationPermission}
        />
        
        <PermissionCard
          icon="radio"
          title="Proximity Alerts"
          description="Get notified when friends are detected nearby"
          granted={permissions.proximityAlerts}
          onPress={() => {}}
          isToggle={true}
          toggleValue={permissions.proximityAlerts}
          onToggle={toggleProximityAlerts}
          required={false}
        />
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => {
            Alert.alert(
              'Grant All Permissions',
              'This will guide you through granting all required permissions.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Start', 
                  onPress: async () => {
                    if (!permissions.bluetooth) await requestBluetoothPermissions();
                    if (!permissions.location) await requestLocationPermission();
                    if (!permissions.camera) await requestCameraPermission();
                    if (!permissions.notifications) await requestNotificationPermission();
                  }
                }
              ]
            );
          }}
        >
          <Ionicons name="checkmark-done" size={20} color="white" />
          <Text style={styles.quickActionText}>Grant All Required</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.quickActionButton, styles.quickActionSecondary]}
          onPress={() => Linking.openSettings()}
        >
          <Ionicons name="settings" size={20} color="#4A90E2" />
          <Text style={[styles.quickActionText, styles.quickActionTextSecondary]}>
            System Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Permission Status Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Permission Status</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Bluetooth:</Text>
          <Text style={[styles.summaryValue, { color: permissions.bluetooth ? '#10B981' : '#EF4444' }]}>
            {permissions.bluetooth ? '✓ Enabled' : '✗ Disabled'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Location:</Text>
          <Text style={[styles.summaryValue, { color: permissions.location ? '#10B981' : '#EF4444' }]}>
            {permissions.location ? '✓ Enabled' : '✗ Disabled'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Camera:</Text>
          <Text style={[styles.summaryValue, { color: permissions.camera ? '#10B981' : '#EF4444' }]}>
            {permissions.camera ? '✓ Enabled' : '✗ Disabled'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Notifications:</Text>
          <Text style={[styles.summaryValue, { color: permissions.notifications ? '#10B981' : '#EF4444' }]}>
            {permissions.notifications ? '✓ Enabled' : '✗ Disabled'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Proximity Alerts:</Text>
          <Text style={[styles.summaryValue, { color: permissions.proximityAlerts ? '#10B981' : '#9CA3AF' }]}>
            {permissions.proximityAlerts ? '✓ On' : '○ Off'}
          </Text>
        </View>
      </View>

      {/* Bottom Padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#FFF',
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
    color: '#2D3436',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  permissionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permissionInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
  },
  requiredBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF4444',
  },
  permissionDescription: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
    marginBottom: 6,
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
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionButtonGranted: {
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextGranted: {
    color: '#6B7280',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#4A90E2',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickActionSecondary: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  quickActionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  quickActionTextSecondary: {
    color: '#4A90E2',
  },
  summaryCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginTop: 24,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  }
});
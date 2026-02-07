// app/home/PermissionsScreen.jsx - COMPREHENSIVE PERMISSION HANDLER
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';

export default function PermissionsScreen() {
  const router = useRouter();
  const [permissions, setPermissions] = useState({
    location: 'unknown',
    backgroundLocation: 'unknown',
    preciseLocation: 'unknown',
    notifications: 'unknown',
    batteryOptimization: 'unknown',
    autoStart: 'unknown',
  });

  useEffect(() => {
    checkAllPermissions();
  }, []);

  async function checkAllPermissions() {
    try {
      // Check location permissions
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      
      // Check notification permission
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      
      setPermissions({
        location: fgStatus,
        backgroundLocation: bgStatus,
        preciseLocation: fgStatus === 'granted' ? 'granted' : 'denied',
        notifications: notifStatus,
        batteryOptimization: 'unknown', // Can't check programmatically
        autoStart: 'unknown', // Can't check programmatically
      });
      
    } catch (error) {
      console.error('Permission check error:', error);
    }
  }

  async function requestLocationPermission() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        Alert.alert(
          '✅ Location Permission Granted',
          'Now we need BACKGROUND location permission for killed-state geofencing.',
          [
            {
              text: 'Grant Background',
              onPress: () => requestBackgroundPermission(),
            },
            { text: 'Later', style: 'cancel' }
          ]
        );
      } else {
        Alert.alert(
          '❌ Permission Denied',
          'Location permission is required for geofencing.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
      
      await checkAllPermissions();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  }

  async function requestBackgroundPermission() {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      
      if (status === 'granted') {
        Alert.alert(
          '✅ Background Location Granted!',
          'Perfect! Now geofencing will work even when the app is closed.\n\n' +
          'Next, please configure:\n' +
          '1. Battery Optimization (disable)\n' +
          '2. Auto-Start (enable)',
          [{ text: 'Configure Now', onPress: () => openBatterySettings() }]
        );
      } else {
        Alert.alert(
          '⚠️ Background Location Required',
          'For killed-state geofencing, you must:\n\n' +
          '1. Open Settings\n' +
          '2. Find Connecti app\n' +
          '3. Location → "Allow all the time"\n' +
          '4. Enable "Use precise location"',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
      
      await checkAllPermissions();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  }

  async function requestNotificationPermission() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status === 'granted') {
        Alert.alert('✅ Notifications Enabled', 'You will receive geofence alerts!');
      } else {
        Alert.alert(
          '❌ Notifications Denied',
          'You won\'t receive geofence entry alerts.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
      
      await checkAllPermissions();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  }

  function openBatterySettings() {
    if (Platform.OS === 'android') {
      Alert.alert(
        'Battery Optimization Settings',
        'You will be taken to battery optimization settings.\n\n' +
        '1. Find "Connecti" in the list\n' +
        '2. Tap it and select "Don\'t optimize"\n' +
        '3. This allows geofencing in killed state',
        [
          {
            text: 'Open',
            onPress: async () => {
              try {
                await IntentLauncher.startActivityAsync(
                  IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                );
              } catch (error) {
                // Fallback to general settings
                Linking.openSettings();
              }
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  }

  function openAutoStartSettings() {
    if (Platform.OS === 'android') {
      Alert.alert(
        'Auto-Start Settings',
        'Auto-start allows the app to run in background.\n\n' +
        'Instructions (varies by manufacturer):\n\n' +
        '• Xiaomi/Redmi: Security → Permissions → Autostart\n' +
        '• Samsung: Settings → Apps → Connecti → Battery → Allow background activity\n' +
        '• Huawei: Settings → Apps → Connecti → Battery → App launch → Manual\n' +
        '• OnePlus: Settings → Apps → Connecti → Battery → Battery optimization → Don\'t optimize',
        [
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
          { text: 'OK' }
        ]
      );
    }
  }

  function openPreciseLocationSettings() {
    Alert.alert(
      'Enable Precise Location',
      'For accurate geofencing:\n\n' +
      '1. Go to Settings → Apps → Connecti\n' +
      '2. Tap "Location"\n' +
      '3. Enable "Use precise location"\n\n' +
      'This is critical for accurate zone detection!',
      [
        {
          text: 'Open Settings',
          onPress: () => Linking.openSettings(),
        },
        { text: 'OK' }
      ]
    );
  }

  function getPermissionIcon(status) {
    if (status === 'granted') return 'checkmark-circle';
    if (status === 'denied') return 'close-circle';
    return 'help-circle';
  }

  function getPermissionColor(status) {
    if (status === 'granted') return '#10B981';
    if (status === 'denied') return '#EF4444';
    return '#F59E0B';
  }

  const allPermissionsGranted = 
    permissions.location === 'granted' &&
    permissions.backgroundLocation === 'granted' &&
    permissions.notifications === 'granted';

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permissions Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero Card */}
      <View style={[
        styles.heroCard,
        allPermissionsGranted && styles.heroCardSuccess
      ]}>
        <View style={styles.heroIcon}>
          <Ionicons 
            name={allPermissionsGranted ? "shield-checkmark" : "shield-outline"} 
            size={48} 
            color={allPermissionsGranted ? "#10B981" : "#14B8A6"} 
          />
        </View>
        <Text style={styles.heroTitle}>
          {allPermissionsGranted ? "✅ All Set!" : "Permissions Required"}
        </Text>
        <Text style={styles.heroSubtitle}>
          {allPermissionsGranted 
            ? "All permissions granted. Geofencing will work perfectly!"
            : "Grant these permissions for full geofencing functionality"
          }
        </Text>
      </View>

      {/* Critical Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Critical Permissions</Text>
        
        {/* Location */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={requestLocationPermission}
        >
          <View style={styles.permissionIcon}>
            <Ionicons 
              name={getPermissionIcon(permissions.location)} 
              size={32} 
              color={getPermissionColor(permissions.location)} 
            />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Location Permission</Text>
            <Text style={styles.permissionDesc}>
              Required to detect your position
            </Text>
            <Text style={[
              styles.permissionStatus,
              { color: getPermissionColor(permissions.location) }
            ]}>
              {permissions.location === 'granted' ? '✅ Granted' : '❌ Not Granted'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Background Location */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={requestBackgroundPermission}
        >
          <View style={styles.permissionIcon}>
            <Ionicons 
              name={getPermissionIcon(permissions.backgroundLocation)} 
              size={32} 
              color={getPermissionColor(permissions.backgroundLocation)} 
            />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Background Location</Text>
            <Text style={styles.permissionDesc}>
              "Allow all the time" - CRITICAL for killed-state geofencing
            </Text>
            <Text style={[
              styles.permissionStatus,
              { color: getPermissionColor(permissions.backgroundLocation) }
            ]}>
              {permissions.backgroundLocation === 'granted' ? '✅ Granted' : '❌ Required'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Precise Location */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={openPreciseLocationSettings}
        >
          <View style={styles.permissionIcon}>
            <Ionicons 
              name="navigate" 
              size={32} 
              color="#6366F1" 
            />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Precise Location</Text>
            <Text style={styles.permissionDesc}>
              Enable in Settings for accurate zone detection
            </Text>
            <Text style={styles.permissionStatus}>
              Manual setup required
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={requestNotificationPermission}
        >
          <View style={styles.permissionIcon}>
            <Ionicons 
              name={getPermissionIcon(permissions.notifications)} 
              size={32} 
              color={getPermissionColor(permissions.notifications)} 
            />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Notifications</Text>
            <Text style={styles.permissionDesc}>
              Receive alerts when entering zones
            </Text>
            <Text style={[
              styles.permissionStatus,
              { color: getPermissionColor(permissions.notifications) }
            ]}>
              {permissions.notifications === 'granted' ? '✅ Granted' : '❌ Not Granted'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Device-Specific Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device-Specific Settings</Text>
        
        {/* Battery Optimization */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={openBatterySettings}
        >
          <View style={styles.permissionIcon}>
            <Ionicons name="battery-charging" size={32} color="#F59E0B" />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Battery Optimization</Text>
            <Text style={styles.permissionDesc}>
              Disable for Connecti to allow background operation
            </Text>
            <Text style={styles.permissionStatus}>
              Tap to configure
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Auto-Start */}
        <TouchableOpacity 
          style={styles.permissionCard}
          onPress={openAutoStartSettings}
        >
          <View style={styles.permissionIcon}>
            <Ionicons name="power" size={32} color="#8B5CF6" />
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Auto-Start Permission</Text>
            <Text style={styles.permissionDesc}>
              Allow app to run in background (Xiaomi, Huawei, OnePlus)
            </Text>
            <Text style={styles.permissionStatus}>
              Tap for instructions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Setup Guide */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle" size={20} color="#6366F1" />
          <Text style={styles.cardTitle}>Complete Setup Guide</Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepText}>
            Grant Location and Background Location permissions above
          </Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepText}>
            Enable "Use precise location" in Settings → Apps → Connecti → Location
          </Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>3</Text>
          <Text style={styles.stepText}>
            Disable battery optimization for Connecti
          </Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>4</Text>
          <Text style={styles.stepText}>
            Enable auto-start (if your device manufacturer requires it)
          </Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>5</Text>
          <Text style={styles.stepText}>
            Grant notification permission for alerts
          </Text>
        </View>
      </View>

      {/* Test Button */}
      {allPermissionsGranted && (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => {
              Alert.alert(
                '✅ Ready to Test!',
                'All critical permissions granted.\n\n' +
                'Go to Geofencing screen to start monitoring zones.',
                [
                  {
                    text: 'Go to Geofencing',
                    onPress: () => router.push('/home/GeofenceTestScreen')
                  },
                  { text: 'Later' }
                ]
              );
            }}
          >
            <Ionicons name="rocket" size={24} color="#FFF" />
            <Text style={styles.testButtonText}>Test Geofencing</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
    backgroundColor: '#F0FDFA',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  heroCardSuccess: {
    backgroundColor: '#D1FAE5',
    borderColor: '#86EFAC',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#047857',
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  permissionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 6,
  },
  permissionStatus: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
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
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
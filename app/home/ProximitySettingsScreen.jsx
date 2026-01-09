// app/home/ProximitySettingsScreen.jsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useProximityNotifications } from '../../hooks/useProximityNotifications';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function ProximitySettingsScreen() {
  const router = useRouter();
  const {
    isEnabled,
    hasPermissions,
    isLoading,
    enableProximityNotifications,
    disableProximityNotifications,
    requestPermissions,
    checkNow,
  } = useProximityNotifications();

  const [permissionDetails, setPermissionDetails] = useState({
    notifications: 'unknown',
    foreground: 'unknown',
    background: 'unknown',
  });

  // Check detailed permissions on mount
  useEffect(() => {
    checkDetailedPermissions();
    
    // Recheck when screen regains focus (user comes back from settings)
    const interval = setInterval(checkDetailedPermissions, 2000);
    return () => clearInterval(interval);
  }, []);

  const checkDetailedPermissions = async () => {
    try {
      const notif = await Notifications.getPermissionsAsync();
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      setPermissionDetails({
        notifications: notif.status,
        foreground: foreground.status,
        background: background.status,
      });

      console.log('📊 Current Permissions:', {
        notifications: notif.status,
        foreground: foreground.status,
        background: background.status,
      });
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const handleToggle = async (value) => {
    if (value) {
      // Check permissions first
      await checkDetailedPermissions();
      
      const success = await enableProximityNotifications();
      
      if (!success) {
        // Recheck permissions to see what's missing
        await checkDetailedPermissions();
        
        let missingPermissions = [];
        if (permissionDetails.notifications !== 'granted') {
          missingPermissions.push('• Notifications');
        }
        if (permissionDetails.foreground !== 'granted') {
          missingPermissions.push('• Location (While Using App)');
        }
        if (permissionDetails.background !== 'granted') {
          missingPermissions.push('• Location (Always/All the Time)');
        }

        const message = missingPermissions.length > 0
          ? `Please enable the following in Settings:\n\n${missingPermissions.join('\n')}\n\n${Platform.OS === 'android' ? 'For Location, tap "Permissions" → "Location" → Select "Allow all the time"' : 'For Location, select "Always"'}`
          : 'Unable to enable proximity notifications. Please check your settings.';

        Alert.alert(
          'Permissions Required',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings()
            },
          ]
        );
      } else {
        await checkDetailedPermissions();
      }
    } else {
      Alert.alert(
        'Disable Proximity Alerts?',
        'You will no longer receive notifications when friends are nearby.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Disable', 
            style: 'destructive',
            onPress: async () => {
              await disableProximityNotifications();
              await checkDetailedPermissions();
            }
          },
        ]
      );
    }
  };

  const handleCheckNow = async () => {
    try {
      await checkNow();
    } catch (error) {
      console.error('Error checking now:', error);
    }
  };

  const handleRequestPermissions = async () => {
    const granted = await requestPermissions();
    await checkDetailedPermissions();
    
    if (granted) {
      Alert.alert(
        'Permissions Granted! ✅',
        'You can now enable proximity notifications.',
        [{ text: 'OK' }]
      );
    } else {
      // Show what's still missing
      let missing = [];
      if (permissionDetails.notifications !== 'granted') missing.push('Notifications');
      if (permissionDetails.foreground !== 'granted') missing.push('Location (While Using)');
      if (permissionDetails.background !== 'granted') missing.push('Location (Always)');
      
      if (missing.length > 0) {
        Alert.alert(
          'Some Permissions Missing',
          `Still need: ${missing.join(', ')}\n\nPlease enable these in Settings → Permissions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    }
  };

  const getPermissionStatusIcon = (status) => {
    if (status === 'granted') return { icon: 'checkmark-circle', color: '#10B981' };
    if (status === 'denied') return { icon: 'close-circle', color: '#EF4444' };
    return { icon: 'help-circle', color: '#F59E0B' };
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1E88E5" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="notifications-outline" size={48} color="#1E88E5" />
          <Text style={styles.title}>Proximity Notifications</Text>
          <Text style={styles.subtitle}>
            Get notified when friends are nearby
          </Text>
        </View>
      </View>

      {/* Main Toggle Card */}
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Enable Proximity Alerts</Text>
            <Text style={styles.settingDescription}>
              Receive notifications when friends are within 1km
            </Text>
            {isEnabled && (
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            )}
          </View>
          {isLoading ? (
            <ActivityIndicator size="small" color="#1E88E5" />
          ) : (
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isEnabled ? '#1E88E5' : '#F3F4F6'}
              disabled={isLoading}
            />
          )}
        </View>

        {/* Permission Status Details */}
        <View style={styles.permissionStatusCard}>
          <Text style={styles.permissionStatusTitle}>Permission Status:</Text>
          
          <View style={styles.permissionItem}>
            <Ionicons 
              name={getPermissionStatusIcon(permissionDetails.notifications).icon} 
              size={20} 
              color={getPermissionStatusIcon(permissionDetails.notifications).color} 
            />
            <Text style={styles.permissionLabel}>Notifications</Text>
            <Text style={[styles.permissionStatus, { 
              color: permissionDetails.notifications === 'granted' ? '#10B981' : '#EF4444' 
            }]}>
              {permissionDetails.notifications}
            </Text>
          </View>

          <View style={styles.permissionItem}>
            <Ionicons 
              name={getPermissionStatusIcon(permissionDetails.foreground).icon} 
              size={20} 
              color={getPermissionStatusIcon(permissionDetails.foreground).color} 
            />
            <Text style={styles.permissionLabel}>Location (While Using)</Text>
            <Text style={[styles.permissionStatus, { 
              color: permissionDetails.foreground === 'granted' ? '#10B981' : '#EF4444' 
            }]}>
              {permissionDetails.foreground}
            </Text>
          </View>

          <View style={styles.permissionItem}>
            <Ionicons 
              name={getPermissionStatusIcon(permissionDetails.background).icon} 
              size={20} 
              color={getPermissionStatusIcon(permissionDetails.background).color} 
            />
            <Text style={styles.permissionLabel}>Location (Always)</Text>
            <Text style={[styles.permissionStatus, { 
              color: permissionDetails.background === 'granted' ? '#10B981' : '#EF4444' 
            }]}>
              {permissionDetails.background}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {!hasPermissions && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={24} color="#F59E0B" />
            <Text style={styles.warningText}>Permissions Required</Text>
            <Text style={styles.warningDescription}>
              Some permissions are missing. Grant them to enable proximity alerts.
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={handleRequestPermissions}
              disabled={isLoading}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="white" />
              <Text style={styles.permissionButtonText}>
                Grant Permissions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.settingsButtonText}>Open App Settings</Text>
              <Ionicons name="open-outline" size={16} color="#1E88E5" />
            </TouchableOpacity>
          </View>
        )}

        {isEnabled && hasPermissions && (
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleCheckNow}
            disabled={isLoading}
          >
            <Ionicons name="search-outline" size={20} color="white" />
            <Text style={styles.checkButtonText}>
              Check for Nearby Friends Now
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* How It Works */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📱 How it works</Text>
        <View style={styles.infoItem}>
          <Ionicons name="time-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            Your location is checked every 5 minutes in the background
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="location-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            You'll be notified when friends are within 1km radius
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="people-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            Your location is only shared with accepted friends
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="notifications-off-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            Each friend notifies you once per hour to avoid spam
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="battery-charging-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            Battery optimized with intelligent location updates
          </Text>
        </View>
      </View>

      {/* Privacy Information */}
      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>🔒 Privacy & Control</Text>
        <Text style={styles.privacyText}>
          Your location is private and secure. Only friends you've accepted can see 
          when you're nearby. You can disable this feature anytime. Location data 
          is encrypted and never shared with third parties.
        </Text>
      </View>

      {/* Troubleshooting */}
      {Platform.OS === 'android' && (
        <View style={styles.troubleshootCard}>
          <Text style={styles.troubleshootTitle}>⚙️ Android Setup Guide</Text>
          <Text style={styles.troubleshootText}>
            To enable background location on Android:
            {'\n'}1. Tap "Open App Settings" above
            {'\n'}2. Tap "Permissions"
            {'\n'}3. Tap "Location"
            {'\n'}4. Select "Allow all the time"
            {'\n'}5. Come back and toggle proximity alerts ON
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingText: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  permissionStatusCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  permissionStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  permissionLabel: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  permissionStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  warningBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    alignItems: 'center',
  },
  warningText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginTop: 8,
    marginBottom: 4,
  },
  warningDescription: {
    fontSize: 13,
    color: '#78350F',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  permissionButton: {
    flexDirection: 'row',
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  settingsButton: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#1E88E5',
    width: '100%',
  },
  settingsButtonText: {
    color: '#1E88E5',
    fontSize: 14,
    fontWeight: '600',
  },
  checkButton: {
    marginTop: 16,
    backgroundColor: '#1E88E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  checkButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginLeft: 12,
  },
  privacyCard: {
    backgroundColor: '#EFF6FF',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  troubleshootCard: {
    backgroundColor: '#F3F4F6',
    margin: 16,
    marginTop: 0,
    marginBottom: 32,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  troubleshootTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  troubleshootText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
});
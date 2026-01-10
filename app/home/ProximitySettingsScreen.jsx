// app/home/ProximitySettingsScreen.jsx - MODERN, CLEAN & WELCOMING UI with ROUNDED CORNERS
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
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useBleProximityNotifications } from '../../hooks/useBLEProximityNotifications';
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
  } = useBleProximityNotifications();

  const [notificationPermission, setNotificationPermission] = useState('unknown');

  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 3000);
    return () => clearInterval(interval);
  }, []);

  const checkPermissions = async () => {
    try {
      const notif = await Notifications.getPermissionsAsync();
      setNotificationPermission(notif.status);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const handleToggle = async (value) => {
    if (value) {
      await checkPermissions();
      
      if (notificationPermission !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Notification permission is needed for proximity alerts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Grant Permission', 
              onPress: async () => {
                const granted = await requestPermissions();
                await checkPermissions();
                if (granted) {
                  await enableProximityNotifications();
                }
              }
            },
          ]
        );
        return;
      }

      const success = await enableProximityNotifications();
      
      if (!success) {
        Alert.alert(
          'Failed to Enable',
          'Unable to enable proximity notifications. Please check permissions.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } else {
      Alert.alert(
        'Disable Proximity Alerts?',
        'You won\'t be notified when friends are nearby.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Disable', 
            style: 'destructive',
            onPress: () => disableProximityNotifications()
          },
        ]
      );
    }
  };

  const getPermissionStatus = (status) => {
    if (status === 'granted') return { text: 'Granted', color: '#10B981', icon: 'checkmark-circle' };
    if (status === 'denied') return { text: 'Denied', color: '#EF4444', icon: 'close-circle' };
    return { text: 'Unknown', color: '#F59E0B', icon: 'help-circle' };
  };

  const permStatus = getPermissionStatus(notificationPermission);

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
        <Text style={styles.headerTitle}>Proximity Alerts</Text>
        <View style={styles.backButton} />
      </View>

      {/* Hero Banner */}
      <View style={styles.heroBanner}>
        <View style={styles.heroIcon}>
          <Ionicons name="radio-outline" size={48} color="#4A90E2" />
        </View>
        <Text style={styles.heroTitle}>Stay Connected</Text>
        <Text style={styles.heroSubtitle}>
          Get notified when friends are nearby via Bluetooth
        </Text>
      </View>

      {/* Main Toggle Card */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleContent}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Proximity Alerts</Text>
            <Text style={styles.toggleDescription}>
              Receive notifications when friends are detected nearby
            </Text>
            {isEnabled && (
              <View style={styles.activeIndicator}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            )}
          </View>
          {isLoading ? (
            <ActivityIndicator size="small" color="#4A90E2" />
          ) : (
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={isEnabled ? '#10B981' : '#F3F4F6'}
              disabled={isLoading}
            />
          )}
        </View>

        {/* Permission Status */}
        <View style={styles.permissionStatus}>
          <Ionicons name={permStatus.icon} size={20} color={permStatus.color} />
          <Text style={styles.permissionLabel}>Notifications</Text>
          <View style={styles.statusBadge}>
            <Text style={[styles.statusText, { color: permStatus.color }]}>
              {permStatus.text}
            </Text>
          </View>
        </View>
      </View>

      {/* Permission Warning */}
      {!hasPermissions && (
        <View style={styles.warningCard}>
          <View style={styles.warningHeader}>
            <Ionicons name="alert-circle-outline" size={32} color="#F59E0B" />
            <Text style={styles.warningTitle}>Permission Required</Text>
          </View>
          <Text style={styles.warningText}>
            Notification permission is needed to receive proximity alerts
          </Text>
          <View style={styles.warningActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={async () => {
                const granted = await requestPermissions();
                await checkPermissions();
                if (granted) {
                  Alert.alert('Success', 'Permission granted! You can now enable proximity alerts.');
                } else {
                  Alert.alert(
                    'Permission Denied',
                    'Please enable notifications in Settings',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]
                  );
                }
              }}
              disabled={isLoading}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="white" />
              <Text style={styles.primaryButtonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.secondaryButtonText}>Open Settings</Text>
              <Ionicons name="open-outline" size={16} color="#4A90E2" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Testing Info */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="flask-outline" size={24} color="#4A90E2" />
          <Text style={styles.infoTitle}>Testing Mode</Text>
        </View>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Detection Range</Text>
            <Text style={styles.infoValue}>~50 meters</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Scan Interval</Text>
            <Text style={styles.infoValue}>10 seconds</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Cooldown</Text>
            <Text style={styles.infoValue}>2 minutes</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Check Interval</Text>
            <Text style={styles.infoValue}>10 seconds</Text>
          </View>
        </View>
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.infoNoteText}>
            Aggressive parameters for testing. Production uses longer intervals.
          </Text>
        </View>
      </View>

      {/* How It Works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How It Works</Text>
        
        <View style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Ionicons name="bluetooth" size={24} color="#4A90E2" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Bluetooth Scanning</Text>
            <Text style={styles.featureText}>
              Device scans for Bluetooth signals every 10 seconds
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Ionicons name="location-outline" size={24} color="#4A90E2" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Proximity Detection</Text>
            <Text style={styles.featureText}>
              Get notified when friends are within ~50 meters
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Ionicons name="people-outline" size={24} color="#4A90E2" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Friends Only</Text>
            <Text style={styles.featureText}>
              Only accepted friends with active BLE scanning are detected
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Ionicons name="battery-charging-outline" size={24} color="#10B981" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Battery Efficient</Text>
            <Text style={styles.featureText}>
              BLE uses minimal battery power
            </Text>
          </View>
        </View>
      </View>

      {/* Privacy Card */}
      <View style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <Ionicons name="lock-closed" size={24} color="#10B981" />
          <Text style={styles.privacyTitle}>Your Privacy Matters</Text>
        </View>
        <Text style={styles.privacyText}>
          BLE detection is more private than GPS! Your exact location is never stored. 
          Only Bluetooth proximity is detected. Only accepted friends can detect you. 
          You can disable this anytime.
        </Text>
      </View>

      {/* Tips Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tips for Best Results</Text>
        
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipTitle}>Requirements</Text>
          </View>
          <Text style={styles.tipText}>
            • Keep Bluetooth enabled on both devices{'\n'}
            • Grant notification permissions{'\n'}
            • Both users must have BLE scanning active{'\n'}
            • Both users must be friends in the app
          </Text>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="flask" size={20} color="#4A90E2" />
            <Text style={styles.tipTitle}>Testing</Text>
          </View>
          <Text style={styles.tipText}>
            • Start BLE scanner on both devices{'\n'}
            • Check HomeScreen debug info for BLE IDs{'\n'}
            • Watch console logs for matching attempts{'\n'}
            • Distance updates every 10 seconds
          </Text>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="build" size={20} color="#F59E0B" />
            <Text style={styles.tipTitle}>Troubleshooting</Text>
          </View>
          <Text style={styles.tipText}>
            • If friends aren't detected, restart Bluetooth{'\n'}
            • BLE range is typically 10-50 meters{'\n'}
            • Walls and obstacles reduce signal range{'\n'}
            • Check that BLE IDs are being broadcast{'\n'}
            • Verify both users have accepted friendship
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
    borderRadius: 24, // Increased from 20 to 24 for more rounded
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
  },
  heroBanner: {
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 32,
    borderRadius: 28, // Increased from 20 to 28 for more rounded
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  toggleCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 20,
    borderRadius: 24, // Increased from 16 to 24 for more rounded
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16, // Increased from 12 to 16 for more rounded
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  activeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  permissionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  permissionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3436',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12, // Increased from 8 to 12 for more rounded
    backgroundColor: '#F9FAFB',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 20,
    borderRadius: 24, // Increased from 16 to 24 for more rounded
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400E',
  },
  warningText: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 16,
  },
  warningActions: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16, // Increased from 12 to 16 for more rounded
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16, // Increased from 12 to 16 for more rounded
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  secondaryButtonText: {
    color: '#4A90E2',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 20,
    borderRadius: 24, // Increased from 16 to 24 for more rounded
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 16, // Increased from 12 to 16 for more rounded
  },
  infoLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 16,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20, // Increased from 16 to 20 for more rounded
    marginBottom: 12,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  privacyCard: {
    backgroundColor: '#ECFDF5',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 20,
    borderRadius: 24, // Increased from 16 to 24 for more rounded
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  privacyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#065F46',
  },
  privacyText: {
    fontSize: 14,
    color: '#047857',
    lineHeight: 20,
  },
  tipCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20, // Increased from 16 to 20 for more rounded
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
  },
  tipText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
});
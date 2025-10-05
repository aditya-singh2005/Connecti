// app/home/ProximitySettingsScreen.jsx
import React from 'react';
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
import { useProximityNotifications } from '../../hooks/useProximityNotifications';
import { Ionicons } from '@expo/vector-icons';

export default function ProximitySettingsScreen() {
  const {
    isEnabled,
    hasPermissions,
    isLoading,
    enableProximityNotifications,
    disableProximityNotifications,
    requestPermissions,
    checkNow,
  } = useProximityNotifications();

  const handleToggle = async (value) => {
    if (value) {
      const success = await enableProximityNotifications();
      if (!success) {
        Alert.alert(
          'Permissions Required',
          'Location and notification permissions are required to enable proximity notifications.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } else {
      await disableProximityNotifications();
    }
  };

  const handleCheckNow = async () => {
    Alert.alert('Checking...', 'Looking for nearby friends');
    await checkNow();
    Alert.alert('Done!', 'Check complete. You will be notified if friends are nearby.');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={48} color="#1E88E5" />
        <Text style={styles.title}>Proximity Notifications</Text>
        <Text style={styles.subtitle}>
          Get notified when friends are nearby
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Enable Proximity Alerts</Text>
            <Text style={styles.settingDescription}>
              Receive notifications when friends are within 1km
            </Text>
          </View>
          {isLoading ? (
            <ActivityIndicator size="small" color="#1E88E5" />
          ) : (
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isEnabled ? '#1E88E5' : '#F3F4F6'}
            />
          )}
        </View>

        {!hasPermissions && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={24} color="#F59E0B" />
            <Text style={styles.warningText}>Permissions Required</Text>
            <Text style={styles.warningDescription}>
              Location and notification permissions are needed
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermissions}
            >
              <Text style={styles.permissionButtonText}>
                Grant Permissions
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isEnabled && (
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleCheckNow}
          >
            <Ionicons name="search-outline" size={20} color="white" />
            <Text style={styles.checkButtonText}>Check for Nearby Friends Now</Text>
          </TouchableOpacity>
        )}
      </View>

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
          <Ionicons name="battery-charging-outline" size={18} color="#1E88E5" />
          <Text style={styles.infoText}>
            Battery optimized with intelligent updates
          </Text>
        </View>
      </View>

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>🔒 Privacy & Control</Text>
        <Text style={styles.privacyText}>
          Your location is private and secure. Only friends you've accepted can see 
          approximate proximity. You can disable this feature anytime. Location data 
          is encrypted and never shared with third parties.
        </Text>
      </View>
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
  },
  warningBox: {
    marginTop: 16,
    padding: 12,
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
    fontSize: 14,
    color: '#78350F',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#F59E0B',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkButton: {
    marginTop: 16,
    backgroundColor: '#1E88E5',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  checkButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
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
});
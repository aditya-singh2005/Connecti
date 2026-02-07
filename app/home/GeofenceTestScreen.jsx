// app/home/GeofenceTestScreen.jsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGeofenceService } from '../../hooks/useGeofenceService';
import * as TaskManager from 'expo-task-manager';
import { GEOFENCE_TASK_NAME } from '../../services/GeofenceManager';

export default function GeofenceTestScreen() {
  const router = useRouter();
  const {
    isGeofencingActive,
    activeGeofences,
    currentLocation,
    loading,
    lastUpdate,
    recentEvents,
    startGeofencing,
    stopGeofencing,
    refreshGeofences,
    getGeofenceStats,
    clearEventHistory,
    loadRecentEvents,
    updateCurrentLocation,
  } = useGeofenceService();

  const [refreshing, setRefreshing] = useState(false);
  const [osTaskStatus, setOsTaskStatus] = useState(false);
  const stats = getGeofenceStats();

  // Check OS-level task status independently
  useEffect(() => {
    checkOsTaskStatus();
  }, []);

  // Auto-refresh events and OS status every 5 seconds when active
  useEffect(() => {
    if (isGeofencingActive) {
      const interval = setInterval(() => {
        loadRecentEvents();
        checkOsTaskStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isGeofencingActive]);

  async function checkOsTaskStatus() {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    setOsTaskStatus(isRegistered);
  }

  const handleToggleGeofencing = async () => {
    if (isGeofencingActive) {
      Alert.alert(
        'Stop Geofencing?',
        'This will stop monitoring all zones and disable auto-restart.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop',
            style: 'destructive',
            onPress: async () => {
              const result = await stopGeofencing();
              if (result.success) {
                await checkOsTaskStatus();
                Alert.alert('Stopped ⏸️', 'Geofencing deactivated');
              }
            }
          }
        ]
      );
    } else {
      const result = await startGeofencing();
      if (result.success) {
        await checkOsTaskStatus();
        
        const zonesList = result.zones.slice(0, 5).map(z => 
          `  • ${z.name} (${Math.round(z.distance_meters)}m)`
        ).join('\n');
        
        Alert.alert(
          '✅ Geofencing Active!',
          `Monitoring ${result.zonesCount} zones:\n\n${zonesList}\n\n` +
          `🧪 Testing:\n` +
          `1. CLOSE the app completely (swipe away)\n` +
          `2. Open "Fake GPS Location" app\n` +
          `3. Enter coordinates of a zone\n` +
          `4. Tap "Start" in Fake GPS\n` +
          `5. Wait 10-30 seconds\n` +
          `6. You'll get a notification! 🎯\n\n` +
          `💡 Tip: Your location on this screen updates every 5 seconds automatically.`,
          [{ text: 'Got it!' }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to start geofencing');
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Always update location first
    await updateCurrentLocation();
    
    if (isGeofencingActive) {
      const result = await refreshGeofences();
      if (result.success) {
        Alert.alert('✅ Updated', `Now monitoring ${result.zonesCount} zones`);
      } else {
        Alert.alert('Info', result.error || 'Could not update zones');
      }
    }
    
    await loadRecentEvents();
    await checkOsTaskStatus();
    setRefreshing(false);
  };

  const handleManualLocationRefresh = async () => {
    const newLocation = await updateCurrentLocation();
    if (newLocation) {
      Alert.alert(
        '📍 Location Updated',
        `Lat: ${newLocation.latitude.toFixed(6)}\n` +
        `Lng: ${newLocation.longitude.toFixed(6)}\n` +
        `Accuracy: ${Math.round(newLocation.accuracy)}m`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Event History?',
      'This will remove all stored geofence entry events.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const success = await clearEventHistory();
            if (success) {
              Alert.alert('✅ Cleared', 'Event history cleared');
            }
          }
        }
      ]
    );
  };

  const getZoneIcon = (zoneType) => {
    const icons = {
      metro: 'subway',
      mall: 'cart',
      cafe: 'cafe',
      park: 'leaf',
      hospital: 'medical',
      education: 'school',
      market: 'storefront',
      transport: 'bus',
      office: 'briefcase',
      general: 'location',
    };
    return icons[zoneType] || 'location';
  };

  const getZoneColor = (zoneType) => {
    const colors = {
      metro: '#EF4444',
      mall: '#8B5CF6',
      cafe: '#F59E0B',
      park: '#10B981',
      hospital: '#3B82F6',
      education: '#6366F1',
      market: '#EC4899',
      transport: '#14B8A6',
      office: '#6B7280',
      general: '#9CA3AF',
    };
    return colors[zoneType] || '#9CA3AF';
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return `Today at ${formatTime(timestamp)}`;
    }
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#6366F1']}
          tintColor="#6366F1"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Geofencing</Text>
        <TouchableOpacity onPress={handleManualLocationRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons 
            name={isGeofencingActive ? "location" : "location-outline"} 
            size={48} 
            color={isGeofencingActive ? "#10B981" : "#6366F1"} 
          />
        </View>
        <Text style={styles.heroTitle}>
          {isGeofencingActive ? "🎯 Tracking Active" : "OS-Level Tracking"}
        </Text>
        <Text style={styles.heroSubtitle}>
          {isGeofencingActive 
            ? "Monitoring zone entries • Updates every 5 seconds" 
            : "Works when app is killed • Battery efficient • PostgreSQL + PostGIS"
          }
        </Text>
      </View>

      {/* Current Location Card - ALWAYS VISIBLE */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="navigate" size={20} color="#10B981" />
          <Text style={styles.cardTitle}>Your Current Location</Text>
          <TouchableOpacity onPress={handleManualLocationRefresh} style={styles.miniRefreshBtn}>
            <Ionicons name="refresh-circle" size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {currentLocation ? (
          <View style={styles.locationBox}>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Latitude:</Text>
              <Text style={styles.locationValue}>{currentLocation.latitude.toFixed(6)}</Text>
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Longitude:</Text>
              <Text style={styles.locationValue}>{currentLocation.longitude.toFixed(6)}</Text>
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Accuracy:</Text>
              <Text style={styles.locationValue}>{Math.round(currentLocation.accuracy)}m</Text>
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Updated:</Text>
              <Text style={styles.locationValue}>{formatTime(currentLocation.timestamp)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noLocationBox}>
            <Ionicons name="location-outline" size={32} color="#9CA3AF" />
            <Text style={styles.noLocationText}>No location data yet</Text>
            <TouchableOpacity onPress={handleManualLocationRefresh} style={styles.getLocationBtn}>
              <Text style={styles.getLocationText}>Get Location</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={14} color="#6B7280" />
          <Text style={styles.infoTextSmall}>
            {isGeofencingActive 
              ? "Location updates automatically every 5 seconds. Use Fake GPS to test zone entries."
              : "Pull down to refresh or tap the refresh icon to update location."
            }
          </Text>
        </View>
      </View>

      {/* Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons
            name={isGeofencingActive ? 'checkmark-circle' : 'pause-circle'}
            size={20}
            color={isGeofencingActive ? '#10B981' : '#9CA3AF'}
          />
          <Text style={styles.cardTitle}>System Status</Text>
        </View>

        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>App Geofencing</Text>
            <View style={styles.statusBadge}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: isGeofencingActive ? '#10B981' : '#9CA3AF' }
              ]} />
              <Text style={[
                styles.statusValue,
                isGeofencingActive ? styles.statusActive : styles.statusInactive,
              ]}>
                {isGeofencingActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>OS Task Status</Text>
            <View style={styles.statusBadge}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: osTaskStatus ? '#10B981' : '#EF4444' }
              ]} />
              <Text style={[
                styles.statusValue,
                osTaskStatus ? styles.statusActive : { color: '#EF4444' },
              ]}>
                {osTaskStatus ? 'Registered' : 'Not Registered'}
              </Text>
            </View>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Zones Monitored</Text>
            <Text style={styles.statusValue}>{activeGeofences.length}</Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Total Events</Text>
            <Text style={styles.statusValue}>{recentEvents.length}</Text>
          </View>

          {stats.nearestZone && (
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Nearest Zone</Text>
              <Text style={styles.statusValue} numberOfLines={1}>
                {stats.nearestZone.identifier} • {Math.round(stats.nearestZone.distance)}m
              </Text>
            </View>
          )}

          {lastUpdate && (
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Last Update</Text>
              <Text style={styles.statusValue}>
                {formatDate(lastUpdate)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* System Health Warning */}
      {isGeofencingActive && !osTaskStatus && (
        <View style={styles.warningCard}>
          <Ionicons name="warning" size={24} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>OS Task Not Registered!</Text>
            <Text style={styles.warningText}>
              The geofencing task is not registered with the OS. Try stopping and restarting geofencing.
            </Text>
          </View>
        </View>
      )}

      {/* Recent Events Card */}
      {recentEvents.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="time" size={20} color="#F59E0B" />
            <Text style={styles.cardTitle}>Recent Events ({recentEvents.length})</Text>
            <TouchableOpacity onPress={handleClearHistory} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {recentEvents.slice(-15).reverse().map((event, index) => (
            <View key={index} style={styles.eventItem}>
              <View style={[
                styles.eventDot,
                { backgroundColor: '#10B981' }
              ]} />
              <View style={styles.eventInfo}>
                <Text style={styles.eventZone}>
                  🎯 Entered {event.zone}
                </Text>
                <Text style={styles.eventTime}>{formatDate(event.timestamp)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Active Geofences */}
      {activeGeofences.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Monitored Zones ({activeGeofences.length})</Text>
          </View>

          {activeGeofences
            .sort((a, b) => (a.distance || 0) - (b.distance || 0))
            .map((zone, index) => (
              <View key={index} style={styles.zoneItem}>
                <View style={[
                  styles.zoneIcon, 
                  { backgroundColor: `${getZoneColor(zone.zoneType)}20` }
                ]}>
                  <Ionicons 
                    name={getZoneIcon(zone.zoneType)} 
                    size={18} 
                    color={getZoneColor(zone.zoneType)} 
                  />
                </View>
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName}>{zone.identifier}</Text>
                  <Text style={styles.zoneDetail}>
                    {zone.city && `${zone.city} • `}
                    {zone.radius}m radius
                    {zone.distance && ` • ${Math.round(zone.distance)}m away`}
                  </Text>
                  {zone.address && (
                    <Text style={styles.zoneAddress} numberOfLines={1}>
                      {zone.address}
                    </Text>
                  )}
                </View>
              </View>
            ))}
        </View>
      )}

      {/* Control Button */}
      <View style={styles.card}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            isGeofencingActive && styles.controlButtonActive,
          ]}
          onPress={handleToggleGeofencing}
          disabled={loading}
        >
          <View style={styles.controlButtonContent}>
            <Ionicons
              name={loading ? 'hourglass' : isGeofencingActive ? 'stop-circle' : 'play-circle'}
              size={24}
              color="#FFF"
            />
            <Text style={styles.controlButtonText}>
              {loading
                ? 'Setting up...'
                : isGeofencingActive
                ? 'Stop Geofencing'
                : 'Start Geofencing'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>
            {isGeofencingActive
              ? '✅ Active! Close the app completely and use Fake GPS. Your location above will update every 5 seconds.'
              : '🚀 Tap to activate. Will auto-restart when you reopen the app.'}
          </Text>
        </View>
      </View>

      {/* Testing Instructions */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flask" size={20} color="#EC4899" />
          <Text style={styles.cardTitle}>Testing Guide</Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>1</Text>
          <Text style={styles.testStepText}>
            Start geofencing (OS Task Status must show "Registered")
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>2</Text>
          <Text style={styles.testStepText}>
            Note your current location coordinates above
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>3</Text>
          <Text style={styles.testStepText}>
            Install "Fake GPS Location" app from Play Store
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>4</Text>
          <Text style={styles.testStepText}>
            Enable it as mock location app in Developer Options
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>5</Text>
          <Text style={styles.testStepText}>
            In Fake GPS, enter coordinates of a monitored zone from the list above
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>6</Text>
          <Text style={styles.testStepText}>
            Watch your location update on this screen (updates every 5 seconds)
          </Text>
        </View>

        <View style={styles.testStep}>
          <Text style={styles.testStepNumber}>7</Text>
          <Text style={styles.testStepText}>
            For killed app test: Close app completely, wait 10-30s → Notification! 🎯
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
  refreshBtn: {
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
    backgroundColor: '#EEF2FF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#3730A3',
    textAlign: 'center',
    lineHeight: 19,
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
  locationBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803D',
    fontFamily: 'monospace',
  },
  noLocationBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noLocationText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 16,
  },
  getLocationBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  getLocationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#78350F',
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
    flex: 1,
  },
  miniRefreshBtn: {
    padding: 4,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  statusGrid: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  statusActive: {
    color: '#10B981',
  },
  statusInactive: {
    color: '#9CA3AF',
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventZone: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  zoneIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  zoneDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  zoneAddress: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  controlButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  controlButtonActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  controlButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  controlButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
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
  infoTextSmall: {
    flex: 1,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
  testStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingLeft: 4,
  },
  testStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  testStepText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
});
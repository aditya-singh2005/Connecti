// app/home/GeofenceTestScreen.jsx - COMPACT WHITE UI + Distance Display
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
    currentLocation,
    loading,
    lastUpdate,
    recentEvents,
    currentZone,
    allNearbyZones,
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
  // ✅ Get zones sorted by distance
  const zonesWithDistances = stats.zonesWithDistances || [];

  useEffect(() => {
    checkOsTaskStatus();
  }, []);

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
        'Stop monitoring zones?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop',
            style: 'destructive',
            onPress: async () => {
              const result = await stopGeofencing();
              if (result.success) {
                await checkOsTaskStatus();
                Alert.alert('Stopped', 'Geofencing deactivated');
              }
            }
          }
        ]
      );
    } else {
      const result = await startGeofencing();
      if (result.success) {
        await checkOsTaskStatus();
        
        Alert.alert(
          'Geofencing Active!',
          `Monitoring ${result.zonesCount} zones\n` +
          `Total ${result.zones.length} nearby\n\n` +
          `Move around or use Fake GPS to test`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to start');
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    await updateCurrentLocation();
    
    if (isGeofencingActive) {
      await refreshGeofences();
    }
    
    await loadRecentEvents();
    await checkOsTaskStatus();
    setRefreshing(false);
  };

  const handleManualLocationRefresh = async () => {
    const newLocation = await updateCurrentLocation();
    if (newLocation) {
      Alert.alert(
        'Location Updated',
        `${newLocation.latitude.toFixed(6)}, ${newLocation.longitude.toFixed(6)}\n` +
        `Accuracy: ±${Math.round(newLocation.accuracy)}m`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History?',
      'Remove all events?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const success = await clearEventHistory();
            if (success) {
              Alert.alert('Cleared', 'History cleared');
            }
          }
        }
      ]
    );
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#10B981']}
          tintColor="#10B981"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Geofencing</Text>
        <TouchableOpacity onPress={handleManualLocationRefresh} style={styles.headerBtn}>
          <Ionicons name="refresh" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Status Card */}
      <View style={[styles.statusCard, isGeofencingActive && styles.statusCardActive]}>
        <View style={styles.statusRow}>
          <Ionicons 
            name={isGeofencingActive ? "checkmark-circle" : "pause-circle"} 
            size={24} 
            color={isGeofencingActive ? "#10B981" : "#6B7280"} 
          />
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>
              {isGeofencingActive ? "Active" : "Inactive"}
            </Text>
            <Text style={styles.statusSubtitle}>
              {isGeofencingActive 
                ? `${zonesWithDistances.length} monitored • ${allNearbyZones.length} nearby`
                : "Tap start to begin monitoring"
              }
            </Text>
          </View>
        </View>
        
        {currentZone && (
          <View style={styles.currentZoneBadge}>
            <Text style={styles.currentZoneText}>📍 {currentZone}</Text>
          </View>
        )}
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{zonesWithDistances.length}</Text>
          <Text style={styles.statLabel}>Monitored</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{allNearbyZones.length}</Text>
          <Text style={styles.statLabel}>Nearby</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{recentEvents.length}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
        <View style={styles.statBox}>
          <View style={[
            styles.statusDot,
            { backgroundColor: osTaskStatus ? '#10B981' : '#EF4444' }
          ]} />
          <Text style={styles.statLabel}>OS Task</Text>
        </View>
      </View>

      {/* Current Location */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Current Location</Text>
        </View>

        {currentLocation ? (
          <View style={styles.locationCard}>
            <View style={styles.locationRow}>
              <View style={styles.locationItem}>
                <Text style={styles.locationLabel}>LAT</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {currentLocation.latitude.toFixed(6)}
                </Text>
              </View>
              <View style={styles.locationItem}>
                <Text style={styles.locationLabel}>LNG</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {currentLocation.longitude.toFixed(6)}
                </Text>
              </View>
            </View>
            <View style={styles.locationRow}>
              <View style={styles.locationItem}>
                <Text style={styles.locationLabel}>ACCURACY</Text>
                <Text style={styles.locationValue}>
                  ±{Math.round(currentLocation.accuracy)}m
                </Text>
              </View>
              <View style={styles.locationItem}>
                <Text style={styles.locationLabel}>UPDATED</Text>
                <Text style={styles.locationValue}>
                  {formatTime(currentLocation.timestamp)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No location data</Text>
            <TouchableOpacity 
              style={styles.smallBtn}
              onPress={handleManualLocationRefresh}
            >
              <Text style={styles.smallBtnText}>Get Location</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Monitored Zones - SORTED BY DISTANCE */}
      {zonesWithDistances.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Monitored Zones ({zonesWithDistances.length})
            </Text>
          </View>

          <View style={styles.zonesList}>
            {zonesWithDistances.map((zone, index) => (
              <View key={index} style={styles.zoneRow}>
                <View style={[
                  styles.zoneDot,
                  { backgroundColor: zone.distance <= zone.radius ? '#10B981' : '#6B7280' }
                ]} />
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName} numberOfLines={1}>
                    {zone.identifier}
                  </Text>
                  <Text style={styles.zoneMeta}>
                    {Math.round(zone.distance)}m away • {zone.radius}m radius
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent Events */}
      {recentEvents.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Recent Events ({recentEvents.length})
            </Text>
            <TouchableOpacity onPress={handleClearHistory}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.eventsList}>
            {recentEvents.slice(0, 8).map((event, index) => (
              <View key={index} style={styles.eventRow}>
                <View style={[
                  styles.eventDot,
                  { backgroundColor: event.appState === 'killed' ? '#EF4444' : '#10B981' }
                ]} />
                <View style={styles.eventInfo}>
                  <Text style={styles.eventZone} numberOfLines={1}>
                    {event.zone}
                  </Text>
                  <Text style={styles.eventMeta}>
                    {formatTime(event.timestamp)} • {event.appState}
                    {event.distance && ` • ${Math.round(event.distance)}m`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Control Button */}
      <View style={styles.controlSection}>
        <TouchableOpacity
          style={[
            styles.controlBtn,
            isGeofencingActive && styles.controlBtnStop,
            loading && styles.controlBtnLoading
          ]}
          onPress={handleToggleGeofencing}
          disabled={loading}
        >
          <Ionicons
            name={loading ? 'hourglass' : isGeofencingActive ? 'stop-circle' : 'play-circle'}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.controlBtnText}>
            {loading ? 'Setting up...' : isGeofencingActive ? 'Stop' : 'Start Geofencing'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Testing Guide */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Testing Guide</Text>
        </View>

        <View style={styles.guideCard}>
          <Text style={styles.guideText}>
            1. Start geofencing (check OS Task is green){'\n'}
            2. Install "Fake GPS Location" from Play Store{'\n'}
            3. Enable in Developer Options{'\n'}
            4. Set coordinates of a nearby zone{'\n'}
            5. Watch location update & get notification!
          </Text>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statusCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  statusCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  currentZoneBadge: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  currentZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginBottom: 4,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  locationItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
  },
  locationLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  locationValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'monospace',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  smallBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  zonesList: {
    gap: 6,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  zoneMeta: {
    fontSize: 11,
    color: '#6B7280',
  },
  eventsList: {
    gap: 6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventInfo: {
    flex: 1,
  },
  eventZone: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  eventMeta: {
    fontSize: 11,
    color: '#6B7280',
  },
  controlSection: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 14,
  },
  controlBtnStop: {
    backgroundColor: '#EF4444',
  },
  controlBtnLoading: {
    backgroundColor: '#9CA3AF',
  },
  controlBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
  },
  guideText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
});
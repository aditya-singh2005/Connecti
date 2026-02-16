// app/home/GeofenceTestScreen.jsx - FRIENDLY MODERN UI
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGeofenceService } from '../../hooks/useGeofenceService';
import * as TaskManager from 'expo-task-manager';
import { GEOFENCE_TASK_NAME } from '../../services/GeofenceManager';
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

export default function GeofenceTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const zonesWithDistances = stats.zonesWithDistances || [];

  useEffect(() => {
    DebugService.lifecycle('GeofenceTestScreen', 'Component mounted');
    checkOsTaskStatus();
    return () => DebugService.lifecycle('GeofenceTestScreen', 'Component unmounted');
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
    DebugService.geofence('GeofenceTestScreen', 'OS Task status checked', {
      isRegistered,
      taskName: GEOFENCE_TASK_NAME
    });
  }

  const handleToggleGeofencing = async () => {
    if (isGeofencingActive) {
      DebugService.geofence('GeofenceTestScreen', 'User requested to stop geofencing');
      Alert.alert(
        'Stop Geofencing?',
        'Stop monitoring zones?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop',
            style: 'destructive',
            onPress: async () => {
              DebugService.geofence('GeofenceTestScreen', 'Stopping geofencing...');
              const result = await stopGeofencing();
              if (result.success) {
                await checkOsTaskStatus();
                DebugService.success('GeofenceTestScreen', 'Geofencing stopped successfully');
                Alert.alert('Stopped', 'Geofencing deactivated');
              } else {
                DebugService.error('GeofenceTestScreen', 'Failed to stop geofencing', { error: result.error });
              }
            }
          }
        ]
      );
    } else {
      DebugService.geofence('GeofenceTestScreen', 'User requested to start geofencing');
      const result = await startGeofencing();
      if (result.success) {
        await checkOsTaskStatus();
        DebugService.success('GeofenceTestScreen', 'Geofencing started successfully', {
          zonesCount: result.zonesCount,
          totalZones: result.zones.length
        });
        Alert.alert(
          'Geofencing Active! 🎉',
          `Monitoring ${result.zonesCount} zones\n` +
          `Total ${result.zones.length} nearby\n\n` +
          `Move around or use Fake GPS to test`,
          [{ text: 'OK' }]
        );
      } else {
        DebugService.error('GeofenceTestScreen', 'Failed to start geofencing', { error: result.error });
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
        'Location Updated 📍',
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
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Geofencing</Text>
          <TouchableOpacity onPress={handleManualLocationRefresh} style={styles.headerBtn}>
            <Ionicons name="refresh" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Status Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIconWrapper, isGeofencingActive && styles.statusIconActive]}>
              <Ionicons
                name={isGeofencingActive ? "checkmark-circle" : "radio-button-off-outline"}
                size={28}
                color={isGeofencingActive ? "#10B981" : "#A78BFA"}
              />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>
                {isGeofencingActive ? "✨ Active" : "💤 Standby"}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isGeofencingActive
                  ? `Tracking ${zonesWithDistances.length} zones`
                  : "Tap start to begin"
                }
              </Text>
            </View>
          </View>

          {currentZone && (
            <View style={styles.currentZoneBadge}>
              <Ionicons name="location" size={14} color="#10B981" />
              <Text style={styles.currentZoneText}>In {currentZone}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#8B5CF6']}
            tintColor="#8B5CF6"
          />
        }
      >
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statContent}>
              <Ionicons name="eye-outline" size={20} color="#8B5CF6" />
              <Text style={styles.statValue}>{zonesWithDistances.length}</Text>
              <Text style={styles.statLabel}>Monitored</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statContent}>
              <Ionicons name="location-outline" size={20} color="#3B82F6" />
              <Text style={styles.statValue}>{allNearbyZones.length}</Text>
              <Text style={styles.statLabel}>Nearby</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statContent}>
              <Ionicons name="notifications-outline" size={20} color="#8B5CF6" />
              <Text style={styles.statValue}>{recentEvents.length}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statContent}>
              <Ionicons
                name={osTaskStatus ? "checkmark-circle" : "close-circle"}
                size={20}
                color={osTaskStatus ? '#10B981' : '#EF4444'}
              />
              <Text style={[styles.statValue, { color: osTaskStatus ? '#10B981' : '#EF4444' }]}>
                {osTaskStatus ? '✓' : '✗'}
              </Text>
              <Text style={styles.statLabel}>OS Task</Text>
            </View>
          </View>
        </View>

        {/* Current Location */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="navigate-circle-outline" size={18} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Current Location</Text>
          </View>

          {currentLocation ? (
            <View style={styles.locationCard}>
              <View style={styles.locationGrid}>
                <View style={styles.locationItem}>
                  <View style={styles.locationIconWrapper}>
                    <Ionicons name="compass-outline" size={14} color="#8B5CF6" />
                  </View>
                  <Text style={styles.locationLabel}>Latitude</Text>
                  <Text style={styles.locationValue}>
                    {currentLocation.latitude.toFixed(6)}
                  </Text>
                </View>
                <View style={styles.locationItem}>
                  <View style={styles.locationIconWrapper}>
                    <Ionicons name="compass-outline" size={14} color="#3B82F6" />
                  </View>
                  <Text style={styles.locationLabel}>Longitude</Text>
                  <Text style={styles.locationValue}>
                    {currentLocation.longitude.toFixed(6)}
                  </Text>
                </View>
              </View>
              <View style={styles.locationGrid}>
                <View style={styles.locationItem}>
                  <View style={styles.locationIconWrapper}>
                    <Ionicons name="radio-outline" size={14} color="#8B5CF6" />
                  </View>
                  <Text style={styles.locationLabel}>Accuracy</Text>
                  <Text style={styles.locationValue}>
                    ±{Math.round(currentLocation.accuracy)}m
                  </Text>
                </View>
                <View style={styles.locationItem}>
                  <View style={styles.locationIconWrapper}>
                    <Ionicons name="time-outline" size={14} color="#3B82F6" />
                  </View>
                  <Text style={styles.locationLabel}>Updated</Text>
                  <Text style={styles.locationValue}>
                    {formatTime(currentLocation.timestamp)}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="location-outline" size={40} color="#C4B5FD" />
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

        {/* Recent Events (MOVED UP) */}
        {recentEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={handleClearHistory} style={styles.clearBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.eventsList}>
              {recentEvents.slice(0, 5).map((event, index) => (
                <View key={index} style={styles.eventRow}>
                  <View style={[
                    styles.eventIcon,
                    { backgroundColor: event.appState === 'killed' ? '#FEE2E2' : '#E0E7FF' }
                  ]}>
                    <Ionicons
                      name={event.appState === 'killed' ? 'flash-off-outline' : 'flash-outline'}
                      size={16}
                      color={event.appState === 'killed' ? '#EF4444' : '#6366F1'}
                    />
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventZone} numberOfLines={1}>
                      {event.zone}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {formatTime(event.timestamp)} • {event.appState === 'killed' ? 'Background' : 'Foreground'}
                    </Text>
                  </View>
                  <View style={[
                    styles.eventBadge,
                    event.notificationSent && styles.eventBadgeActive
                  ]}>
                    <Ionicons
                      name={event.notificationSent ? "checkmark" : "remove"}
                      size={11}
                      color={event.notificationSent ? '#10B981' : '#94A3B8'}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Database Presence Info (NEW) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sync-outline" size={18} color="#10B981" />
            <Text style={styles.sectionTitle}>Real-time Presence</Text>
          </View>
          <View style={styles.guideCard}>
            <View style={styles.statusRow}>
              <Ionicons
                name={currentZone ? "globe-outline" : "cloud-offline-outline"}
                size={20}
                color={currentZone ? "#10B981" : "#94A3B8"}
              />
              <Text style={styles.guideText}>
                {currentZone
                  ? `Synced: Active in ${currentZone}`
                  : "Standby: No active zone presence"}
              </Text>
            </View>
          </View>
        </View>

        {/* Monitored Zones (MOVED DOWN) */}
        {zonesWithDistances.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={18} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>
                Monitored Zones ({zonesWithDistances.length})
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              Sorted by distance • Max 20 zones
            </Text>

            <View style={styles.zonesList}>
              {zonesWithDistances.map((zone, index) => {
                const isInside = zone.distance <= zone.radius;
                return (
                  <View key={index} style={[styles.zoneRow, isInside && styles.zoneRowActive]}>
                    <View style={[
                      styles.zoneIcon,
                      { backgroundColor: isInside ? '#D1FAE5' : '#EDE9FE' }
                    ]}>
                      <Ionicons
                        name={isInside ? "location" : "location-outline"}
                        size={18}
                        color={isInside ? "#10B981" : "#8B5CF6"}
                      />
                    </View>
                    <View style={styles.zoneInfo}>
                      <Text style={[styles.zoneName, isInside && styles.zoneNameActive]} numberOfLines={1}>
                        {zone.identifier}
                      </Text>
                      <View style={styles.zoneMetas}>
                        <View style={styles.zoneMetaItem}>
                          <Ionicons name="navigate" size={10} color="#94A3B8" />
                          <Text style={styles.zoneMeta}>{Math.round(zone.distance)}m</Text>
                        </View>
                        <View style={styles.zoneMetaItem}>
                          <Ionicons name="radio-button-on-outline" size={10} color="#94A3B8" />
                          <Text style={styles.zoneMeta}>{zone.radius}m</Text>
                        </View>
                      </View>
                    </View>
                    {isInside && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>INSIDE</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Testing Guide */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb-outline" size={18} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Testing Guide</Text>
          </View>

          <View style={styles.guideCard}>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <Text style={styles.guideStepNumberText}>1</Text>
              </View>
              <Text style={styles.guideText}>Start geofencing (check OS Task ✓)</Text>
            </View>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <Text style={styles.guideStepNumberText}>2</Text>
              </View>
              <Text style={styles.guideText}>Install "Fake GPS" from Play Store</Text>
            </View>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <Text style={styles.guideStepNumberText}>3</Text>
              </View>
              <Text style={styles.guideText}>Enable in Developer Options</Text>
            </View>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <Text style={styles.guideStepNumberText}>4</Text>
              </View>
              <Text style={styles.guideText}>Set zone coordinates & test! 🎉</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* Floating Control Button */}
      <View style={[styles.floatingButtonContainer, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[
            styles.controlBtn,
            loading && styles.controlBtnLoading,
            isGeofencingActive && styles.controlBtnActive
          ]}
          onPress={handleToggleGeofencing}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons
            name={loading ? 'hourglass-outline' : isGeofencingActive ? 'stop-circle' : 'play-circle'}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.controlBtnText}>
            {loading ? 'Setting up...' : isGeofencingActive ? 'Stop' : 'Start Geofencing'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    paddingBottom: 20,
    backgroundColor: '#8B5CF6',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroCard: {
    marginHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconActive: {
    backgroundColor: '#D1FAE5',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 3,
  },
  statusSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  currentZoneBadge: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  scrollContent: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statContent: {
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  section: {
    marginHorizontal: 18,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
    marginLeft: 25,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#FEE2E2',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 10,
  },
  locationGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  locationItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  locationIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 3,
  },
  locationValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    marginBottom: 14,
  },
  smallBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  smallBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  eventsList: {
    gap: 7,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  eventZone: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 3,
  },
  eventMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  eventBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventBadgeActive: {
    backgroundColor: '#D1FAE5',
  },
  zonesList: {
    gap: 7,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  zoneRowActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  zoneIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 5,
  },
  zoneNameActive: {
    color: '#059669',
  },
  zoneMetas: {
    flexDirection: 'row',
    gap: 10,
  },
  zoneMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  zoneMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  activeBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  guideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 10,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideStepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guideText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    paddingTop: 3,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  controlBtnActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  controlBtnLoading: {
    backgroundColor: '#94A3B8',
    shadowColor: '#94A3B8',
  },
  controlBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
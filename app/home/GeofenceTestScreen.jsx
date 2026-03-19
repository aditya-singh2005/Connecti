// app/home/GeofenceTestScreen.jsx - FRIENDLY MODERN UI REFACTOR (v2)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGeofenceService } from '../../hooks/useGeofenceService';
import { WaveService } from '../../services/WaveService';
import { supabase } from '../../lib/supabase';
import * as TaskManager from 'expo-task-manager';
import { GEOFENCE_TASK_NAME } from '../../services/GeofenceManager';
import { DebugService } from '../../services/DebugService';
import { LinearGradient } from 'expo-linear-gradient';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const [isWaved, setIsWaved] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const [waveRemaining, setWaveRemaining] = useState(0);

  const stats = getGeofenceStats();
  const zonesWithDistances = stats.zonesWithDistances || [];

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (currentZone && !isWaved) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [currentZone, isWaved]);

  const checkWaveStatus = useCallback(async () => {
    const remaining = await WaveService.getRemainingTime();
    setWaveRemaining(remaining);
    setIsWaved(remaining > 0);

    if (currentZone) {
      const suppressed = await WaveService.isLaterSuppressed(currentZone);
      setIsSuppressed(suppressed);
    } else {
      setIsSuppressed(false);
    }
  }, [currentZone]);

  useEffect(() => {
    DebugService.lifecycle('GeofenceTestScreen', 'Component mounted');
    checkOsTaskStatus();
    checkWaveStatus();

    const interval = setInterval(() => {
      checkWaveStatus();
      checkOsTaskStatus();
    }, 5000);

    return () => {
      DebugService.lifecycle('GeofenceTestScreen', 'Component unmounted');
      clearInterval(interval);
    }
  }, [checkWaveStatus]);

  async function checkOsTaskStatus() {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (osTaskStatus !== isRegistered) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOsTaskStatus(isRegistered);
    }
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
        Alert.alert('Geofencing Active! 🎉', `Monitoring ${result.zonesCount} zones.`);
      } else {
        Alert.alert('Error', result.error || 'Failed to start');
      }
    }
  };

  const handleWave = async () => {
    if (!currentZone) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not logged in');
        return;
      }

      const success = await WaveService.setOpenToWave(user.id, currentZone);
      if (success) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        await checkWaveStatus();
        Alert.alert('Waved! 👋', `You are now open to waves in ${currentZone} for 30 minutes.`);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
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
    await checkWaveStatus();
    setRefreshing(false);
  };

  const handleResetSuppression = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not logged in');
        return;
      }

      Alert.alert(
        'Clear Blocks?',
        'This will reset all blocked zones so you can receive notifications again immediately.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              const success = await WaveService.resetSuppressions(user.id);
              if (success) {
                await checkWaveStatus();
                Alert.alert('Success', 'All blocks cleared! 🚀');
              }
            }
          }
        ]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };


  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <LinearGradient
        colors={['#6366F1', '#4F46E5']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connecti Zones</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.iconBtn}>
            <Ionicons name="filter" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* 1. Geofence Summary Section (User requested this first) */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{zonesWithDistances.length}</Text>
              <Text style={styles.summaryLab}>Monitored</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{allNearbyZones.length}</Text>
              <Text style={styles.summaryLab}>Nearby</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <View style={[styles.osDot, { backgroundColor: osTaskStatus ? '#10B981' : '#EF4444' }]} />
              <Text style={styles.summaryLab}>Service</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4F46E5" />}
      >
        {/* 2. Circular Wave Button (Below summary) */}
        <View style={styles.waveSection}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.waveCircle,
                !currentZone && styles.waveCircleInactive,
                isWaved && styles.waveCircleActive,
                isSuppressed && !isWaved && styles.waveCircleSuppressed
              ]}
              onPress={currentZone ? handleWave : null}
              disabled={!currentZone}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={
                  isWaved ? ['#10B981', '#059669'] :
                    isSuppressed ? ['#F59E0B', '#D97706'] :
                      currentZone ? ['#6366F1', '#4F46E5'] :
                        ['#9CA3AF', '#6B7280']
                }
                style={styles.waveGradient}
              >
                <Ionicons
                  name={isWaved ? "sparkles" : currentZone ? "hand-right" : "location-outline"}
                  size={42}
                  color="#FFF"
                />
                <Text style={styles.waveBtnText}>
                  {isWaved ? 'ACTIVE' : currentZone ? 'WAVE' : 'STANDBY'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* 3. Current Zone Info & Reset Options */}
          <View style={styles.zoneInfoContainer}>
            {currentZone ? (
              <View style={styles.zoneDetectedCard}>
                <Text style={[styles.zoneLabel, { color: isWaved ? '#10B981' : '#4F46E5' }]}>
                  📍 DETECTED IN {currentZone.toUpperCase()}
                </Text>
                <Text style={styles.zoneActionText}>
                  {isWaved
                    ? "You are now visible to others in this zone! ✨"
                    : "Tap above to wave and connect with people here."}
                </Text>
              </View>
            ) : (
              <Text style={styles.noZoneText}>Will let you know once you enter any Connecti zones</Text>
            )}

            <TouchableOpacity style={styles.resetSuppressionBtn} onPress={handleResetSuppression}>
              <Ionicons name="refresh-circle-outline" size={16} color="#4F46E5" />
              <Text style={styles.resetSuppressionText}>Reset blocked notifications</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Events Section (Below Wave) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>RECENT ACTIVITY</Text>
            {recentEvents.length > 0 && <TouchableOpacity onPress={clearEventHistory}><Text style={styles.actionText}>Clear</Text></TouchableOpacity>}
          </View>

          {recentEvents.length > 0 ? (
            recentEvents.slice(0, 5).map((event, idx) => (
              <View key={idx} style={styles.eventCard}>
                <View style={[styles.eventIcon, { backgroundColor: event.appState === 'killed' ? '#FEE2E2' : '#E0E7FF' }]}>
                  <Ionicons name={event.appState === 'killed' ? 'skull' : 'flash'} size={14} color={event.appState === 'killed' ? '#EF4444' : '#4F46E5'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventZoneName}>{event.zone}</Text>
                  <Text style={styles.eventSub}>{new Date(event.timestamp).toLocaleTimeString()} • {event.appState.toUpperCase()}</Text>
                </View>
                {event.notificationSent && <Ionicons name="notifications" size={16} color="#10B981" />}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No recent activity detected.</Text></View>
          )}
        </View>

        {/* 5. Monitored Zones Section (At the bottom) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>MONITORED ZONES ({zonesWithDistances.length})</Text>
          {zonesWithDistances.map((z, idx) => (
            <View key={idx} style={[styles.zoneCard, z.identifier === currentZone && styles.zoneCardActive]}>
              <View style={styles.zoneCardCircle}>
                <Ionicons name="map" size={16} color={z.identifier === currentZone ? '#10B981' : '#6366F1'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zoneCardName}>{z.identifier}</Text>
                <Text style={styles.zoneCardDist}>{Math.round(z.distance)}m away • {z.radius}m radius</Text>
              </View>
              {z.distance <= z.radius && (
                <View style={styles.insightBadge}><Text style={styles.insightText}>INSIDE</Text></View>
              )}
            </View>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Persistent Control Toggle */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.toggleBtn, isGeofencingActive && styles.toggleBtnActive]}
          onPress={handleToggleGeofencing}
          activeOpacity={0.9}
        >
          <Ionicons name={isGeofencingActive ? "stop" : "play"} size={18} color="#FFF" />
          <Text style={styles.toggleBtnText}>{isGeofencingActive ? "STOP SERVICE" : "START SERVICE"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 30,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryVal: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
  },
  summaryLab: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  osDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  scrollContent: {
    padding: 24,
  },
  waveSection: {
    alignItems: 'center',
    marginBottom: 35,
  },
  waveCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#FFF',
    elevation: 20,
    padding: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  waveGradient: {
    flex: 1,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveCircleInactive: {
    shadowColor: '#9CA3AF',
  },
  waveCircleActive: {
    shadowColor: '#10B981',
  },
  waveCircleSuppressed: {
    shadowColor: '#F59E0B',
  },
  waveBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
    letterSpacing: 1,
  },
  timerBadge: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: '#064E3B',
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  timerText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  zoneInfoContainer: {
    marginTop: 25,
    alignItems: 'center',
  },
  zoneDetectedCard: {
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 2,
    width: '100%',
  },
  zoneLabel: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  zoneActionText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  noZoneText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  resetSuppressionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  resetSuppressionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  section: {
    marginBottom: 35,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 2,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    gap: 12,
    elevation: 1,
  },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventZoneName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  eventSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 1,
  },
  zoneCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  zoneCardCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  zoneCardDist: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  insightBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  insightText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 18,
    borderRadius: 24,
    elevation: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    gap: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  toggleBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
});

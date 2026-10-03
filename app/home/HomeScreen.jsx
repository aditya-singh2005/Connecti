import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    AppState,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthProvider";
import { useFriendships } from "../../hooks/useFriendships";
import { useGeofenceService } from "../../hooks/useGeofenceService";
import { supabase } from "../../lib/supabase";
import { cancelReconnection, fetchMyReconnections } from "../../services/ReconnectionService";
import { WaveService } from "../../services/WaveService";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { activeGeofences, currentZone, isGeofencingActive, startGeofencing } = useGeofenceService();
  const { unseenCount, refreshFriendships } = useFriendships();
  const [isOpenToWave, setIsOpenToWave] = useState(false);
  const [nearbyActivities, setNearbyActivities] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Location / permission awareness for zone card
  // 'checking' | 'location_off' | 'permission_missing' | 'detecting' | 'confirmed'
  const [zoneCardState, setZoneCardState] = useState('checking');

  // Fetch current user's avatar
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
  }, [user?.id]);

  // Check location services + permissions; drive zone card display state
  const checkZoneCardState = useCallback(async () => {
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) { setZoneCardState('location_off'); return; }
      const [fg, bg] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      if (fg.status !== 'granted' || bg.status !== 'granted') {
        setZoneCardState('permission_missing');
        return;
      }
      // Services on & perms granted — actual zone determined by geofence hook
      setZoneCardState('detecting');
    } catch (err) {
      console.warn('[Home] zoneCardState check failed:', err.message);
    }
  }, []);

  useEffect(() => {
    checkZoneCardState();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkZoneCardState();
    });
    return () => sub.remove();
  }, [checkZoneCardState]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let isActive = true;
    const showLocationIntro = async () => {
      const promptKey = `location_intro_shown_${user.id}`;

      try {
        if (await AsyncStorage.getItem(promptKey)) return;
        await AsyncStorage.setItem(promptKey, 'true');

        const [servicesEnabled, foreground, background] = await Promise.all([
          Location.hasServicesEnabledAsync(),
          Location.getForegroundPermissionsAsync(),
          Location.getBackgroundPermissionsAsync(),
        ]);

        if (!isActive || (servicesEnabled && foreground.status === 'granted' && background.status === 'granted')) return;

        Alert.alert(
          'Make room for nearby reunions',
          'Connecti uses location to recognize when you are near a Connecti Zone and help make reconnections possible. We do not save your precise coordinates to your account. You can change location access any time.',
          [
            { text: 'Maybe later', style: 'cancel' },
            { text: 'Enable location', onPress: () => router.push('/home/SettingsScreen') },
          ]
        );
      } catch (error) {
        console.warn('[Home] Could not check location onboarding:', error.message);
      }
    };

    showLocationIntro();
    return () => { isActive = false; };
  }, [router, user?.id]);

  const fetchWaveStatus = useCallback(async () => {
    if (!user?.id) return;

    // 1. Check local timer FIRST — it's instant and avoids race conditions on navigation
    const isLocallyWaved = await WaveService.isWavedLocal();
    if (isLocallyWaved) {
      setIsOpenToWave(true);
      return;
    }

    // 2. Fallback to DB check (covers cases where timer was cleared but DB still has the record)
    const { data } = await supabase
      .from('active_zone_users')
      .select('open_to_wave')
      .eq('user_id', user.id)
      .eq('open_to_wave', true)
      .gt('last_updated', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .maybeSingle();
    setIsOpenToWave(Boolean(data?.open_to_wave));
  }, [user?.id]);


  useEffect(() => {
    fetchWaveStatus();
  }, [fetchWaveStatus]);

  const fetchNearbyActivities = useCallback(async () => {
    if (!user?.id) return;
    try {
      const sessions = await fetchMyReconnections();
      const sessionActivities = sessions.map(session => ({ id: session.id, sessionId: session.id, title: ['SHOWN_HINTS'].includes(session.phase) ? 'Someone you might know' : session.phase === 'RECONNECTED' ? 'You found each other' : 'Reveal is waiting for both of you', description: ['SHOWN_HINTS'].includes(session.phase) ? 'A mutual Wave matched you in this Connecti Zone.' : session.phase === 'RECONNECTED' ? 'Your connection is ready to chat.' : 'Waiting for the other person to reveal.', icon: session.phase === 'RECONNECTED' ? 'sparkles-outline' : 'person-outline', color: session.phase === 'RECONNECTED' ? '#7C3AED' : '#6366F1', avatarColor: session.phase === 'RECONNECTED' ? '#F5F3FF' : '#EEF2FF', type: 'session', phase: session.phase, createdAt: session.phase_updated_at }))
        .filter(session => ['SHOWN_HINTS', 'BOTH_REVEALS_PENDING', 'RECONNECTED'].includes(session.phase));
      setNearbyActivities(sessionActivities);
    } catch (error) {
      console.warn('[Home] Could not load nearby activity:', error.message);
    }
  }, [user?.id]);

  useEffect(() => { fetchNearbyActivities(); }, [fetchNearbyActivities]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase
      .channel(`nearby-activity-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interactions',
      }, payload => {
        const session = payload.new || payload.old;
        if (session?.sender_id === user.id || session?.receiver_id === user.id) {
          fetchNearbyActivities();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNearbyActivities, user?.id]);

  useFocusEffect(
    useCallback(() => {
      const runChecks = async () => {
        try {
          await checkZoneCardState();
          if (!isGeofencingActive) {
            const [fg, bg, services] = await Promise.all([
              Location.getForegroundPermissionsAsync(),
              Location.getBackgroundPermissionsAsync(),
              Location.hasServicesEnabledAsync()
            ]);
            if (services && fg.status === 'granted' && bg.status === 'granted') {
              await startGeofencing();
            }
          }
        } catch (e) {
          console.warn('[Home] Focus check failed:', e.message);
        }
      };

      fetchWaveStatus();
      fetchNearbyActivities();
      runChecks();
    }, [fetchWaveStatus, fetchNearbyActivities, checkZoneCardState, isGeofencingActive, startGeofencing])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await checkZoneCardState();
      
      const refreshTasks = [
        fetchWaveStatus(),
        fetchNearbyActivities(),
        refreshFriendships(false),
      ];

      // If geofencing was stopped due to location off, restart it on pull-to-refresh if re-enabled
      if (!isGeofencingActive) {
        const [fg, bg, services] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          Location.getBackgroundPermissionsAsync(),
          Location.hasServicesEnabledAsync()
        ]);
        if (services && fg.status === 'granted' && bg.status === 'granted') {
          refreshTasks.push(startGeofencing());
        }
      }

      await Promise.all(refreshTasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchNearbyActivities, fetchWaveStatus, refreshFriendships, checkZoneCardState, isGeofencingActive, startGeofencing]);

  const currentHub = (typeof currentZone === 'string' ? currentZone : currentZone?.name) || null;

  // Derive final zone card state: if geofence hook says we're in a zone, override 'detecting'
  // But always prioritize OS settings off/missing over stale zone states
  const resolvedZoneState = zoneCardState === 'location_off'
    ? 'location_off'
    : zoneCardState === 'permission_missing'
    ? 'permission_missing'
    : currentHub
    ? 'confirmed'
    : (zoneCardState === 'detecting' && isGeofencingActive)
    ? 'no_zone'
    : 'detecting';

  const handleWaveButtonPress = () => {
    if (isOpenToWave) {
      // Already waving — show stop confirmation dialog
      Alert.alert(
        "Stop Waving?",
        "Do you want to stop waving in this zone?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Stop Waving",
            style: "destructive",
            onPress: async () => {
              setIsOpenToWave(false);
              if (user?.id) {
                await WaveService.stopWaving(user.id);
              }
            }
          }
        ]
      );
    } else {
      if (!currentHub || currentHub === 'No Connecti Zone detected') {
        Alert.alert(
          "No Zone Detected",
          "You need to be inside a Connecti Zone to wave. Try walking around or refreshing."
        );
        return;
      }
      // Not waving — show start confirmation, then redirect to WavesScreen with timer
      Alert.alert(
        "Start Waving",
        `You are going to wave for the current Connecti zone (${currentHub}).`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start Waving",
            onPress: async () => {
              if (!user?.id) return;
              const result = await WaveService.setOpenToWave(user.id, currentHub);
              if (result) {
                setIsOpenToWave(true);
              } else {
                Alert.alert(
                  "Wave Failed",
                  "Could not start waving. Please make sure you're in a Connecti Zone and try again."
                );
              }
            }
          }
        ]
      );
    }
  };




  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: insets.top + 20 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#6366F1" />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.avatarContainer} onPress={() => router.push('/home/ProfileScreen')} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {(user?.user_metadata?.first_name || 'A').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <View>
            <Text style={styles.greetingTitle}>Hi, {user?.user_metadata?.first_name || 'Aditya'}</Text>
            <Text style={styles.greetingSubtitle}>Ready to connect?</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.notificationBtn}
          onPress={() => router.push('/home/FriendRequestsScreen')}
          accessibilityLabel="Open Inbox"
          accessibilityRole="button"
        >
          <Ionicons name="notifications-outline" size={24} color="#111827" />
          {unseenCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unseenCount > 9 ? '9+' : unseenCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.liveIndicator} />
          <Text style={styles.statusLabel}>LIVE STATUS</Text>
        </View>
        <Text style={styles.statusTitle}>Smart Reconnect is Active</Text>
        <Text style={styles.statusDesc}>
          We&apos;re looking for reconnection opportunities around you in real-time.
        </Text>
      </View>

      {/* ── Zone Card ─────────────────────────────────────────────────────── */}
      {resolvedZoneState === 'location_off' && (
        <TouchableOpacity
          style={[styles.hubSelector, styles.hubSelectorWarning]}
          activeOpacity={0.8}
          onPress={() => router.push('/home/SettingsScreen')}
        >
          <View style={styles.hubLeft}>
            <View style={[styles.hubIconContainer, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="location-outline" size={20} color="#EF4444" />
            </View>
            <View>
              <Text style={styles.hubLabel}>Device location is off</Text>
              <Text style={[styles.hubName, { color: '#EF4444' }]}>Enable in Settings</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#EF4444" />
        </TouchableOpacity>
      )}

      {resolvedZoneState === 'permission_missing' && (
        <TouchableOpacity
          style={[styles.hubSelector, styles.hubSelectorWarning]}
          activeOpacity={0.8}
          onPress={() => router.push('/home/SettingsScreen')}
        >
          <View style={styles.hubLeft}>
            <View style={[styles.hubIconContainer, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.hubLabel}>Location permission needed</Text>
              <Text style={[styles.hubName, { color: '#F59E0B' }]}>Tap to enable in Settings</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {resolvedZoneState === 'detecting' && (
        <View style={styles.hubSelector}>
          <View style={styles.hubLeft}>
            <View style={styles.hubIconContainer}>
              <Ionicons name="radio-outline" size={20} color="#6366F1" />
            </View>
            <View>
              <Text style={styles.hubLabel}>Current Connecti Zone</Text>
              <Text style={[styles.hubName, { color: '#6B7280' }]}>Detecting nearby zones…</Text>
            </View>
          </View>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
        </View>
      )}

      {resolvedZoneState === 'no_zone' && (
        <View style={styles.hubSelector}>
          <View style={styles.hubLeft}>
            <View style={styles.hubIconContainer}>
              <Ionicons name="search-outline" size={20} color="#6366F1" />
            </View>
            <View>
              <Text style={styles.hubLabel}>Current Connecti Zone</Text>
              <Text style={[styles.hubName, { color: '#6B7280' }]}>No zones nearby</Text>
            </View>
          </View>
          <Ionicons name="ellipse-outline" size={20} color="#9CA3AF" />
        </View>
      )}

      {resolvedZoneState === 'confirmed' && (
        <View style={styles.hubSelector}>
          <View style={styles.hubLeft}>
            <View style={styles.hubIconContainer}>
              <Ionicons name="location-outline" size={20} color="#6366F1" />
            </View>
            <View>
              <Text style={styles.hubLabel}>Current Connecti Zone</Text>
              <Text style={styles.hubName}>{currentHub}</Text>
            </View>
          </View>
          <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
        </View>
      )}

      <View style={styles.waveSection}>
        <TouchableOpacity 
          style={[styles.waveButton, isOpenToWave ? styles.waveButtonActive : styles.waveButtonInactive]} 
          onPress={handleWaveButtonPress}
          activeOpacity={0.8}
        >
          <Ionicons name="water-outline" size={48} color="#FFFFFF" style={{ marginBottom: 8 }} />
          <Text style={styles.waveButtonText}>{isOpenToWave ? "WAVING" : "SEND A WAVE"}</Text>
          {isOpenToWave && <Text style={styles.waveButtonSub}>Tap to manage</Text>}
        </TouchableOpacity>
        <Text style={styles.waveHint}>
          A Wave alerts people you&apos;ve met before that you&apos;re nearby.
        </Text>
      </View>

      <View style={styles.activitySection}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Nearby Activity</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityList}>
          {nearbyActivities.length === 0 ? (
            <View style={styles.emptyActivity}><Ionicons name="shield-checkmark-outline" size={24} color="#94A3B8" /><Text style={styles.emptyActivityText}>No private reconnection activity yet.</Text></View>
          ) : nearbyActivities.map(activity => (
            <View key={activity.id} style={styles.activityCard}>
              <View style={[styles.activityIconBox, { backgroundColor: activity.avatarColor }]}><Ionicons name={activity.icon} size={22} color={activity.color} /></View>
              <View style={styles.activityContent}>
                <Text style={styles.activityCardTitle}>{activity.title}</Text>
                <Text style={styles.activityCardDesc}>{activity.description}</Text>
                {['SHOWN_HINTS', 'BOTH_REVEALS_PENDING'].includes(activity.phase) ? (
                  <View style={styles.activityActions}>
                    <TouchableOpacity
                      style={styles.showHintButton}
                      onPress={() => router.push({ pathname: '/home/ShowHintScreen', params: { sessionId: activity.sessionId } })}
                    >
                      <Text style={styles.showHintButtonText}>Show hints</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeActivityButton}
                      onPress={async () => {
                        await cancelReconnection(activity.sessionId);
                        fetchNearbyActivities();
                      }}
                    >
                      <Text style={styles.removeActivityButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {activity.phase === 'RECONNECTED' ? (
                  <View style={styles.activityActions}>
                    <TouchableOpacity
                      style={styles.showHintButton}
                      onPress={() => router.push({ pathname: '/home/RevealedScreen', params: { sessionId: activity.sessionId } })}
                    >
                      <Text style={styles.showHintButtonText}>See who it is</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C7CFA',
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#5C7CFA',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  statusLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusDesc: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    lineHeight: 18,
  },
  activityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  showHintButton: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  showHintButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  removeActivityButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  removeActivityButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  hubSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  hubSelectorWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  hubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hubIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  hubName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  waveSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  waveButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  waveButtonInactive: {
    backgroundColor: '#5C7CFA',
  },
  waveButtonActive: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  waveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  waveButtonSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  waveHint: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 40,
  },
  activitySection: {
    flex: 1,
  },
  emptyActivity: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 30,
  },
  emptyActivityText: {
    color: '#64748B',
    fontSize: 14,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C7CFA',
  },
  activityList: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  activityIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  activityAvatar: {
    width: '100%',
    height: '100%',
  },
  activityContent: {
    flex: 1,
    justifyContent: 'center',
  },
  activityCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  activityCardDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  activityTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  waveBackBtn: {
    backgroundColor: '#5C7CFA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  waveBackText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

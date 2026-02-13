// app/home/HomeScreen.jsx - FIXED VERSION
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
// import { LinearGradient } from 'expo-linear-gradient'; // REMOVED
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useFriendships } from "../../hooks/useFriendships";
import { useGeofenceService } from "../../hooks/useGeofenceService";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase"; // Import Supabase
import { useAuth } from "../../context/AuthProvider";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth(); // Get user for match fetching
  const insets = useSafeAreaInsets();

  const [activeMatch, setActiveMatch] = useState(null);

  // Fetch active matches on mount and focus
  useEffect(() => {
    if (!user?.id) return;

    fetchActiveMatch();

    // 🚀 NEW: Realtime match detection
    const channel = supabase
      .channel(`home_monitor_${user.id.slice(0, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT/UPDATE to catch matches and status changes
          schema: 'public',
          table: 'wave_notification_logs',
          filter: `or(user1_id.eq.${user.id},user2_id.eq.${user.id})`
        },
        (payload) => {
          console.log('[Home] ⚡ Realtime match update:', payload.new);
          if (payload.new && payload.new.both_notified) {
            // Check staleness before setting
            const matchTime = new Date(payload.new.matched_at).getTime();
            if (Date.now() - matchTime < 60 * 60 * 1000) {
              setActiveMatch(payload.new);
            } else {
              setActiveMatch(null);
            }
          } else {
            // If both_notified is false or it was deleted, clear it
            setActiveMatch(null);
          }
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      fetchActiveMatch();
    }, 15000); // Periodic fallback sync

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id]);

  const fetchActiveMatch = async () => {
    try {
      const { data, error } = await supabase
        .from('wave_notification_logs')
        .select('*')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq('both_notified', true)
        .order('matched_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        const matchTime = new Date(data.matched_at).getTime();
        if (Date.now() - matchTime < 60 * 60 * 1000) {
          setActiveMatch(data);
          return;
        }
      }
      setActiveMatch(null);
    } catch (e) {
      setActiveMatch(null);
    }
  };

  // Friendships for badge counts
  const {
    friendCount: totalFriends,
    pendingCount
  } = useFriendships();

  // Geofencing status
  const {
    isGeofencingActive,
    activeGeofences,
    recentEvents,
    nativeSupport,
    loadRecentEvents,
    startGeofencing, // ✅ Import start function
  } = useGeofenceService();

  const [geofenceBadge, setGeofenceBadge] = useState(0);
  const [killedEvents, setKilledEvents] = useState(0);

  // ✅ FIXED: Auto-start geofencing on mount
  useEffect(() => {
    const init = async () => {
      await loadRecentEvents();

      // 🚀 Explicit Auto-Start
      if (!isGeofencingActive) {
        console.log('[HomeScreen] 🚀 Auto-starting geofencing...');
        startGeofencing();
      }
    };
    init();
  }, []); // Run once on mount

  // Update badge based on recent events
  useEffect(() => {
    if (recentEvents && recentEvents.length > 0) {
      // Count events from last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = recentEvents.filter(event =>
        new Date(event.timestamp) > oneHourAgo
      ).length;
      setGeofenceBadge(recentCount);

      // Count killed app events
      const killedCount = recentEvents.filter(event =>
        event.appKilled === true
      ).length;
      setKilledEvents(killedCount);
    } else {
      setGeofenceBadge(0);
      setKilledEvents(0);
    }
  }, [recentEvents]);

  // Menu Items Configuration
  const menuItems = [
    {
      id: 'ble-test',
      icon: 'radio',
      label: 'BLE Detection',
      color: '#10B981',
      bgColor: '#D1FAE5',
      route: '/home/BLETestScreen',
    },
    {
      id: 'notifications',
      icon: 'notifications',
      label: 'Notifications',
      color: '#F59E0B',
      bgColor: '#FEF3C7',
      route: '/home/NotificationTestScreen',
      badge: 0,
    },
    {
      id: 'geofence',
      icon: isGeofencingActive ? 'location' : 'location-outline',
      label: 'Geofencing',
      color: isGeofencingActive ? '#10B981' : '#6366F1',
      bgColor: isGeofencingActive ? '#D1FAE5' : '#EEF2FF',
      route: '/home/GeofenceTestScreen',
      badge: geofenceBadge,
      badgeColor: isGeofencingActive ? '#10B981' : '#6366F1',
    },
    {
      id: 'search',
      icon: 'person-add',
      label: 'Add Friends',
      color: '#8B5CF6',
      bgColor: '#F5F3FF',
      route: '/home/SearchScreen',
      badge: pendingCount || 0,
    },
    {
      id: 'alerts',
      icon: 'alarm',
      label: 'Alerts',
      color: '#EC4899',
      bgColor: '#FCE7F3',
      route: '/home/ProximitySettingsScreen',
    },
    {
      id: 'permissions',
      icon: 'shield-checkmark',
      label: 'Permissions',
      color: '#14B8A6',
      bgColor: '#CCFBF1',
      route: '/home/PermissionsScreen',
    },
    {
      id: 'settings',
      icon: 'settings',
      label: 'Settings',
      color: '#6B7280',
      bgColor: '#F3F4F6',
      route: '/home/SettingsScreen',
    }
  ];

  // Status card component
  const StatusCard = () => (
    <TouchableOpacity
      style={styles.statusCard}
      onPress={() => router.push('/home/GeofenceTestScreen')}
      activeOpacity={0.8}
    >
      <View style={styles.statusContent}>
        <View style={styles.statusIconContainer}>
          <Ionicons
            name={isGeofencingActive ? "checkmark-circle" : "pause-circle"}
            size={24}
            color={isGeofencingActive ? "#10B981" : "#9CA3AF"}
          />
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusTitle}>
            {isGeofencingActive ? "✅ Zone Monitoring Active" : "📍 Geofencing Inactive"}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isGeofencingActive
              ? `Monitoring ${activeGeofences.length} zones • ${nativeSupport ? 'Native support enabled' : 'Native support disabled'}`
              : "Tap to start monitoring zones (works when app is closed)"
            }
          </Text>
          {killedEvents > 0 && (
            <Text style={styles.killedEventsText}>
              🎯 {killedEvents} events from killed app state
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );

  const ActiveMatchCard = () => {
    if (!activeMatch) return null;

    const isRevealed = activeMatch.revealed_at !== null;

    return (
      <TouchableOpacity
        style={styles.activeMatchCard}
        onPress={() => router.push({ pathname: '/home/HintScreen', params: { matchId: activeMatch.id } })}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.activeMatchContent,
            isRevealed && styles.activeMatchContentRevealed,
            !isRevealed && { backgroundColor: '#4F46E5' } // Explicit fallback for unrevealed
          ]}
        >
          <View style={[styles.matchIconContainer, isRevealed && { backgroundColor: '#C7D2FE' }]}>
            <Ionicons
              name={isRevealed ? "heart" : "search"}
              size={24}
              color={isRevealed ? "#4F46E5" : "#FFFFFF"}
            />
          </View>
          <View style={styles.matchTextContainer}>
            <Text style={[styles.matchTitle, isRevealed && { color: '#111827' }]}>
              {isRevealed ? "It's a Match! 🎉" : "New Hint Received! 🔍"}
            </Text>
            <Text style={[styles.matchSubtitle, isRevealed && { color: '#4B5563' }]}>
              {isRevealed ? "Tap to see who you matched with!" : "Tap to check anonymous hints..."}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={isRevealed ? "#9CA3AF" : "#A5B4FC"} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Modern Header */}
      <View style={[styles.header, { paddingTop: insets.top + (insets.top > 20 ? 10 : 20) }]}>
        <View style={styles.headerContent}>
          {/* CHANGED: Using actual app logo image instead of icon */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="cover"
            />
          </View>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.appName}>Connecti</Text>
          </View>
        </View>
      </View>

      {/* Status Card - Shows geofencing status */}
      <View style={styles.statusSection}>
        <StatusCard />
      </View>

      {/* ✅ ACTIVE MATCH CARD - Shows if there's a match/hint waiting */}
      <ActiveMatchCard />

      {/* Menu Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.menuGrid}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: item.bgColor }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <View style={[styles.menuBadge, { backgroundColor: item.badgeColor || '#EF4444' }]}>
                    <Text style={styles.menuBadgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Tips Section */}
      {isGeofencingActive && nativeSupport && (
        <View style={styles.tipsSection}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={20} color="#F59E0B" />
            <Text style={styles.tipsTitle}>Quick Tip</Text>
          </View>
          <Text style={styles.tipsText}>
            ✅ Native geofencing is active and works even when app is closed! {"\n"}
            To test: Close app → Use Fake GPS → Get notification 🎯{"\n"}
            ✅ Uses native Android GeofencingClient for killed-state support
          </Text>
        </View>
      )}

      {!nativeSupport && (
        <View style={styles.warningSection}>
          <View style={styles.tipsHeader}>
            <Ionicons name="warning" size={20} color="#EF4444" />
            <Text style={[styles.tipsTitle, { color: '#EF4444' }]}>Native Module Not Available</Text>
          </View>
          <Text style={[styles.tipsText, { color: '#DC2626' }]}>
            The native geofencing module is not available. {"\n"}
            Make sure you've rebuilt the app after adding native code.{"\n"}
            {"\n"}
            Run: eas build --profile preview --platform android
          </Text>
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
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  // CHANGED: Updated logo styles to accommodate the image
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    transform: [{ scale: 1.10 }],
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  greeting: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  // Status Section
  statusSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  killedEventsText: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 4,
    fontWeight: '600',
  },

  // Menu Section
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuItem: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  menuBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  menuBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },

  // Tips Section
  tipsSection: {
    backgroundColor: '#FFFBEB',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningSection: {
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  tipsText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
  },

  // Active Match Card
  activeMatchCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  //   activeMatchGradient: {
  //     borderRadius: 16,
  //     padding: 1, // Border effect
  //   },
  activeMatchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    backgroundColor: '#4F46E5', // Fallback solid color
  },
  activeMatchContentRevealed: {
    backgroundColor: '#EEF2FF',
  },
  matchIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchTextContainer: {
    flex: 1,
  },
  matchTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  matchSubtitle: {
    fontSize: 12,
    color: '#E0E7FF',
  },
});
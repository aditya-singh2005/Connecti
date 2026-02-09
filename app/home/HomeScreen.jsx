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
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useFriendships } from "../../hooks/useFriendships";
import { useGeofenceService } from "../../hooks/useGeofenceService";

export default function HomeScreen() {
  const router = useRouter();

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
    nativeSupport, // ✅ Check native support
    loadRecentEvents, // ✅ Use this instead of checkAndAutoRestart
  } = useGeofenceService();

  const [geofenceBadge, setGeofenceBadge] = useState(0);
  const [killedEvents, setKilledEvents] = useState(0);

  // ✅ FIXED: Load events on mount (no checkAndAutoRestart)
  useEffect(() => {
    const init = async () => {
      await loadRecentEvents();
    };
    init();
  }, []);

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

  return (
    <ScrollView style={styles.container}>
      {/* Modern Header */}
      <View style={styles.header}>
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
    paddingTop: 60,
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
    shadowOffset: { width: 0,height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    transform: [{ scale: 1.10}],
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
});
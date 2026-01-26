// app/home/HomeScreen.jsx - CONNECTI HOME - MENU ONLY ✨
import React from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useFriendships } from "../../hooks/useFriendships";

export default function HomeScreen() {
  const router = useRouter();

  // Friendships for badge counts
  const {
    friendCount: totalFriends,
    pendingCount
  } = useFriendships();

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
    },
    {
      id: 'search',
      icon: 'person-add',
      label: 'Add Friends',
      color: '#8B5CF6',
      bgColor: '#F5F3FF',
      route: '/home/SearchScreen',
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

  return (
    <ScrollView style={styles.container}>
      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <View style={styles.logoGradient}>
              <Ionicons name="radio" size={28} color="#FFF" />
            </View>
          </View>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.appName}>Connecti</Text>
          </View>
        </View>
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
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  logoGradient: {
    width: '100%',
    height: '100%',
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
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
});
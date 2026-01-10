// app/home/HomeScreen.jsx - CLEAN, WARM, FRIENDLY UI ✨
import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert,
  Linking,
  Platform
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useBleService } from "../../hooks/useBLEService";
import { useFriendships } from "../../hooks/useFriendships";

export default function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);

  // BLE service
  const {
    detectedFriends, // NEW: Use direct detected friends from hook
    isTracking,
    lastUpdate,
    startTracking,
    stopTracking,
    refreshLocation,
    nearbyDevices,
    bleEnabled,
    hasPermission: hasBLEPermission,
    checkPermissions,
  } = useBleService({
    updateInterval: 15000,
    scanDuration: 8000
  });

  // Friendships
  const {
    pendingRequests,
    acceptFriendRequest,
    removeFriendship,
    friendCount: totalFriends,
    pendingCount
  } = useFriendships();

  // Auto-start BLE
  useEffect(() => {
    const init = async () => {
      if (autoStartAttempted) return;
      setAutoStartAttempted(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await checkPermissions();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!isTracking) {
        await startTracking();
      }
    };
    init();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshLocation();
    setRefreshing(false);
  };

  const toggleBLE = async () => {
    if (isTracking) {
      stopTracking();
    } else {
      if (!bleEnabled) {
        Alert.alert(
          "Turn on Bluetooth",
          "Enable Bluetooth to find friends nearby",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Settings", onPress: () => {
              if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
              } else {
                Linking.openURL('App-Prefs:Bluetooth');
              }
            }}
          ]
        );
        return;
      }
      await startTracking();
    }
  };

  const getDistanceEmoji = (distance) => {
    if (distance < 10) return '🔥';
    if (distance < 25) return '👋';
    return '📍';
  };

  const getDistanceColor = (distance) => {
    if (distance < 10) return '#10B981'; // Green - very close
    if (distance < 25) return '#4A90E2'; // Blue - nearby
    return '#6B7280'; // Gray - far
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={["#4A90E2"]}
          tintColor="#4A90E2"
        />
      }
    >
      {/* Warm Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello! 👋</Text>
          <Text style={styles.appName}>Connecti</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsBtn}
          onPress={() => router.push('/home/SettingsScreen')}
        >
          <Ionicons name="settings-outline" size={26} color="#4A90E2" />
        </TouchableOpacity>
      </View>

      {/* Status Banner - Only show if there's an issue */}
      {(!bleEnabled || !hasBLEPermission) && (
        <TouchableOpacity 
          style={styles.statusBanner}
          onPress={toggleBLE}
        >
          <Ionicons 
            name={!bleEnabled ? "bluetooth-outline" : "lock-closed-outline"} 
            size={24} 
            color="#4A90E2" 
          />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              {!bleEnabled ? "Bluetooth is off" : "Permission needed"}
            </Text>
            <Text style={styles.bannerSubtitle}>
              Tap to {!bleEnabled ? "enable" : "grant access"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#4A90E2" />
        </TouchableOpacity>
      )}

      {/* Simple Stats - 2 cards only */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="people" size={32} color="#4A90E2" />
          </View>
          <Text style={styles.statNumber}>{totalFriends}</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>
        
        <View style={[styles.statCard, styles.statCardActive]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="radio-outline" size={32} color="#4ECDC4" />
          </View>
          <Text style={styles.statNumber}>{detectedFriends.length}</Text>
          <Text style={styles.statLabel}>Nearby</Text>
        </View>
      </View>

      {/* Scanning Control - Simplified */}
      <View style={styles.scanCard}>
        <View style={styles.scanContent}>
          <View style={styles.scanInfo}>
            <View style={styles.scanTitleRow}>
              <Text style={styles.scanTitle}>Friend Detector</Text>
              {isTracking && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              )}
            </View>
            <Text style={styles.scanSubtitle}>
              {isTracking 
                ? `Found ${nearbyDevices?.length || 0} devices nearby`
                : "Start to find friends around you"
              }
            </Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.scanButton, isTracking && styles.scanButtonActive]}
            onPress={toggleBLE}
            disabled={!bleEnabled || !hasBLEPermission}
          >
            <Ionicons 
              name={isTracking ? "pause" : "play"} 
              size={28} 
              color="white" 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Friend Requests - Only if exists */}
      {pendingCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Requests 💌</Text>
          {pendingRequests.map(req => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.requestAvatar}>
                <Text style={styles.requestInitial}>
                  {req.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{req.name}</Text>
                <Text style={styles.requestEmail}>{req.contact}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity 
                  onPress={() => acceptFriendRequest(req.id)}
                  style={styles.acceptBtn}
                >
                  <Ionicons name="checkmark" size={22} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => removeFriendship(req.id)}
                  style={styles.declineBtn}
                >
                  <Ionicons name="close" size={22} color="#666" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Nearby Friends - Clean & Simple */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Friends Nearby 📍</Text>
          {isTracking && (
            <TouchableOpacity onPress={handleRefresh}>
              <Ionicons name="refresh" size={22} color="#4A90E2" />
            </TouchableOpacity>
          )}
        </View>

        {!isTracking ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pause-circle-outline" size={64} color="#DDD" />
            </View>
            <Text style={styles.emptyTitle}>Detector Paused</Text>
            <Text style={styles.emptyMessage}>
              Start scanning to find friends nearby
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={toggleBLE}>
              <Text style={styles.emptyButtonText}>Start Scanning</Text>
            </TouchableOpacity>
          </View>
        ) : detectedFriends.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={64} color="#DDD" />
            </View>
            <Text style={styles.emptyTitle}>Searching...</Text>
            <Text style={styles.emptyMessage}>
              {totalFriends === 0 
                ? "Add friends to detect them nearby"
                : "Make sure friends have their detector on"
              }
            </Text>
            {totalFriends === 0 && (
              <TouchableOpacity 
                style={styles.emptyButton}
                onPress={() => router.push('/home/SearchScreen')}
              >
                <Text style={styles.emptyButtonText}>Add Friends</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View>
            {detectedFriends.map(friend => (
              <TouchableOpacity 
                key={friend.id} 
                style={styles.friendCard}
                onPress={() => {
                  Alert.alert(
                    `${getDistanceEmoji(friend.distance)} ${friend.name}`,
                    `About ${Math.round(friend.distance)}m away\n${friend.similarity}% signal match`,
                    [{ text: "Got it!" }]
                  );
                }}
              >
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendInitial}>
                    {friend.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendDistance}>
                      {getDistanceEmoji(friend.distance)} ~{Math.round(friend.distance)}m away
                    </Text>
                  </View>
                </View>
                <View style={[styles.friendIndicator, { 
                  backgroundColor: getDistanceColor(friend.distance) 
                }]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Quick Actions - Simplified */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => router.push('/home/SearchScreen')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="person-add-outline" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.quickActionText}>Add Friends</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => router.push('/home/ProximitySettingsScreen')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="notifications-outline" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.quickActionText}>Alerts</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => router.push('/home/PermissionsScreen')}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.quickActionText}>Permissions</Text>
        </TouchableOpacity>
      </View>

      {/* Debug Info - At Bottom */}
      {__DEV__ && (
        <View style={styles.debugSection}>
          <TouchableOpacity 
            style={styles.debugHeader}
            onPress={() => {
              // Can add toggle functionality if needed
            }}
          >
            <Text style={styles.debugTitle}>🐛 Debug Info</Text>
          </TouchableOpacity>
          <View style={styles.debugContent}>
            <Text style={styles.debugText}>Tracking: {isTracking ? '✅' : '❌'}</Text>
            <Text style={styles.debugText}>Bluetooth: {bleEnabled ? '✅' : '❌'}</Text>
            <Text style={styles.debugText}>Permission: {hasBLEPermission ? '✅' : '❌'}</Text>
            <Text style={styles.debugText}>Devices: {nearbyDevices?.length || 0}</Text>
            <Text style={styles.debugText}>Friends Detected: {detectedFriends.length}</Text>
            <Text style={styles.debugText}>Total Friends: {totalFriends}</Text>
          </View>
        </View>
      )}

      {/* Bottom padding */}
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
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#FFF',
  },
  greeting: {
    fontSize: 16,
    color: '#999',
    marginBottom: 4,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2D3436',
    letterSpacing: -1,
  },
  settingsBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bannerText: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardActive: {
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  statIconContainer: {
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  scanCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 24,
    marginVertical: 8,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scanContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scanInfo: {
    flex: 1,
  },
  scanTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  scanSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanButtonActive: {
    backgroundColor: '#95A5A6',
    shadowColor: '#95A5A6',
  },
  section: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  requestAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EBF5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  requestInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4A90E2',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 2,
  },
  requestEmail: {
    fontSize: 14,
    color: '#999',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  friendAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  friendInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  friendMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendDistance: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  friendIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 8,
  },
  quickAction: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3436',
  },
  debugSection: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 32,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  debugHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  debugTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3436',
  },
  debugContent: {
    padding: 16,
    gap: 8,
  },
  debugText: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
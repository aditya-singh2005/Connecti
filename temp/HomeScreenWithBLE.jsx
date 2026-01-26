  // app/home/HomeScreen.jsx - MODERN UI WITH REAL HARDWARE DETECTION ✨
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
    Platform,
    PermissionsAndroid,
    AppState,
    Image
  } from "react-native";
  import { useRouter } from "expo-router";
  import { Ionicons } from '@expo/vector-icons';
  import * as Location from 'expo-location';
  import * as Notifications from 'expo-notifications';
  import { useBleService } from "../../hooks/useBLEService";
  import { useFriendships } from "../../hooks/useFriendships";

  export default function HomeScreen() {
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [autoStartAttempted, setAutoStartAttempted] = useState(false);

    // Real-time hardware status
    const [hardwareStatus, setHardwareStatus] = useState({
      bluetooth: false,
      location: false,
      notifications: false,
      bluetoothPermission: false,
      locationPermission: false,
    });

    // BLE service
    const {
      detectedFriends,
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

    // Check all hardware status
    const checkHardwareStatus = async () => {
      const newStatus = {};

      try {
        // BLUETOOTH - Hardware + Permission
        if (Platform.OS === 'android') {
          const androidVersion = Platform.Version;
          let hasPermission = false;
          let hardwareEnabled = false;

          if (androidVersion >= 31) {
            const scanGranted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
            );
            const connectGranted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            );
            hasPermission = scanGranted && connectGranted;
          } else {
            hasPermission = true;
          }

          try {
            const BluetoothStateManager = require('react-native-bluetooth-state-manager').default;
            const state = await BluetoothStateManager.getState();
            hardwareEnabled = state === 'PoweredOn';
          } catch (e) {
            hardwareEnabled = hasPermission;
          }

          newStatus.bluetooth = hardwareEnabled;
          newStatus.bluetoothPermission = hasPermission;
        } else {
          try {
            const BluetoothStateManager = require('react-native-bluetooth-state-manager').default;
            const state = await BluetoothStateManager.getState();
            newStatus.bluetooth = state === 'PoweredOn';
            newStatus.bluetoothPermission = true;
          } catch (e) {
            newStatus.bluetooth = true;
            newStatus.bluetoothPermission = true;
          }
        }

        // LOCATION - Hardware + Permission
        if (Platform.OS === 'android') {
          const locationGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          const locationEnabled = await Location.hasServicesEnabledAsync();
          
          newStatus.location = locationEnabled;
          newStatus.locationPermission = locationGranted;
        } else {
          const { status: locStatus } = await Location.getForegroundPermissionsAsync();
          const locationEnabled = await Location.hasServicesEnabledAsync();
          
          newStatus.location = locationEnabled;
          newStatus.locationPermission = locStatus === 'granted';
        }

        // NOTIFICATIONS
        const notifStatus = await Notifications.getPermissionsAsync();
        newStatus.notifications = notifStatus.status === 'granted';

        setHardwareStatus(newStatus);
      } catch (error) {
        console.error('Error checking hardware status:', error);
      }
    };

    // Real-time status monitoring
    useEffect(() => {
      checkHardwareStatus();
      
      const interval = setInterval(() => {
        checkHardwareStatus();
      }, 2000);

      const subscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          checkHardwareStatus();
        }
      });

      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, []);

    // Auto-start BLE
    useEffect(() => {
      const init = async () => {
        if (autoStartAttempted) return;
        setAutoStartAttempted(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkPermissions();
        await checkHardwareStatus();
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!isTracking && allSystemsReady) {
          await startTracking();
        }
      };
      init();
    }, []);

    const handleRefresh = async () => {
      setRefreshing(true);
      await checkHardwareStatus();
      await refreshLocation();
      setRefreshing(false);
    };

    const toggleBLE = async () => {
      if (isTracking) {
        stopTracking();
      } else {
        // Check if Bluetooth hardware is actually ON
        if (!hardwareStatus.bluetooth) {
          Alert.alert(
            "Bluetooth is Off",
            "Please turn on Bluetooth to detect friends nearby",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Open Settings", 
                onPress: () => {
                  if (Platform.OS === 'android') {
                    Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                  } else {
                    Linking.openURL('App-Prefs:Bluetooth');
                  }
                }
              }
            ]
          );
          return;
        }

        // Check if Location hardware is actually ON
        if (!hardwareStatus.location) {
          Alert.alert(
            "Location is Off",
            "Please turn on Location services to detect friends nearby",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Open Settings", 
                onPress: () => Linking.openSettings()
              }
            ]
          );
          return;
        }

        // Check permissions
        if (!hardwareStatus.bluetoothPermission || !hardwareStatus.locationPermission) {
          router.push('/home/PermissionsScreen');
          return;
        }

        await startTracking();
      }
    };

    const openPermissionSettings = () => {
      router.push('/home/PermissionsScreen');
    };

    const getDistanceEmoji = (distance) => {
      if (distance < 10) return '🔥';
      if (distance < 25) return '👋';
      return '📍';
    };

    const getDistanceColor = (distance) => {
      if (distance < 10) return '#10B981';
      if (distance < 25) return '#3B82F6';
      return '#8B5CF6';
    };

    // Check if all systems are ready
    const allSystemsReady = hardwareStatus.bluetooth && 
                            hardwareStatus.location && 
                            hardwareStatus.bluetoothPermission && 
                            hardwareStatus.locationPermission;

    const hasAnyIssue = !allSystemsReady;
    const issueCount = [
      !hardwareStatus.bluetooth,
      !hardwareStatus.location,
      !hardwareStatus.bluetoothPermission,
      !hardwareStatus.locationPermission,
      !hardwareStatus.notifications
    ].filter(Boolean).length;

    return (
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#6366F1"]}
            tintColor="#6366F1"
          />
        }
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image 
              source={{ uri: 'YOUR_LOGO_URL_HERE' }} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.appName}>Connecti</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.settingsBtn}
            onPress={() => router.push('/home/SettingsScreen')}
          >
            <Ionicons name="settings-outline" size={22} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {/* SETUP REQUIRED BANNER - Friendly Warning */}
        {hasAnyIssue && (
          <TouchableOpacity 
            style={styles.setupBanner}
            onPress={openPermissionSettings}
            activeOpacity={0.8}
          >
            <View style={styles.setupBannerContent}>
              <View style={styles.setupIconContainer}>
                <Ionicons name="information-circle" size={24} color="#F59E0B" />
              </View>
              <View style={styles.setupTextContainer}>
                <Text style={styles.setupTitle}>Setup Needed</Text>
                <Text style={styles.setupSubtitle}>
                  {issueCount} permission{issueCount > 1 ? 's' : ''} required
                </Text>
              </View>
              <View style={styles.setupAction}>
                <Text style={styles.setupActionText}>Fix</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Modern Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIconBg}>
              <Ionicons name="people" size={28} color="#6366F1" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statNumber}>{totalFriends}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>
          
          <View style={[styles.statCard, styles.statCardHighlight]}>
            <View style={[styles.statIconBg, styles.statIconHighlight]}>
              <Ionicons name="locate" size={28} color="#10B981" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statNumber}>{detectedFriends.length}</Text>
              <Text style={styles.statLabel}>Nearby Now</Text>
            </View>
          </View>
        </View>

        {/* Detection Control Card */}
        <View style={styles.controlCard}>
          <View style={styles.controlHeader}>
            <View style={styles.controlInfo}>
              <Text style={styles.controlTitle}>Friend Detection</Text>
              <View style={styles.statusRow}>
                {isTracking ? (
                  <>
                    <View style={styles.pulseDot} />
                    <Text style={styles.statusActive}>Active</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.statusDotInactive} />
                    <Text style={styles.statusInactive}>Paused</Text>
                  </>
                )}
              </View>
            </View>
            
            {/* Permission Badges */}
            <View style={styles.badgesContainer}>
              <View style={[styles.permBadge, hardwareStatus.bluetooth && styles.permBadgeActive]}>
                <Ionicons 
                  name={hardwareStatus.bluetooth ? "bluetooth" : "bluetooth-outline"} 
                  size={16} 
                  color={hardwareStatus.bluetooth ? "#10B981" : "#9CA3AF"} 
                />
              </View>
              <View style={[styles.permBadge, hardwareStatus.location && styles.permBadgeActive]}>
                <Ionicons 
                  name={hardwareStatus.location ? "location" : "location-outline"} 
                  size={16} 
                  color={hardwareStatus.location ? "#10B981" : "#9CA3AF"} 
                />
              </View>
              <View style={[styles.permBadge, hardwareStatus.notifications && styles.permBadgeActive]}>
                <Ionicons 
                  name={hardwareStatus.notifications ? "notifications" : "notifications-outline"} 
                  size={16} 
                  color={hardwareStatus.notifications ? "#10B981" : "#9CA3AF"} 
                />
              </View>
            </View>
          </View>

          <Text style={styles.controlDescription}>
            {isTracking 
              ? `Scanning... ${nearbyDevices?.length || 0} devices detected`
              : allSystemsReady 
                ? "Tap to start detecting friends nearby"
                : "Fix permissions to start detecting"
            }
          </Text>

          {/* Large Toggle Button */}
          <TouchableOpacity 
            style={[
              styles.toggleButton,
              isTracking && styles.toggleButtonActive,
              !allSystemsReady && styles.toggleButtonDisabled
            ]}
            onPress={toggleBLE}
            activeOpacity={0.8}
          >
            <View style={styles.toggleButtonContent}>
              <Ionicons 
                name={isTracking ? "pause" : allSystemsReady ? "play" : "lock-closed"} 
                size={24} 
                color="#FFF" 
              />
              <Text style={styles.toggleButtonText}>
                {isTracking 
                  ? "Stop Detecting" 
                  : allSystemsReady 
                    ? "Start Detecting"
                    : "Enable Permissions"
                }
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Friend Requests */}
        {pendingCount > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Friend Requests</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            </View>
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
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => removeFriendship(req.id)}
                    style={styles.declineBtn}
                  >
                    <Ionicons name="close" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Nearby Friends */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friends Nearby</Text>
            {isTracking && (
              <TouchableOpacity onPress={handleRefresh}>
                <Ionicons name="refresh" size={20} color="#6366F1" />
              </TouchableOpacity>
            )}
          </View>

          {!isTracking ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="pause-circle" size={64} color="#E5E7EB" />
              </View>
              <Text style={styles.emptyTitle}>Detection Paused</Text>
              <Text style={styles.emptyText}>
                Start detection to find friends nearby
              </Text>
            </View>
          ) : detectedFriends.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search" size={64} color="#E5E7EB" />
              </View>
              <Text style={styles.emptyTitle}>Looking for friends...</Text>
              <Text style={styles.emptyText}>
                {totalFriends === 0 
                  ? "Add friends to detect them nearby"
                  : "Ensure friends have detection enabled"
                }
              </Text>
            </View>
          ) : (
            <View>
              {detectedFriends.map(friend => (
                <TouchableOpacity 
                  key={friend.id} 
                  style={styles.friendCard}
                  onPress={() => {
                    Alert.alert(
                      `${friend.name} is nearby!`,
                      `Distance: ~${Math.round(friend.distance)}m\nSignal: ${friend.similarity}%`,
                      [{ text: "OK" }]
                    );
                  }}
                >
                  <View style={[styles.friendAvatar, { 
                    borderColor: getDistanceColor(friend.distance) 
                  }]}>
                    <Text style={styles.friendInitial}>
                      {friend.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <Text style={styles.friendDistance}>
                      {getDistanceEmoji(friend.distance)} ~{Math.round(friend.distance)}m away
                    </Text>
                  </View>
                  <View style={[styles.distanceIndicator, { 
                    backgroundColor: getDistanceColor(friend.distance) 
                  }]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickAction}
            onPress={() => router.push('/home/SearchScreen')}
          >
            <Ionicons name="person-add" size={22} color="#6366F1" />
            <Text style={styles.quickActionText}>Add Friends</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.quickAction}
            onPress={() => router.push('/home/ProximitySettingsScreen')}
          >
            <Ionicons name="notifications" size={22} color="#8B5CF6" />
            <Text style={styles.quickActionText}>Alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.quickAction, styles.permissionsAction]}
            onPress={openPermissionSettings}
          >
            <View style={styles.quickActionIconWrapper}>
              <Ionicons name="shield-checkmark" size={22} color="#10B981" />
              {hasAnyIssue && (
                <View style={styles.quickActionBadge}>
                  <Text style={styles.quickActionBadgeText}>{issueCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.quickActionText}>Permissions</Text>
          </TouchableOpacity>
        </View>

        {/* Debug Info */}
        {__DEV__ && (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>🔧 Debug Info</Text>
            <View style={styles.debugGrid}>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Tracking</Text>
                <Text style={styles.debugValue}>{isTracking ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>BT Hardware</Text>
                <Text style={styles.debugValue}>{hardwareStatus.bluetooth ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>BT Permission</Text>
                <Text style={styles.debugValue}>{hardwareStatus.bluetoothPermission ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Location HW</Text>
                <Text style={styles.debugValue}>{hardwareStatus.location ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Location Perm</Text>
                <Text style={styles.debugValue}>{hardwareStatus.locationPermission ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Notifications</Text>
                <Text style={styles.debugValue}>{hardwareStatus.notifications ? '✅' : '❌'}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Devices</Text>
                <Text style={styles.debugValue}>{nearbyDevices?.length || 0}</Text>
              </View>
              <View style={styles.debugItem}>
                <Text style={styles.debugLabel}>Friends Found</Text>
                <Text style={styles.debugValue}>{detectedFriends.length}</Text>
              </View>
            </View>
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 24,
      backgroundColor: '#FFFFFF',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoContainer: {
      width: 42,
      height: 42,
      borderRadius: 21,
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
      fontSize: 12,
      color: '#9CA3AF',
      marginBottom: 2,
    },
    appName: {
      fontSize: 20,
      fontWeight: '700',
      color: '#111827',
    },
    settingsBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    
    // SETUP BANNER - Friendly Warning
    setupBanner: {
      marginHorizontal: 16,
      marginTop: 14,
      marginBottom: 10,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#FFFBEB',
      borderWidth: 1.5,
      borderColor: '#FDE68A',
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    setupBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
    },
    setupIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#FEF3C7',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    setupTextContainer: {
      flex: 1,
    },
    setupTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#92400E',
      marginBottom: 2,
    },
    setupSubtitle: {
      fontSize: 12,
      color: '#B45309',
      fontWeight: '500',
    },
    setupAction: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F59E0B',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      gap: 4,
    },
    setupActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFF',
    },

    // Stats Grid
    statsGrid: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 10,
    },
    statCard: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 1,
    },
    statCardHighlight: {
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#86EFAC',
    },
    statCardDisabled: {
      backgroundColor: '#F9FAFB',
      borderColor: '#E5E7EB',
      opacity: 0.6,
    },
    statIconBg: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    statIconHighlight: {
      backgroundColor: '#D1FAE5',
    },
    statIconDisabled: {
      backgroundColor: '#F3F4F6',
    },
    statContent: {
      flex: 1,
    },
    statNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 1,
    },
    statNumberDisabled: {
      color: '#9CA3AF',
    },
    statLabel: {
      fontSize: 12,
      color: '#6B7280',
      fontWeight: '500',
    },
    statLabelDisabled: {
      color: '#9CA3AF',
    },

    // Control Card
    controlCard: {
      backgroundColor: '#FFFFFF',
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 18,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    controlHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    controlInfo: {
      flex: 1,
    },
    controlTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 6,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10B981',
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 4,
    },
    statusDotInactive: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#9CA3AF',
    },
    statusActive: {
      fontSize: 13,
      fontWeight: '600',
      color: '#10B981',
    },
    statusInactive: {
      fontSize: 13,
      fontWeight: '600',
      color: '#9CA3AF',
    },
    badgesContainer: {
      flexDirection: 'row',
      gap: 6,
    },
    permBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    permBadgeActive: {
      backgroundColor: '#D1FAE5',
      borderColor: '#86EFAC',
    },
    controlDescription: {
      fontSize: 13,
      color: '#6B7280',
      marginBottom: 16,
      lineHeight: 18,
    },
    toggleButton: {
      backgroundColor: '#6366F1',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
    toggleButtonActive: {
      backgroundColor: '#DC2626',
      shadowColor: '#DC2626',
    },
    toggleButtonDisabled: {
      backgroundColor: '#9CA3AF',
      shadowColor: '#9CA3AF',
    },
    toggleButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toggleButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Sections
    section: {
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#111827',
    },
    badge: {
      backgroundColor: '#EF4444',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      minWidth: 24,
      alignItems: 'center',
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFF',
    },

    // Request Card
    requestCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      padding: 16,
      borderRadius: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    requestAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    requestInitial: {
      fontSize: 20,
      fontWeight: '700',
      color: '#6366F1',
    },
    requestInfo: {
      flex: 1,
    },
    requestName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 2,
    },
    requestEmail: {
      fontSize: 13,
      color: '#6B7280',
    },
    requestActions: {
      flexDirection: 'row',
      gap: 8,
    },
    acceptBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Empty State
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyIcon: {
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
    },

    // Friend Card
    friendCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      padding: 16,
      borderRadius: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    friendAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#F0FDF4',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      borderWidth: 2,
    },
    friendInitial: {
      fontSize: 22,
      fontWeight: '700',
      color: '#10B981',
    },
    friendInfo: {
      flex: 1,
    },
    friendName: {
      fontSize: 17,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 4,
    },
    friendDistance: {
      fontSize: 14,
      color: '#6B7280',
      fontWeight: '500',
    },
    distanceIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },

    // Quick Actions
    quickActions: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 18,
      gap: 10,
    },
    quickAction: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    permissionsAction: {
      position: 'relative',
    },
    quickActionIconWrapper: {
      position: 'relative',
    },
    quickActionBadge: {
      position: 'absolute',
      top: -4,
      right: -6,
      backgroundColor: '#F59E0B',
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    quickActionBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    quickActionText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#111827',
      marginTop: 8,
    },

    // Debug Card
    debugCard: {
      marginHorizontal: 16,
      marginTop: 18,
      backgroundColor: '#F9FAFB',
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    debugTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 12,
    },
    debugGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    debugItem: {
      width: '48%',
      backgroundColor: '#FFFFFF',
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    debugLabel: {
      fontSize: 10,
      color: '#6B7280',
      marginBottom: 3,
      fontWeight: '500',
    },
    debugValue: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
    },
  });
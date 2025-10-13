// app/home/HomeScreen.jsx
import React, { useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert,
  Animated,
  Dimensions
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useLocationService } from "../../hooks/useLocationService";
import { useNearbyFriends } from "../../hooks/useNearbyFriends";
import { useFriendships } from "../../hooks/useFriendships";

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Location service with 30-second updates
  const {
    location,
    isTracking,
    lastUpdate,
    error: locationError,
    debugInfo: locationDebug,
    startTracking,
    stopTracking,
    refreshLocation
  } = useLocationService({
    updateInterval: 30000,
    highAccuracy: true,
    enableBackgroundLocation: false,
    autoStart: true
  });

  // Nearby friends service (only scans accepted friends)
  const {
    nearbyFriends,
    isLoading: loadingFriends,
    lastFetch,
    error: friendsError,
    debugInfo: friendsDebug,
    refreshNearbyFriends,
    friendCount,
    hasFriends,
    isDataStale
  } = useNearbyFriends(location, {
    radius: 1000,
    autoRefresh: true,
    refreshInterval: 60000,
    maxResults: 50
  });

  // Friendships management
  const {
    pendingRequests,
    isLoading: loadingFriendships,
    acceptFriendRequest,
    removeFriendship,
    friendCount: totalFriends,
    pendingCount
  } = useFriendships();

  const handleManualRefresh = async () => {
    console.log("🔄 Manual refresh triggered");
    setRefreshing(true);
    await Promise.all([refreshLocation(), refreshNearbyFriends()]);
    setRefreshing(false);
  };

  const toggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    await acceptFriendRequest(friendshipId);
  };

  const handleRejectRequest = async (friendshipId) => {
    Alert.alert(
      "Reject Request",
      "Are you sure you want to reject this friend request?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reject", 
          style: "destructive",
          onPress: () => removeFriendship(friendshipId)
        }
      ]
    );
  };

  const getLocationStatus = () => {
    if (!location) return { text: "No location", color: "#999" };
    if (locationError) return { text: "Location error", color: "#F44336" };
    if (!isTracking) return { text: "Tracking paused", color: "#FF9800" };
    return { text: "Active", color: "#4CAF50" };
  };

  const getLastUpdateText = () => {
    if (!lastUpdate) return "Never";
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getDistanceColor = (distance) => {
    if (distance < 100) return "#4CAF50";
    if (distance < 500) return "#FF9800";
    return "#2196F3";
  };

  const statusInfo = getLocationStatus();

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleManualRefresh}
          tintColor="#1E88E5"
          colors={["#1E88E5"]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header with gradient effect */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Connecti</Text>
          <Text style={styles.subtitle}>Stay connected with nearby friends</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => router.push('/home/SettingsScreen')}
        >
          <Ionicons name="settings-outline" size={24} color="#1E88E5" />
        </TouchableOpacity>
      </View>

      {/* Quick Stats Row */}
      <View style={styles.quickStatsRow}>
        <View style={[styles.quickStatCard, { backgroundColor: '#E3F2FD' }]}>
          <Ionicons name="people" size={24} color="#1E88E5" />
          <Text style={styles.quickStatNumber}>{totalFriends}</Text>
          <Text style={styles.quickStatLabel}>Friends</Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: '#E8F5E9' }]}>
          <Ionicons name="location" size={24} color="#4CAF50" />
          <Text style={styles.quickStatNumber}>{friendCount}</Text>
          <Text style={styles.quickStatLabel}>Nearby</Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: '#FFF3E0' }]}>
          <Ionicons name="person-add" size={24} color="#FF9800" />
          <Text style={styles.quickStatNumber}>{pendingCount}</Text>
          <Text style={styles.quickStatLabel}>Requests</Text>
        </View>
      </View>

      {/* Location Status Compact Card */}
      <View style={styles.locationCompactCard}>
        <View style={styles.locationCompactHeader}>
          <View style={styles.locationCompactLeft}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
            <View>
              <Text style={styles.locationCompactTitle}>Location Status</Text>
              <Text style={[styles.locationCompactStatus, { color: statusInfo.color }]}>
                {statusInfo.text}
              </Text>
            </View>
          </View>
          <View style={styles.locationCompactActions}>
            <TouchableOpacity 
              onPress={refreshLocation}
              style={styles.iconButton}
            >
              <Ionicons name="refresh" size={20} color="#1E88E5" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={toggleTracking}
              style={[styles.iconButton, { marginLeft: 8 }]}
            >
              <Ionicons 
                name={isTracking ? "pause" : "play"} 
                size={20} 
                color={isTracking ? "#F44336" : "#4CAF50"} 
              />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationCompactUpdate}>
          Updated {getLastUpdateText()}
        </Text>
      </View>

      {/* Proximity Notifications Card - Enhanced */}
      <TouchableOpacity 
        style={styles.proximityCard}
        onPress={() => router.push('/home/ProximitySettingsScreen')}
        activeOpacity={0.8}
      >
        <View style={styles.proximityIconContainer}>
          <Ionicons name="notifications" size={28} color="#1E88E5" />
        </View>
        <View style={styles.proximityContent}>
          <Text style={styles.proximityTitle}>Proximity Alerts</Text>
          <Text style={styles.proximitySubtitle}>
            Configure when to get notified
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#1E88E5" />
      </TouchableOpacity>

      {/* Pending Friend Requests - Enhanced */}
      {pendingRequests.length > 0 && (
        <View style={styles.requestsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friend Requests</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingRequests.length}</Text>
            </View>
          </View>
          
          {pendingRequests.map(request => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestAvatar}>
                <Ionicons name="person" size={24} color="#1E88E5" />
              </View>
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{request.name}</Text>
                <Text style={styles.requestContact}>{request.contact}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity 
                  onPress={() => handleAcceptRequest(request.id)}
                  style={styles.acceptButtonSmall}
                >
                  <Ionicons name="checkmark" size={20} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleRejectRequest(request.id)}
                  style={styles.rejectButtonSmall}
                >
                  <Ionicons name="close" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Nearby Friends Section - Enhanced */}
      <View style={styles.friendsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Nearby Friends</Text>
          <View style={styles.sectionRight}>
            {isDataStale() && (
              <View style={styles.staleIndicator}>
                <Ionicons name="time-outline" size={12} color="#FF9800" />
                <Text style={styles.staleText}>Stale</Text>
              </View>
            )}
          </View>
        </View>

        {loadingFriends ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="search" size={32} color="#1E88E5" />
            <Text style={styles.loadingText}>Finding nearby friends...</Text>
          </View>
        ) : hasFriends ? (
          <View style={styles.friendsList}>
            {nearbyFriends.map(friend => {
              const distanceInMeters = parseFloat(friend.distanceFormatted);
              return (
                <TouchableOpacity 
                  key={friend.id} 
                  style={styles.friendCard}
                  onPress={() => {
                    Alert.alert("Friend Info", `${friend.name} is ${friend.distanceFormatted} away`);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.friendLeft}>
                    <View style={styles.friendAvatar}>
                      <Ionicons name="person" size={24} color="#1E88E5" />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      <View style={styles.distanceRow}>
                        <Ionicons 
                          name="location" 
                          size={14} 
                          color={getDistanceColor(distanceInMeters)} 
                        />
                        <Text style={[
                          styles.friendDistance,
                          { color: getDistanceColor(distanceInMeters) }
                        ]}>
                          {friend.distanceFormatted}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="compass-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateTitle}>
              {location 
                ? totalFriends === 0 
                  ? "No Friends Yet"
                  : "No Nearby Friends"
                : "Location Disabled"
              }
            </Text>
            <Text style={styles.emptyStateText}>
              {location 
                ? totalFriends === 0 
                  ? "Add friends to see them on the map"
                  : "Your friends aren't nearby right now"
                : "Enable location to find nearby friends"
              }
            </Text>
            {location && totalFriends === 0 && (
              <TouchableOpacity 
                onPress={() => router.push('/home/SearchScreen')}
                style={styles.emptyStateButton}
              >
                <Ionicons name="person-add" size={20} color="white" />
                <Text style={styles.emptyStateButtonText}>Add Friends</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {lastFetch && hasFriends && (
          <Text style={styles.lastFetchText}>
            Last updated {Math.floor((Date.now() - lastFetch.getTime()) / 1000)}s ago
          </Text>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/home/SearchScreen')}
        >
          <Ionicons name="person-add-outline" size={24} color="#1E88E5" />
          <Text style={styles.quickActionText}>Add Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => router.push('/home/MapScreen')}
        >
          <Ionicons name="map-outline" size={24} color="#1E88E5" />
          <Text style={styles.quickActionText}>View Map</Text>
        </TouchableOpacity>
      </View>

      {/* Debug Information */}
      {__DEV__ && (
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>🐛 Debug Info</Text>
          
          <View style={styles.debugCard}>
            <Text style={styles.debugCardTitle}>Location Service</Text>
            <Text style={styles.debugText}>Tracking: {isTracking ? 'Yes' : 'No'}</Text>
            <Text style={styles.debugText}>
              Accuracy: {locationDebug.locationAccuracy ? `${Math.round(locationDebug.locationAccuracy)}m` : 'Unknown'}
            </Text>
            {location && (
              <Text style={styles.debugText}>
                Coords: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </Text>
            )}
            {locationError && (
              <Text style={styles.errorText}>Error: {locationError}</Text>
            )}
          </View>

          <View style={styles.debugCard}>
            <Text style={styles.debugCardTitle}>Nearby Friends</Text>
            <Text style={styles.debugText}>
              Search Radius: {friendsDebug.searchRadius}m
            </Text>
            <Text style={styles.debugText}>
              Friends Found: {friendsDebug.friendsCount || 0}
            </Text>
            {friendsError && (
              <Text style={styles.errorText}>Error: {friendsError}</Text>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F8F9FA",
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 10,
  },
  welcome: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1E88E5",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  quickStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  locationCompactCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  locationCompactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationCompactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationCompactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  locationCompactStatus: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  locationCompactActions: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCompactUpdate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    marginLeft: 24,
  },
  proximityCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#1E88E5',
  },
  proximityIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  proximityContent: {
    flex: 1,
  },
  proximityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  proximitySubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  requestsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  badge: {
    backgroundColor: '#FF9800',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staleIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  staleText: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '600',
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginBottom: 8,
  },
  requestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  requestContact: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
    marginTop: 12,
  },
  friendsList: {
    gap: 8,
  },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  friendDistance: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyStateButton: {
    flexDirection: 'row',
    backgroundColor: '#1E88E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  emptyStateButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  lastFetchText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  debugSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  debugCard: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  debugCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginBottom: 4,
  },
});
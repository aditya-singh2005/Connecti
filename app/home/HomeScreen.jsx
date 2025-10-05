// app/home/HomeScreen.jsx
import React from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useLocationService } from "../../hooks/useLocationService";
import { useNearbyFriends } from "../../hooks/useNearbyFriends";
import { useFriendships } from "../../hooks/useFriendships";

export default function HomeScreen() {
  const router = useRouter();

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
    await refreshLocation();
    await refreshNearbyFriends();
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
    if (!location) return "No location";
    if (locationError) return "Location error";
    if (!isTracking) return "Tracking stopped";
    return "Active";
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

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={loadingFriends}
          onRefresh={handleManualRefresh}
          title="Pull to refresh"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.welcome}>Connecti</Text>
      </View>

      {/* Proximity Notifications Card */}
      <TouchableOpacity 
        style={styles.proximityCard}
        onPress={() => router.push('/home/ProximitySettingsScreen')}
      >
        <View style={styles.proximityContent}>
          <Ionicons name="notifications-outline" size={32} color="#1E88E5" />
          <View style={styles.proximityText}>
            <Text style={styles.proximityTitle}>Proximity Notifications</Text>
            <Text style={styles.proximitySubtitle}>
              Get notified when friends are nearby
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </View>
      </TouchableOpacity>

      {/* Location Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>Location Status</Text>
          <View style={[
            styles.statusIndicator, 
            { backgroundColor: isTracking ? '#4CAF50' : '#F44336' }
          ]} />
        </View>
        
        <Text style={styles.statusText}>
          Status: {getLocationStatus()}
        </Text>
        <Text style={styles.statusText}>
          Last Update: {getLastUpdateText()}
        </Text>
        {location && (
          <Text style={styles.statusText}>
            Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </Text>
        )}
        
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            onPress={toggleTracking} 
            style={[styles.actionButton, { backgroundColor: isTracking ? '#F44336' : '#4CAF50' }]}
          >
            <Text style={styles.actionButtonText}>
              {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={refreshLocation} 
            style={[styles.actionButton, { backgroundColor: '#2196F3' }]}
          >
            <Text style={styles.actionButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Friends Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Friends Summary</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{totalFriends}</Text>
            <Text style={styles.summaryLabel}>Total Friends</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{friendCount}</Text>
            <Text style={styles.summaryLabel}>Nearby</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/home/SearchScreen')}
          style={styles.addFriendButton}
        >
          <Text style={styles.addFriendButtonText}>+ Add Friends</Text>
        </TouchableOpacity>
      </View>

      {/* Pending Friend Requests */}
      {pendingRequests.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionTitle}>
            Friend Requests ({pendingRequests.length})
          </Text>
          {pendingRequests.map(request => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{request.name}</Text>
                <Text style={styles.requestContact}>{request.contact}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity 
                  onPress={() => handleAcceptRequest(request.id)}
                  style={[styles.requestButton, styles.acceptButton]}
                >
                  <Text style={styles.requestButtonText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleRejectRequest(request.id)}
                  style={[styles.requestButton, styles.rejectButton]}
                >
                  <Text style={styles.requestButtonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Nearby Friends Section */}
      <View style={styles.friendsSection}>
        <View style={styles.friendsSectionHeader}>
          <Text style={styles.sectionTitle}>
            Nearby Friends ({friendCount})
          </Text>
          {isDataStale() && (
            <Text style={styles.staleIndicator}>Stale</Text>
          )}
        </View>

        {loadingFriends ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Finding nearby friends...</Text>
          </View>
        ) : hasFriends ? (
          <View style={styles.friendsList}>
            {nearbyFriends.map(friend => (
              <TouchableOpacity 
                key={friend.id} 
                style={styles.friendCard}
                onPress={() => {
                  Alert.alert("Friend Info", `${friend.name} is ${friend.distanceFormatted} away`);
                }}
              >
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendDistance}>{friend.distanceFormatted} away</Text>
                </View>
                <View style={styles.friendActions}>
                  <Text style={styles.viewProfile}>View Profile</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noFriendsContainer}>
            <Text style={styles.noFriendsText}>
              {location 
                ? totalFriends === 0 
                  ? "Add friends to see them nearby"
                  : "No friends are nearby right now"
                : "Enable location to find nearby friends"
              }
            </Text>
            {location && totalFriends === 0 && (
              <TouchableOpacity 
                onPress={() => router.push('/home/SearchScreen')}
                style={styles.refreshButton}
              >
                <Text style={styles.refreshButtonText}>Add Friends</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {lastFetch && (
          <Text style={styles.lastFetchText}>
            Last updated: {Math.floor((Date.now() - lastFetch.getTime()) / 1000)}s ago
          </Text>
        )}
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
    backgroundColor: "#f5f5f5",
    padding: 16,
  },
  header: {
    marginBottom: 20,
    paddingTop: 10,
  },
  welcome: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E88E5",
  },
  proximityCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#1E88E5',
  },
  proximityContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proximityText: {
    flex: 1,
    marginLeft: 12,
  },
  proximityTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E88E5',
  },
  proximitySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E88E5',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  addFriendButton: {
    backgroundColor: '#1E88E5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addFriendButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  requestsSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginBottom: 8,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  requestContact: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  requestButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  requestButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  friendsSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  friendsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  staleIndicator: {
    fontSize: 12,
    color: '#FF9800',
    fontStyle: 'italic',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  friendsList: {
    gap: 12,
  },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  friendDistance: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  friendActions: {
    alignItems: 'flex-end',
  },
  viewProfile: {
    fontSize: 14,
    color: '#1E88E5',
    fontWeight: '500',
  },
  noFriendsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noFriendsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  refreshButton: {
    backgroundColor: '#1E88E5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  lastFetchText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  debugSection: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  debugCard: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  debugCardTitle: {
    fontSize: 14,
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
    color: '#d32f2f',
    marginBottom: 4,
  },
});
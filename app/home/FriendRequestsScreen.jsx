import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator
} from "react-native";
import { useRouter } from "expo-router";
import { useFriendships } from "../../hooks/useFriendships";

export default function FriendRequestsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('received'); // 'received', 'sent', or 'search'
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const {
    pendingRequests,
    sentRequests,
    acceptFriendRequest,
    removeFriendship,
    pendingCount,
    searchUsers,
    sendFriendRequest
  } = useFriendships();

  const handleAcceptRequest = async (friendshipId, friendName) => {
    const success = await acceptFriendRequest(friendshipId);
    if (success) {
      Alert.alert("Success", `You are now friends with ${friendName}!`);
    }
  };

  const handleRejectRequest = (friendshipId, friendName) => {
    Alert.alert(
      "Reject Request",
      `Reject friend request from ${friendName}?`,
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

  const handleCancelRequest = (friendshipId, friendName) => {
    Alert.alert(
      "Cancel Request",
      `Cancel friend request to ${friendName}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancel Request",
          style: "destructive",
          onPress: () => removeFriendship(friendshipId)
        }
      ]
    );
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    const results = await searchUsers(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleSendFriendRequest = async (friendId) => {
    const success = await sendFriendRequest(friendId);
    if (success) {
      handleSearch(); // Refresh search results
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.push('/home/ProfileScreen')}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.activeTab]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
            Received
          </Text>
          {pendingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
            Sent
          </Text>
          {sentRequests.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{sentRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
            Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar - Only show on Search tab */}
      {activeTab === 'search' && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              placeholderTextColor="#8e8e8e"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSearch}
            style={[
              styles.searchButton,
              (!searchQuery.trim() || isSearching) && styles.searchButtonDisabled
            ]}
            disabled={!searchQuery.trim() || isSearching}
          >
            {isSearching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'received' ? (
          // Received Requests
          pendingRequests.length > 0 ? (
            pendingRequests.map(request => (
              <View key={request.id} style={styles.requestItem}>
                <View style={styles.requestLeft}>
                  <View style={styles.requestAvatar}>
                    <Text style={styles.requestAvatarText}>
                      {request.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName}>{request.name}</Text>
                    <Text style={styles.requestContact}>{request.contact}</Text>
                  </View>
                </View>

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    onPress={() => handleAcceptRequest(request.id, request.name)}
                    style={styles.acceptButton}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRejectRequest(request.id, request.name)}
                    style={styles.rejectButton}
                  >
                    <Text style={styles.rejectButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No friend requests</Text>
              <Text style={styles.emptySubtext}>
                When someone sends you a friend request, it will appear here
              </Text>
            </View>
          )
        ) : activeTab === 'sent' ? (
          // Sent Requests
          sentRequests.length > 0 ? (
            sentRequests.map(request => (
              <View key={request.id} style={styles.requestItem}>
                <View style={styles.requestLeft}>
                  <View style={styles.requestAvatar}>
                    <Text style={styles.requestAvatarText}>
                      {request.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName}>{request.name}</Text>
                    <Text style={styles.requestContact}>{request.contact}</Text>
                    <Text style={styles.pendingLabel}>Pending...</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleCancelRequest(request.id, request.name)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📤</Text>
              <Text style={styles.emptyText}>No sent requests</Text>
              <Text style={styles.emptySubtext}>
                Friend requests you send will appear here
              </Text>
            </View>
          )
        ) : (
          // Search Tab
          isSearching ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#1E88E5" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <View style={styles.resultsList}>
              <Text style={styles.resultsCount}>
                {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found
              </Text>
              {searchResults.map(user => (
                <View key={user.id} style={styles.requestItem}>
                  <View style={styles.requestLeft}>
                    <View style={styles.requestAvatar}>
                      <Text style={styles.requestAvatarText}>
                        {user.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{user.name}</Text>
                      <Text style={styles.requestContact}>{user.contact}</Text>
                    </View>
                  </View>

                  {user.is_friend ? (
                    <View style={styles.friendBadgeContainer}>
                      <Text style={styles.friendBadge}>✓ Friends</Text>
                    </View>
                  ) : user.friendship_status === 'pending' ? (
                    <View style={styles.pendingBadgeContainer}>
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleSendFriendRequest(user.id)}
                      style={styles.addButton}
                    >
                      <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : hasSearched ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No users found</Text>
              <Text style={styles.emptySubtext}>
                Try searching with a different name or phone number
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>Search for friends</Text>
              <Text style={styles.emptySubtext}>
                Enter a name or phone number to find and add friends
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  backButton: {
    padding: 4,
  },
  backIcon: {
    fontSize: 28,
    color: '#262626',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
  },
  placeholder: {
    width: 36,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#262626',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  activeTabText: {
    color: '#262626',
  },
  tabBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#262626',
  },
  clearIcon: {
    fontSize: 18,
    color: '#8e8e8e',
    padding: 4,
  },
  searchButton: {
    backgroundColor: '#0095F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  searchButtonDisabled: {
    backgroundColor: '#b2dffc',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8e8e8e',
  },
  resultsList: {
    paddingTop: 12,
  },
  resultsCount: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  requestAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  requestAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  requestContact: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  pendingLabel: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
    fontStyle: 'italic',
  },
  requestActions: {
    flexDirection: 'column',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#0095F6',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  rejectButton: {
    backgroundColor: '#efefef',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  cancelButton: {
    backgroundColor: '#efefef',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  addButton: {
    backgroundColor: '#0095F6',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  friendBadgeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  friendBadge: {
    color: '#4CAF50',
    fontWeight: '600',
    fontSize: 14,
  },
  pendingBadgeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  pendingBadgeText: {
    color: '#FF9800',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
  },
});
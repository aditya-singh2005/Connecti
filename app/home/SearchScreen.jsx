import { useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator
} from "react-native";
import { useFriendships } from "../../hooks/useFriendships";

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const { searchUsers, sendFriendRequest } = useFriendships();

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
      handleSearch(); // Refresh results
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
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

      {/* Results */}
      <ScrollView style={styles.content}>
        {isSearching ? (
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
              <View key={user.id} style={styles.userItem}>
                <View style={styles.userLeft}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userContact}>{user.contact}</Text>
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
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  userContact: {
    fontSize: 14,
    color: '#8e8e8e',
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
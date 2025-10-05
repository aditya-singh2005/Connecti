import { useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { useFriendships } from "../../hooks/useFriendships";

export default function FriendsListScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    friends,
    friendCount,
    removeFriendship
  } = useFriendships();

  const filteredFriends = friends.filter(friend => 
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.contact.includes(searchQuery)
  );

  const handleRemoveFriend = (friendshipId, friendName) => {
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${friendName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeFriendship(friendshipId)
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#8e8e8e"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Friends Count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {filteredFriends.length} {filteredFriends.length === 1 ? 'friend' : 'friends'}
        </Text>
      </View>

      {/* Friends List */}
      <ScrollView style={styles.friendsList}>
        {filteredFriends.length > 0 ? (
          filteredFriends.map(friend => (
            <View key={friend.id} style={styles.friendItem}>
              <View style={styles.friendLeft}>
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>
                    {friend.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendContact}>{friend.contact}</Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => handleRemoveFriend(friend.id, friend.name)}
                style={styles.removeButton}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No friends found' : 'No friends yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search' : 'Start adding friends to connect'}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#efefef',
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
  countContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  friendsList: {
    flex: 1,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  friendContact: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  removeButton: {
    backgroundColor: '#efefef',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
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
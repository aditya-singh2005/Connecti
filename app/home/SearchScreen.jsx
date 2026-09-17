import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useFriendships } from "../../hooks/useFriendships";

// ── Memoized user card: only re-renders when its own props change ─────────────
const UserCard = memo(function UserCard({
  user,
  isFriend,
  friendshipStatus,
  interactionId,
  onSend,
  onAccept,
  onReject,
  onCancel,
}) {
  const [isSending, setIsSending] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [pendingOverride, setPendingOverride] = useState(null);

  const handlePress = useCallback(async () => {
    if (isSending) return;
    setPendingOverride(true);
    setIsSending(true);
    const ok = await onSend(user.id);
    setIsSending(false);
    if (!ok) setPendingOverride(false);
    return ok;
  }, [isSending, onSend, user.id]);

  const handleResponse = useCallback(async (respond) => {
    if (isResponding || !interactionId) return;
    setIsResponding(true);
    await respond(interactionId);
    setIsResponding(false);
  }, [interactionId, isResponding]);

  const handleCancel = useCallback(async () => {
    if (isResponding || !interactionId) return;
    setPendingOverride(false);
    setIsResponding(true);
    const ok = await onCancel(interactionId);
    setIsResponding(false);
    if (!ok) setPendingOverride(true);
  }, [interactionId, isResponding, onCancel]);

  const isOutgoingPending = pendingOverride ?? friendshipStatus === 'outgoing_pending';

  return (
    <View style={styles.userCard}>
      <View style={styles.userLeft}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {(user.name || user.username || 'C').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name || user.username || 'Connecti user'}</Text>
          {!!user.contact && <Text style={styles.userContact}>{user.contact}</Text>}
        </View>
      </View>

      {isFriend ? (
        <View style={styles.friendBadgeContainer}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.friendBadge}>Friends</Text>
        </View>
      ) : friendshipStatus === 'incoming_pending' ? (
        <View style={styles.requestActions}>
          <TouchableOpacity
            onPress={() => handleResponse(onReject)}
            style={styles.iconButtonGhost}
            disabled={isResponding}
          >
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleResponse(onAccept)}
            style={styles.iconButtonPrimary}
            disabled={isResponding}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : isOutgoingPending ? (
        <TouchableOpacity
          onPress={handleCancel}
          style={styles.pendingBadgeContainer}
          disabled={isResponding}
          activeOpacity={0.75}
        >
          <Ionicons name="time" size={16} color="#F59E0B" />
          <Text style={styles.pendingBadgeText}>Pending</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handlePress}
          style={[styles.addButton, isSending && styles.addButtonDisabled]}
          disabled={isSending}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="person-add" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.addButtonText}>Add</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchQueryRef = useRef("");
  const searchRequestRef = useRef(0);

  const {
    searchUsers,
    sendInteraction,
    pendingInteractions,
    sentInteractions,
    friends,
    acceptInteraction,
    declineInteraction,
    cancelInteraction,
  } = useFriendships();
  const relationshipByUserId = useMemo(() => {
    const relationships = new Map();
    sentInteractions.forEach(interaction => {
      relationships.set(interaction.receiverId, {
        status: 'outgoing_pending',
        interactionId: interaction.id,
      });
    });
    pendingInteractions.forEach(interaction => {
      relationships.set(interaction.senderId, {
        status: 'incoming_pending',
        interactionId: interaction.id,
      });
    });
    return relationships;
  }, [pendingInteractions, sentInteractions]);
  const friendIds = useMemo(() => new Set(friends.map(friend => friend.id)), [friends]);

  const runSearch = useCallback(async (query, markAsSearched = true) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    const requestId = ++searchRequestRef.current;
    setIsSearching(true);
    setSearchError("");
    if (markAsSearched) setHasSearched(true);

    let results;
    try {
      results = await searchUsers(normalizedQuery);
    } catch (error) {
      console.error("Unable to search users:", error);
      if (requestId === searchRequestRef.current) {
        setSearchResults([]);
        setSearchError("Unable to search right now. Please try again.");
        setIsSearching(false);
      }
      return;
    }

    // Ignore responses from an older query or a request started before clearing.
    if (requestId !== searchRequestRef.current || searchQueryRef.current.trim() !== normalizedQuery) {
      return;
    }

    setSearchResults(results);
    setIsSearching(false);
  }, [searchUsers]);

  const handleSearch = () => runSearch(searchQueryRef.current);

  useFocusEffect(
    useCallback(() => {
      if (searchQueryRef.current.trim()) {
        runSearch(searchQueryRef.current, false);
      }
    }, [runSearch])
  );

  // Stable reference so UserCard's useCallback dep doesn't change
  const sendRef = useRef(sendInteraction);
  sendRef.current = sendInteraction;
  const stableSend = useCallback((id) => sendRef.current(id, 'wave'), []);

  const clearSearch = () => {
    searchQueryRef.current = "";
    searchRequestRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setSearchError("");
    setIsSearching(false);
  };

  const handleQueryChange = (value) => {
    searchQueryRef.current = value;
    searchRequestRef.current += 1;
    setIsSearching(false);
    setSearchQuery(value);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find Friends</Text>
        <Text style={styles.headerSubtitle}>Connect with people you know</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChangeText={handleQueryChange}
            onSubmitEditing={handleSearch}
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isSearching ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#5C7CFA" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        ) : searchResults.length > 0 ? (
          <View style={styles.resultsList}>
            <Text style={styles.resultsCount}>
              {searchResults.length} {searchResults.length === 1 ? 'Result' : 'Results'}
            </Text>
            {searchResults.map(user => (
              <UserCard
                key={user.id}
                user={user}
                isFriend={user.is_friend || friendIds.has(user.id)}
                friendshipStatus={relationshipByUserId.get(user.id)?.status || null}
                interactionId={relationshipByUserId.get(user.id)?.interactionId || null}
                onSend={stableSend}
                onAccept={acceptInteraction}
                onReject={declineInteraction}
                onCancel={cancelInteraction}
              />
            ))}
          </View>
        ) : searchError ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="alert-circle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.emptyText}>Search unavailable</Text>
            <Text style={styles.emptySubtext}>{searchError}</Text>
          </View>
        ) : hasSearched ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="search" size={32} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyText}>No users found</Text>
            <Text style={styles.emptySubtext}>
              Try searching with a different name or phone number
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="people" size={32} color="#5C7CFA" />
            </View>
            <Text style={styles.emptyText}>Search for friends</Text>
            <Text style={styles.emptySubtext}>
              Enter a name or phone number to find and add friends to your network
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
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  searchSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  searchButton: {
    backgroundColor: '#5C7CFA',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  searchButtonDisabled: {
    backgroundColor: '#C7D2FE',
    shadowOpacity: 0,
    elevation: 0,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  resultsList: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C7CFA',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  userContact: {
    fontSize: 13,
    color: '#6B7280',
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#5C7CFA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  addButtonDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  friendBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
  },
  friendBadge: {
    color: '#10B981',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },
  pendingBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
  },
  pendingBadgeText: {
    color: '#D97706',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButtonGhost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  iconButtonPrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C7CFA',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
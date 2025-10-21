// FILE: app/home/ChatScreen.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import { useFriendships } from "../../hooks/useFriendships";
import { useChatNotifications } from "../../hooks/useChatNotifications";
import { supabase } from "../../lib/supabase";

function formatTime(date) {
  if (!date) return '';
  
  try {
    const now = new Date();
    const messageDate = new Date(date);
    const diff = now.getTime() - messageDate.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    
    return messageDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    return '';
  }
}

function getAvatarText(name) {
  if (!name || typeof name !== 'string' || name.length === 0) return '?';
  return name.charAt(0).toUpperCase();
}

export default function ChatScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [chatData, setChatData] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('chats');
  
  const channelRef = useRef(null);
  const isMountedRef = useRef(true);
  const isInitialLoadRef = useRef(true);
  const searchTimeoutRef = useRef(null);

  const { friends, searchUsers, sendFriendRequest } = useFriendships();
  const { updateBadgeCount, clearBadge } = useChatNotifications();

  // Get current user once
  useEffect(() => {
    let mounted = true;
    
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && mounted) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error('Error getting current user:', error);
      }
    };

    getCurrentUser();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Setup realtime subscription
  useEffect(() => {
    if (!userId || channelRef.current) return;

    const setupSubscription = () => {
      const channel = supabase
        .channel(`chat_list_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            const { sender_id, receiver_id } = payload.new || payload.old || {};
            if ((sender_id === userId || receiver_id === userId) && isMountedRef.current) {
              fetchChatData(true); // Pass true to skip loading state
              updateBadgeCount();
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    setupSubscription();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [userId]);

  // Fetch chat data when userId or friends change
  useEffect(() => {
    if (userId) {
      if (friends.length > 0) {
        fetchChatData();
      } else {
        setChatData([]);
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  }, [userId, friends.length]);

  // Handle screen focus
  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      
      if (userId && friends.length > 0) {
        fetchChatData(true); // Silent refresh
      }
      
      updateBadgeCount();
      clearBadge();

      return () => {
        isMountedRef.current = false;
      };
    }, [userId, friends.length])
  );

  const fetchChatData = async (silent = false) => {
    if (!userId || friends.length === 0) {
      if (!silent) setLoading(false);
      return;
    }
    
    try {
      // Only show loading on initial load or manual refresh
      if (!silent && isInitialLoadRef.current) {
        setLoading(true);
      }
      
      const chatPromises = friends.map(async (friend) => {
        try {
          const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (msgError) throw msgError;

          const lastMessage = messages && messages.length > 0 ? messages[0] : null;
          
          const { count: unreadCount, error: countError } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', friend.id)
            .eq('receiver_id', userId)
            .is('read_at', null);

          if (countError) throw countError;

          return {
            id: friend.id,
            name: friend.name || 'Unknown',
            contact: friend.contact || '',
            lastMessage: lastMessage?.content || "Start a conversation",
            lastMessageTime: lastMessage?.created_at || null,
            unreadCount: unreadCount || 0,
            isFromMe: lastMessage?.sender_id === userId,
            hasMessages: !!lastMessage,
            isFriend: true
          };
        } catch (error) {
          console.error('Error fetching chat data for friend:', friend.id, error);
          return {
            id: friend.id,
            name: friend.name || 'Unknown',
            contact: friend.contact || '',
            lastMessage: "Start a conversation",
            lastMessageTime: null,
            unreadCount: 0,
            isFromMe: false,
            hasMessages: false,
            isFriend: true
          };
        }
      });

      const chatResults = await Promise.all(chatPromises);
      
      if (!isMountedRef.current) return;
      
      const sortedChats = chatResults.sort((a, b) => {
        if (a.hasMessages && b.hasMessages) {
          return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        }
        if (a.hasMessages && !b.hasMessages) return -1;
        if (!a.hasMessages && b.hasMessages) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      
      setChatData(sortedChats);
    } catch (error) {
      console.error('Error fetching chat data:', error);
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
        isInitialLoadRef.current = false;
      }
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    const results = await searchUsers(searchQuery);
    if (isMountedRef.current) {
      setSearchResults(results);
      setIsSearching(false);
    }
  };

  const handleSendFriendRequest = async (friendId, friendName) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .insert([{
          user_id: userId,
          friend_id: friendId,
          status: 'pending'
        }]);

      if (error) throw error;

      Alert.alert(
        'Friend Request Sent',
        `Friend request sent to ${friendName}`,
        [{ text: 'OK', onPress: handleSearch }]
      );
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  };

  const handleWithdrawRequest = async (friendId, friendName) => {
    Alert.alert(
      'Withdraw Friend Request',
      `Cancel friend request to ${friendName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('user_id', userId)
                .eq('friend_id', friendId)
                .eq('status', 'pending');

              if (error) throw error;

              Alert.alert(
                'Request Withdrawn',
                `Friend request to ${friendName} has been cancelled`,
                [{ text: 'OK', onPress: handleSearch }]
              );
            } catch (error) {
              console.error('Error withdrawing friend request:', error);
              Alert.alert('Error', 'Failed to withdraw friend request');
            }
          }
        }
      ]
    );
  };

  const handleChatPress = (chat) => {
    if (!chat?.id) return;

    if (chat.isFriend || chat.is_friend) {
      router.push({
        pathname: '/home/ChatConversationScreen',
        params: { 
          friendId: chat.id,
          friendName: chat.name || 'Unknown',
          friendContact: chat.contact || ''
        }
      });
    } else if (chat.friendship_status === 'pending') {
      Alert.alert(
        'Request Pending',
        `Waiting for ${chat.name} to accept your friend request`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Add Friend',
        `Send a friend request to ${chat.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Request',
            onPress: () => handleSendFriendRequest(chat.id, chat.name)
          }
        ]
      );
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChatData();
  }, [userId, friends]);

  const filteredChats = chatData.filter(chat => {
    const name = chat?.name || '';
    const contact = chat?.contact || '';
    const query = searchQuery.toLowerCase();
    
    return name.toLowerCase().includes(query) ||
           contact.includes(searchQuery);
  });

  const totalUnread = chatData.reduce((sum, chat) => 
    sum + (chat.unreadCount || 0), 0
  );

  const showingSearchResults = activeTab === 'chats' && searchQuery.length > 0;
  const displayData = showingSearchResults ? filteredChats : chatData;

  // Auto-search debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length > 2 && activeTab === 'chats') {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch();
      }, 300);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, activeTab]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  if (loading && isInitialLoadRef.current) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0095F6" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        {totalUnread > 0 && (
          <View style={styles.totalUnreadBadge}>
            <Text style={styles.totalUnreadText}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends or find new people..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#8e8e8e"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => {
            setSearchQuery("");
            setSearchResults([]);
          }}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchQuery.length > 0 && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
            onPress={() => setActiveTab('chats')}
          >
            <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
              Your Chats
            </Text>
            {activeTab === 'chats' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'search' && styles.tabActive]}
            onPress={() => {
              setActiveTab('search');
              handleSearch();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
              Find People
            </Text>
            {activeTab === 'search' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        style={styles.chatList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0095F6"
          />
        }
      >
        {(activeTab === 'chats' || searchQuery.length === 0) && (
          <>
            {displayData.length > 0 ? (
              displayData.map(chat => (
                <TouchableOpacity
                  key={chat.id}
                  style={[
                    styles.chatItem,
                    chat.unreadCount > 0 && styles.chatItemUnread
                  ]}
                  onPress={() => handleChatPress(chat)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatarContainer}>
                    <View style={[
                      styles.avatar,
                      chat.unreadCount > 0 && styles.avatarUnread
                    ]}>
                      <Text style={styles.avatarText}>
                        {getAvatarText(chat.name)}
                      </Text>
                    </View>
                    {chat.unreadCount > 0 && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>

                  <View style={styles.chatInfo}>
                    <View style={styles.chatHeader}>
                      <Text style={[
                        styles.chatName,
                        chat.unreadCount > 0 && styles.chatNameUnread
                      ]}>
                        {chat.name}
                      </Text>
                      {chat.lastMessageTime && (
                        <Text style={[
                          styles.chatTime,
                          chat.unreadCount > 0 && styles.chatTimeUnread
                        ]}>
                          {formatTime(chat.lastMessageTime)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.chatPreview}>
                      <Text 
                        style={[
                          styles.lastMessage,
                          chat.unreadCount > 0 && styles.lastMessageUnread
                        ]}
                        numberOfLines={1}
                      >
                        {chat.isFromMe && chat.lastMessageTime && (
                          <Text style={styles.youPrefix}>You: </Text>
                        )}
                        {chat.lastMessage}
                      </Text>
                      {chat.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No chats found' : 'No chats yet'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery ? 'Try searching for new people' : 'Search above to find friends and start chatting'}
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'search' && searchQuery.length > 0 && (
          <>
            {isSearching ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#0095F6" />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <View style={styles.resultsList}>
                <Text style={styles.resultsCount}>
                  {searchResults.length} {searchResults.length === 1 ? 'person' : 'people'} found
                </Text>
                {searchResults.map(user => (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.chatItem}
                    onPress={() => handleChatPress(user)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarContainer}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {getAvatarText(user.name)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.chatInfo}>
                      <View style={styles.chatHeader}>
                        <Text style={styles.chatName}>{user.name}</Text>
                      </View>
                      <Text style={styles.userContact}>{user.contact}</Text>
                    </View>

                    <View style={styles.actionContainer}>
                      {user.is_friend ? (
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>✓ Friend</Text>
                        </View>
                      ) : user.friendship_status === 'pending' ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            handleWithdrawRequest(user.id, user.name);
                          }}
                          style={[styles.statusBadge, styles.pendingBadge, styles.pendingBadgeClickable]}
                        >
                          <Text style={[styles.statusBadgeText, styles.pendingText]}>
                            ⏱ Pending
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            handleSendFriendRequest(user.id, user.name);
                          }}
                          style={styles.addButton}
                        >
                          <Text style={styles.addButtonText}>+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>No users found</Text>
                <Text style={styles.emptySubtext}>
                  Try a different name or phone number
                </Text>
              </View>
            )}
          </>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  totalUnreadBadge: {
    backgroundColor: '#0095F6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  totalUnreadText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 20,
    height: 40,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  clearIcon: {
    fontSize: 18,
    color: '#8e8e8e',
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8e8e8e',
  },
  tabTextActive: {
    color: '#0095F6',
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#0095F6',
  },
  chatList: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chatItemUnread: {
    backgroundColor: '#F8FBFF',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0095F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarUnread: {
    backgroundColor: '#0084E0',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  unreadDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0095F6',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatInfo: {
    flex: 1,
    paddingRight: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#000',
    flex: 1,
  },
  chatNameUnread: {
    fontWeight: '600',
  },
  chatTime: {
    fontSize: 12,
    color: '#8e8e8e',
    marginLeft: 8,
  },
  chatTimeUnread: {
    color: '#0095F6',
    fontWeight: '600',
  },
  chatPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#8e8e8e',
    flex: 1,
  },
  lastMessageUnread: {
    fontWeight: '600',
    color: '#262626',
  },
  youPrefix: {
    color: '#8e8e8e',
  },
  unreadBadge: {
    backgroundColor: '#0095F6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  userContact: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  actionContainer: {
    marginLeft: 8,
  },
  statusBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#0095F6',
    fontSize: 12,
    fontWeight: '600',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
  },
  pendingBadgeClickable: {
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  pendingText: {
    color: '#FF9800',
  },
  addButton: {
    backgroundColor: '#0095F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  resultsList: {
    paddingTop: 8,
  },
  resultsCount: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e8e',
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
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 20,
  },
});
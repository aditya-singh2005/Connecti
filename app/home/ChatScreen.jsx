// FILE: app/home/ChatScreen.jsx — Updated for new DB schema
// Uses `connections` table instead of `friendships`
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
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useConnections } from "../../hooks/useConnections";
import { useChatNotifications } from "../../hooks/useChatNotifications";
import { supabase } from "../../lib/supabase";

function formatTime(date) {
  if (!date) return '';
  try {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getInitial(name) {
  if (!name || typeof name !== 'string' || name.length === 0) return '?';
  return name.charAt(0).toUpperCase();
}

export default function ChatScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [chatData, setChatData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);

  const channelRef = useRef(null);
  const isMountedRef = useRef(true);
  const isInitialLoadRef = useRef(true);
  const searchTimeoutRef = useRef(null);

  const { connections: friends } = useConnections();
  const { updateBadgeCount, clearBadge } = useChatNotifications();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && mounted) setUserId(user.id);
    });
    return () => { mounted = false; };
  }, []);

  // Realtime subscription for messages
  useEffect(() => {
    if (!userId || channelRef.current) return;

    const channel = supabase
      .channel(`chat_list_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const { sender_id, receiver_id } = payload.new || payload.old || {};
          if ((sender_id === userId || receiver_id === userId) && isMountedRef.current) {
            fetchChatData(true);
            updateBadgeCount();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [userId]);

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

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      if (userId && friends.length > 0) fetchChatData(true);
      updateBadgeCount();
      clearBadge();
      return () => { isMountedRef.current = false; };
    }, [userId, friends.length])
  );

  const fetchChatData = async (silent = false) => {
    if (!userId || friends.length === 0) {
      if (!silent) setLoading(false);
      return;
    }

    try {
      if (!silent && isInitialLoadRef.current) setLoading(true);

      const chatPromises = friends.map(async (friend) => {
        try {
          // Fetch last message between us using sender/receiver pattern
          const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: false })
            .limit(1);

          const lastMessage = messages && messages.length > 0 ? messages[0] : null;

          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', friend.id)
            .eq('receiver_id', userId)
            .is('read_at', null);

          return {
            id: friend.id,
            connectionId: friend.connectionId,
            name: friend.name || 'Unknown',
            contact: friend.contact || '',
            lastMessage: lastMessage?.content || "Start a conversation",
            lastMessageTime: lastMessage?.created_at || null,
            unreadCount: unreadCount || 0,
            isFromMe: lastMessage?.sender_id === userId,
            hasMessages: !!lastMessage,
            isFriend: true,
          };
        } catch {
          return {
            id: friend.id,
            connectionId: friend.connectionId,
            name: friend.name || 'Unknown',
            contact: friend.contact || '',
            lastMessage: "Start a conversation",
            lastMessageTime: null,
            unreadCount: 0,
            isFromMe: false,
            hasMessages: false,
            isFriend: true,
          };
        }
      });

      const results = await Promise.all(chatPromises);
      if (!isMountedRef.current) return;

      const sorted = results.sort((a, b) => {
        if (a.hasMessages && b.hasMessages) return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        if (a.hasMessages) return -1;
        if (b.hasMessages) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      setChatData(sorted);
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
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const results = await searchUsers(searchQuery);
    if (isMountedRef.current) {
      setSearchResults(results);
      setIsSearching(false);
    }
  };

  const handleChatPress = (chat) => {
    if (!chat?.id) return;
    if (chat.isFriend || chat.is_friend) {
      router.push({
        pathname: '/home/ChatConversationScreen',
        params: { friendId: chat.id, friendName: chat.name || 'Unknown', friendContact: chat.contact || '' }
      });
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChatData();
  }, [userId, friends]);

  const filteredChats = chatData.filter(chat => {
    const q = searchQuery.toLowerCase();
    return (chat.name || '').toLowerCase().includes(q) || (chat.contact || '').includes(searchQuery);
  });

  const totalUnread = chatData.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const displayData = searchQuery.length > 0 ? filteredChats : chatData;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (loading && isInitialLoadRef.current) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          {totalUnread > 0 && (
            <Text style={styles.headerSub}>{totalUnread} unread</Text>
          )}
        </View>
        <Ionicons name="create-outline" size={22} color="#111827" />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.chatList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C7CFA" />}
        showsVerticalScrollIndicator={false}
      >
        {displayData.length > 0 ? (
          displayData.map(chat => (
            <TouchableOpacity
              key={chat.id}
              style={[styles.chatItem, chat.unreadCount > 0 && styles.chatItemUnread]}
              onPress={() => handleChatPress(chat)}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, chat.unreadCount > 0 && styles.avatarUnread]}>
                  <Text style={styles.avatarText}>{getInitial(chat.name)}</Text>
                </View>
                {chat.unreadCount > 0 && <View style={styles.unreadDot} />}
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text style={[styles.chatName, chat.unreadCount > 0 && styles.chatNameUnread]}>
                    {chat.name}
                  </Text>
                  {chat.lastMessageTime && (
                    <Text style={[styles.chatTime, chat.unreadCount > 0 && styles.chatTimeUnread]}>
                      {formatTime(chat.lastMessageTime)}
                    </Text>
                  )}
                </View>
                <View style={styles.chatPreview}>
                  <Text style={[styles.lastMessage, chat.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
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
            <View style={styles.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={32} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No results found' : 'No connections yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? 'Try a different search term'
                : 'Wave at someone nearby to start a conversation!'
              }
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#5C7CFA', fontWeight: '600', marginTop: 2 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    marginHorizontal: 24,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    height: 44,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    gap: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  chatList: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#6B7280' },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  chatItemUnread: { backgroundColor: '#F5F7FF' },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarUnread: { backgroundColor: '#5C7CFA' },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#5C7CFA' },
  unreadDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#5C7CFA', borderWidth: 2, borderColor: '#fff',
  },
  chatInfo: { flex: 1, paddingRight: 8 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  chatNameUnread: { fontWeight: '700' },
  chatTime: { fontSize: 12, color: '#9CA3AF' },
  chatTimeUnread: { color: '#5C7CFA', fontWeight: '600' },
  chatPreview: { flexDirection: 'row', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: 14, color: '#9CA3AF', lineHeight: 20 },
  lastMessageUnread: { color: '#374151', fontWeight: '500' },
  youPrefix: { color: '#9CA3AF' },
  unreadBadge: {
    backgroundColor: '#5C7CFA', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#374151', textAlign: 'center', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});
// FILE: app/home/ChatConversationScreen.jsx
import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  ScrollView,
  Image,
  Keyboard,
  AppState,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { GiftedChat, Bubble, InputToolbar, Send } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from "../../lib/supabase";
import { useChatNotifications } from "../../hooks/useChatNotifications";

function getAvatarText(name) {
  if (!name || typeof name !== 'string' || name.length === 0) return '?';
  const nameParts = name.trim().split(' ').filter(part => part.length > 0);
  if (nameParts.length === 0) return '?';
  if (nameParts.length >= 2) {
    return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
  }
  if (nameParts[0].length >= 2) {
    return nameParts[0].substring(0, 2).toUpperCase();
  }
  return nameParts[0].charAt(0).toUpperCase();
}

export default function ChatConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const friendId = params.friendId || 'unknown';
  const friendName = params.friendName || 'Unknown';
  const friendContact = params.friendContact || '';

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [friendProfile, setFriendProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [connectionId, setConnectionId] = useState(params.connectionId || null);
  // Track exact keyboard height on Android (edge-to-edge doesn't resize reliably)
  const [androidKbHeight, setAndroidKbHeight] = useState(0);

  const subscriptionRef = useRef(null);
  const messageLimit = 50;
  const processedMessageIds = useRef(new Set());
  const isSendingRef = useRef(false);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  // Stable refs for subscription callbacks
  const friendProfileRef = useRef(null);
  const currentUserProfileRef = useRef(null);
  const userIdRef = useRef(null);
  const isScreenFocusedRef = useRef(false);
  const connectionIdRef = useRef(null);

  useEffect(() => { friendProfileRef.current = friendProfile; }, [friendProfile]);
  useEffect(() => { currentUserProfileRef.current = currentUserProfile; }, [currentUserProfile]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { isScreenFocusedRef.current = isScreenFocused; }, [isScreenFocused]);
  useEffect(() => { connectionIdRef.current = connectionId; }, [connectionId]);

  const { setCurrentScreen, clearCurrentScreen, updateBadgeCount } = useChatNotifications();

  // ─── Android keyboard height tracking (edge-to-edge doesn't resize) ─────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onShow = (e) => setAndroidKbHeight(e.endCoordinates.height);
    const onHide = () => setAndroidKbHeight(0);
    const s = Keyboard.addListener('keyboardDidShow', onShow);
    const h = Keyboard.addListener('keyboardDidHide', onHide);
    return () => { s.remove(); h.remove(); };
  }, []);

  // ─── AppState: reconnect subscription when foregrounded ───────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // Re-subscribe on foreground if needed
        if (userIdRef.current && friendId) {
          setupRealtimeSubscription();
          // Also fetch any missed messages
          fetchMessages();
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [friendId]);

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (friendId) {
      setCurrentScreen(`chat-${friendId}`);
    }
    return () => clearCurrentScreen();
  }, [friendId, setCurrentScreen, clearCurrentScreen]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      isScreenFocusedRef.current = true;

      if (userIdRef.current && friendId) {
        markAllMessagesAsRead();
        setTimeout(() => updateBadgeCount(), 500);
      }

      return () => {
        setIsScreenFocused(false);
        isScreenFocusedRef.current = false;
      };
    }, [friendId, updateBadgeCount])
  );

  useEffect(() => {
    if (userId) {
      fetchCurrentUserProfile();
      fetchFriendProfile();
      fetchConnectionId();
      fetchMessages();
      setupRealtimeSubscription();
    }

    return () => {
      cleanupSubscription();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [friendId, userId]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const cleanupSubscription = () => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
  };

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        userIdRef.current = user.id;
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const fetchConnectionId = async () => {
    const uid = userIdRef.current || userId;
    if (connectionIdRef.current || !uid || !friendId || friendId === 'unknown') return;
    try {
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(user1_id.eq.${uid},user2_id.eq.${friendId}),and(user1_id.eq.${friendId},user2_id.eq.${uid})`)
        .single();
      if (data?.id) {
        setConnectionId(data.id);
        connectionIdRef.current = data.id;
      }
    } catch (error) {
      console.error('Error fetching connectionId:', error);
    }
  };

  const fetchFriendProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, username, avatar_url')
        .eq('id', friendId)
        .single();
      if (data && !error) {
        setFriendProfile(data);
        friendProfileRef.current = data;
      }
    } catch (error) {
      console.error('Error fetching friend profile:', error);
    }
  };

  const fetchCurrentUserProfile = async () => {
    const uid = userIdRef.current || userId;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, username, avatar_url')
        .eq('id', uid)
        .single();
      if (data && !error) {
        setCurrentUserProfile(data);
        currentUserProfileRef.current = data;
      }
    } catch (error) {
      console.error('Error fetching current user profile:', error);
    }
  };

  const getCurrentUserDisplayName = (profile) => {
    const p = profile || currentUserProfileRef.current;
    if (p?.name?.trim().length > 0) return p.name;
    if (p?.username?.trim().length > 0) return p.username;
    return 'You';
  };

  const formatMessage = (msg, uid, fProfile, cuProfile) => {
    const isOwn = msg.sender_id === uid;
    return {
      _id: msg.id,
      text: msg.content,
      createdAt: new Date(msg.created_at),
      user: {
        _id: msg.sender_id,
        name: isOwn ? getCurrentUserDisplayName(cuProfile) : (fProfile?.name || friendName),
        avatar: isOwn
          ? getAvatarText(getCurrentUserDisplayName(cuProfile))
          : getAvatarText(fProfile?.name || friendName),
      },
      sent: true,
      received: msg.read_at !== null,
      pending: false,
    };
  };

  // ─── Fetch messages with pagination ───────────────────────────────────────

  const fetchMessages = async (oldestTimestamp = null) => {
    const uid = userIdRef.current || userId;
    if (!uid || friendId === 'unknown') return;

    try {
      if (!oldestTimestamp) setLoading(true);
      else setLoadingMore(true);

      let query = supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
        .order('created_at', { ascending: false })
        .limit(messageLimit);

      if (oldestTimestamp) {
        query = query.lt('created_at', oldestTimestamp);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const fProfile = friendProfileRef.current;
        const cuProfile = currentUserProfileRef.current;
        const formattedMessages = data.map(msg => {
          processedMessageIds.current.add(msg.id);
          return formatMessage(msg, uid, fProfile, cuProfile);
        });

        if (oldestTimestamp) {
          setMessages(prev => GiftedChat.append(prev, formattedMessages));
        } else {
          setMessages(formattedMessages);
        }
        setHasMoreMessages(data.length === messageLimit);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // ─── Realtime subscription with retry logic ────────────────────────────────

  const setupRealtimeSubscription = () => {
    cleanupSubscription();
    const uid = userIdRef.current || userId;
    if (!uid || friendId === 'unknown') return;

    const channelName = `conv-${[uid, friendId].sort().join('-')}-${Date.now()}`;

    subscriptionRef.current = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${uid}`,
      }, (payload) => {
        const newMessage = payload.new;
        // Only messages from this friend
        if (newMessage.sender_id !== friendId) return;
        if (processedMessageIds.current.has(newMessage.id)) return;
        processedMessageIds.current.add(newMessage.id);

        const formattedMessage = formatMessage(
          newMessage, uid,
          friendProfileRef.current,
          currentUserProfileRef.current
        );

        setMessages(prev => {
          if (prev.some(m => m._id === newMessage.id)) return prev;
          return GiftedChat.append(prev, [formattedMessage]);
        });

        // Mark read if on screen
        if (isScreenFocusedRef.current) {
          markMessageAsRead(newMessage.id);
          setTimeout(() => updateBadgeCount(), 300);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${uid}`,
      }, (payload) => {
        const updated = payload.new;
        if (updated.receiver_id !== friendId) return;

        setMessages(prev =>
          prev.map(msg =>
            msg._id === updated.id
              ? { ...msg, received: updated.read_at !== null }
              : msg
          )
        );
      })
      .subscribe((status) => {
        console.log(`📡 Chat subscription status: ${status}`);
        retryCountRef.current = 0;

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReconnect();
        }
      });
  };

  const scheduleReconnect = () => {
    if (retryTimerRef.current) return; // already scheduled
    const backoff = Math.min(30000, 2000 * Math.pow(2, retryCountRef.current));
    retryCountRef.current += 1;
    console.log(`🔄 Reconnecting subscription in ${backoff}ms (attempt ${retryCountRef.current})`);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setupRealtimeSubscription();
    }, backoff);
  };

  // ─── Mark messages as read ─────────────────────────────────────────────────

  const markMessageAsRead = async (messageId) => {
    const uid = userIdRef.current || userId;
    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('receiver_id', uid)
        .is('read_at', null);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const markAllMessagesAsRead = async () => {
    const uid = userIdRef.current || userId;
    if (!uid) return;
    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', friendId)
        .eq('receiver_id', uid)
        .is('read_at', null);
    } catch (error) {
      console.error('Error marking all messages as read:', error);
    }
  };

  // ─── Send message with push notification ──────────────────────────────────

  const sendPushToReceiver = async (messageId, messageText) => {
    try {
      const { data: receiverProfile } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', friendId)
        .single();

      // Always send push if token exists — don't gate on chat_notifications_enabled
      if (!receiverProfile?.expo_push_token) return;

      const senderName = getCurrentUserDisplayName(currentUserProfileRef.current);
      const preview = messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText;

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: receiverProfile.expo_push_token,
          title: `💬 ${senderName}`,
          body: preview,
          sound: 'default',
          priority: 'high',
          channelId: 'chat-messages',
          data: {
            type: 'chat_message',
            senderId: userIdRef.current,
            senderName: getCurrentUserDisplayName(currentUserProfileRef.current),
            messageId,
            screen: 'ChatConversationScreen',
          },
        }),
      });
      const json = await res.json();
      console.log('📤 Push result:', json?.data?.[0]?.status);
    } catch (err) {
      console.warn('Push failed (non-critical):', err?.message);
    }
  };

  const onSend = useCallback(async (newMessages = []) => {
    if (!newMessages[0] || !userIdRef.current) return;
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const message = newMessages[0];
    const uid = userIdRef.current;
    const cuProfile = currentUserProfileRef.current;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const optimisticMessage = {
      ...message,
      _id: tempId,
      pending: true,
      sent: false,
      received: false,
      user: {
        _id: uid,
        name: getCurrentUserDisplayName(cuProfile),
        avatar: getAvatarText(getCurrentUserDisplayName(cuProfile)),
      },
    };

    setMessages(prev => {
      if (prev.some(m => m._id === tempId)) return prev;
      return GiftedChat.append(prev, [optimisticMessage]);
    });

    try {
      const insertPayload = {
        sender_id: uid,
        receiver_id: friendId,
        content: message.text,
      };

      // Only include connection_id if we have it (it may be NOT NULL in schema)
      if (connectionIdRef.current) {
        insertPayload.connection_id = connectionIdRef.current;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        // Keep the message visible but mark as failed — don’t erase it
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempId
              ? { ...msg, pending: false, failed: true }
              : msg
          )
        );
      } else {
        processedMessageIds.current.add(data.id);

        // Replace optimistic with real message
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempId
              ? { ...msg, _id: data.id, pending: false, sent: true }
              : msg
          )
        );

        // Fire push notification to receiver (for when their app is closed)
        sendPushToReceiver(data.id, message.text);
      }
    } catch (error) {
      console.error('Error in onSend:', error);
      // Network error — keep message with failed indicator, allow retry
      setMessages(prev =>
        prev.map(msg =>
          msg._id === tempId
            ? { ...msg, pending: false, failed: true }
            : msg
        )
      );
    } finally {
      isSendingRef.current = false;
    }
  }, [friendId]);

  const loadMoreMessages = () => {
    if (!loadingMore && hasMoreMessages && messages.length > 0) {
      const oldest = messages[messages.length - 1];
      fetchMessages(oldest.createdAt instanceof Date
        ? oldest.createdAt.toISOString()
        : new Date(oldest.createdAt).toISOString()
      );
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderMessageTick = (message) => {
    const uid = userIdRef.current || userId;
    if (message.user._id !== uid) return null;

    if (message.failed) {
      // Red ! = network error, tap to retry
      return (
        <TouchableOpacity onPress={() => retryFailedMessage(message)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="alert-circle" size={14} color="#EF4444" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      );
    }
    if (message.pending) {
      return <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.6)" style={{ marginLeft: 3 }} />;
    }
    if (message.received) {
      return <Ionicons name="checkmark-done" size={15} color="#93C5FD" style={{ marginLeft: 3 }} />;
    }
    if (message.sent) {
      return <Ionicons name="checkmark-done" size={15} color="rgba(255,255,255,0.85)" style={{ marginLeft: 3 }} />;
    }
    return <Ionicons name="checkmark" size={15} color="rgba(255,255,255,0.85)" style={{ marginLeft: 3 }} />;
  };

  // Retry a failed message by re-sending it
  const retryFailedMessage = useCallback((failedMsg) => {
    setMessages(prev => prev.filter(m => m._id !== failedMsg._id));
    onSend([{ _id: failedMsg._id, text: failedMsg.text, createdAt: new Date() }]);
  }, [onSend]);

  const renderBubble = (props) => {
    const uid = userIdRef.current || userId;
    const isOwn = props.currentMessage.user._id === uid;
    const ts = props.currentMessage.createdAt instanceof Date
      ? props.currentMessage.createdAt
      : new Date(props.currentMessage.createdAt);

    return (
      <View style={styles.bubbleWrapper}>
        <Bubble
          {...props}
          wrapperStyle={{
            right: styles.bubbleRight,
            left: styles.bubbleLeft,
          }}
          textStyle={{
            right: styles.bubbleTextRight,
            left: styles.bubbleTextLeft,
          }}
          containerStyle={{
            right: { marginBottom: 2 },
            left: { marginBottom: 2 },
          }}
          renderTime={() => null}
          renderTicks={() => null}
        />
        {/* Time + tick row below bubble */}
        <View style={[styles.msgMeta, isOwn ? styles.msgMetaRight : styles.msgMetaLeft]}>
          <Text style={[styles.msgTime, isOwn ? styles.msgTimeOwn : styles.msgTimeFriend]}>
            {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isOwn && renderMessageTick(props.currentMessage)}
        </View>
      </View>
    );
  };

  const renderAvatar = (props) => {
    const uid = userIdRef.current || userId;
    if (props.currentMessage.user._id === uid) return null;
    const avatarText = props.currentMessage.user.avatar;
    return (
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          {avatarText?.startsWith('http') ? (
            <Image source={{ uri: avatarText }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{avatarText}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderInputToolbar = (props) => (
    <View style={[styles.bottomSection, {
      // iOS handled by KAV. Android: only add safe-area bottom when keyboard is hidden
      paddingBottom: Platform.OS === 'ios' ? 0 : (androidKbHeight > 0 ? 0 : insets.bottom),
    }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesRow} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={[styles.quickChip, { backgroundColor: '#EEF2FF' }]}>
          <Ionicons name="flash" size={13} color="#5C7CFA" />
          <Text style={[styles.quickChipText, { color: '#5C7CFA' }]}>Meet now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickChip}>
          <Ionicons name="time-outline" size={13} color="#6B7280" />
          <Text style={styles.quickChipText}>5 mins?</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickChip}>
          <Ionicons name="cafe-outline" size={13} color="#6B7280" />
          <Text style={styles.quickChipText}>Coffee?</Text>
        </TouchableOpacity>
      </ScrollView>

      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbar}
        primaryStyle={styles.inputPrimary}
        renderActions={() => (
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="add" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const renderSend = (props) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={styles.sendBtn}>
        <Ionicons name="arrow-up" size={18} color="#FFF" />
      </View>
    </Send>
  );

  const renderFooter = () =>
    loadingMore ? <View style={styles.loadingMore}><ActivityIndicator size="small" color="#5C7CFA" /></View> : null;

  // Android: plain View — keyboard height is applied as paddingBottom on the outer wrapper
  // iOS: KeyboardAvoidingView with padding behavior
  const ScreenWrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const wrapperProps = Platform.OS === 'ios'
    ? { behavior: 'padding', keyboardVerticalOffset: insets.top }
    : {};

  const uid = userIdRef.current || userId || 'currentUser';

  return (
    <ScreenWrapper
      {...wrapperProps}
      style={[
        styles.container,
        { paddingTop: insets.top },
        // Android: shrink container by exact keyboard height
        Platform.OS === 'android' && androidKbHeight > 0 ? { paddingBottom: androidKbHeight } : {},
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {getAvatarText(friendProfile?.name || friendName)}
            </Text>
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerName}>{friendProfile?.name || friendName}</Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerStatus}>NEARBY</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="call-outline" size={20} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat */}
      <GiftedChat
        messages={messages}
        onSend={msgs => onSend(msgs)}
        user={{ _id: uid }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        renderAvatar={renderAvatar}
        renderFooter={renderFooter}
        alwaysShowSend
        scrollToBottom
        scrollToBottomComponent={() => (
          <View style={styles.scrollToBottomBtn}>
            <Ionicons name="chevron-down" size={18} color="#111827" />
          </View>
        )}
        placeholder="Type a message..."
        showUserAvatar={false}
        renderUsernameOnMessage={false}
        messagesContainerStyle={styles.messagesContainer}
        textInputStyle={styles.textInput}
        minInputToolbarHeight={60}
        bottomOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        infiniteScroll
        loadEarlier={hasMoreMessages}
        onLoadEarlier={loadMoreMessages}
        isLoadingEarlier={loadingMore}
        minComposerHeight={40}
        maxComposerHeight={120}
        renderTime={() => null}
        renderTicks={() => null}
        keyboardShouldPersistTaps="handled"
        isKeyboardInternallyHandled={false}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  headerAvatarText: { fontSize: 14, fontWeight: '700', color: '#5C7CFA' },
  headerTextWrap: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  headerStatus: { fontSize: 10, color: '#5C7CFA', fontWeight: '700', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 6 },

  // ── Loading ─────────────────────────────────────────────────────────────────
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#6B7280' },
  loadingMore: { paddingVertical: 16, alignItems: 'center' },

  // ── Messages ────────────────────────────────────────────────────────────────
  messagesContainer: { backgroundColor: '#FFFFFF', paddingBottom: 4 },

  // ── Bubble ──────────────────────────────────────────────────────────────────
  bubbleWrapper: { marginVertical: 2 },
  bubbleRight: {
    backgroundColor: '#5C7CFA',
    borderRadius: 20, borderBottomRightRadius: 4,
    paddingHorizontal: 6, paddingVertical: 6,
    marginLeft: 60, marginRight: 8,
    maxWidth: '82%',
  },
  bubbleLeft: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20, borderBottomLeftRadius: 4,
    paddingHorizontal: 6, paddingVertical: 6,
    marginRight: 60, marginLeft: 4,
    maxWidth: '82%',
  },
  bubbleTextRight: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  bubbleTextLeft: { color: '#111827', fontSize: 15, lineHeight: 22 },

  // ── Message meta (time + ticks) ─────────────────────────────────────────────
  msgMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 10 },
  msgMetaRight: { justifyContent: 'flex-end', marginRight: 8 },
  msgMetaLeft: { justifyContent: 'flex-start', marginLeft: 42 },
  msgTime: { fontSize: 10, fontWeight: '600' },
  msgTimeOwn: { color: '#9CA3AF' },
  msgTimeFriend: { color: '#9CA3AF' },

  // ── Avatar ───────────────────────────────────────────────────────────────────
  avatarContainer: { marginRight: 8, alignSelf: 'flex-end', marginBottom: 2 },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#5C7CFA' },

  // ── Input area ───────────────────────────────────────────────────────────────
  bottomSection: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  quickRepliesRow: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#F3F4F6',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  quickChipText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },

  inputToolbar: {
    borderTopWidth: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  inputPrimary: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingLeft: 4,
    minHeight: 44,
  },
  actionBtn: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  textInput: {
    flex: 1, paddingTop: 10, paddingBottom: 10,
    fontSize: 15, lineHeight: 20, color: '#111827',
  },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 6, height: 44 },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#5C7CFA',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#5C7CFA', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },

  scrollToBottomBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
});
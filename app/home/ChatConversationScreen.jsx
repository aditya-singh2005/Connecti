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
  AppState,
  ScrollView,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { GiftedChat, Bubble, InputToolbar, Send, Avatar, Time, Day } from 'react-native-gifted-chat';
import { supabase } from "../../lib/supabase";
import { useChatNotifications } from "../../hooks/useChatNotifications";

function getAvatarText(name) {
  if (!name || typeof name !== 'string' || name.length === 0) return '?';
  
  const nameParts = name.trim().split(' ').filter(part => part.length > 0);
  
  if (nameParts.length === 0) return '?';
  
  // If there are multiple words (first name + last name), take first letter of each
  if (nameParts.length >= 2) {
    return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
  }
  
  // If single word and has 2+ characters, take first two letters
  if (nameParts[0].length >= 2) {
    return nameParts[0].substring(0, 2).toUpperCase();
  }
  
  // If single character, just return it
  return nameParts[0].charAt(0).toUpperCase();
}

export default function ChatConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
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
  
  const subscriptionRef = useRef(null);
  const messageLimit = 50;
  const processedMessageIds = useRef(new Set());
  const pendingMessagesRef = useRef(new Map()); // Map of tempId -> { realId, timestamp }
  const isSendingRef = useRef(false); // Prevent race conditions

  // Initialize chat notifications hook
  const { setCurrentScreen, clearCurrentScreen, updateBadgeCount } = useChatNotifications();

  useEffect(() => {
    getCurrentUser();
  }, []);

  // Set current screen when component mounts
  useEffect(() => {
    if (friendId) {
      setCurrentScreen(`chat-${friendId}`);
    }
    
    return () => {
      clearCurrentScreen();
    };
  }, [friendId, setCurrentScreen, clearCurrentScreen]);

  // Handle screen focus - mark messages as read only when screen is focused
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      
      // Mark messages as read when screen comes into focus
      if (userId && friendId) {
        markAllMessagesAsRead();
        // Update badge count after marking as read
        setTimeout(() => {
          updateBadgeCount();
        }, 500);
      }

      return () => {
        setIsScreenFocused(false);
      };
    }, [userId, friendId, updateBadgeCount])
  );

  useEffect(() => {
    if (userId) {
      fetchCurrentUserProfile();
      fetchFriendProfile();
      fetchMessages();
      setupRealtimeSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [friendId, userId]);

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
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
      }
    } catch (error) {
      console.error('Error fetching friend profile:', error);
    }
  };

  const fetchCurrentUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, username, avatar_url')
        .eq('id', userId)
        .single();

      if (data && !error) {
        setCurrentUserProfile(data);
      } else {
        // If profile fetch fails, at least set username from auth
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.username) {
          setCurrentUserProfile({ 
            name: null, 
            username: user.user_metadata.username,
            avatar_url: null 
          });
        }
      }
    } catch (error) {
      console.error('Error fetching current user profile:', error);
    }
  };

  // Helper function to get current user's display name
  const getCurrentUserDisplayName = () => {
    if (currentUserProfile?.name && currentUserProfile.name.trim().length > 0) {
      return currentUserProfile.name;
    }
    if (currentUserProfile?.username && currentUserProfile.username.trim().length > 0) {
      return currentUserProfile.username;
    }
    return 'You';
  };

  // Helper function to get current user's avatar text
  const getCurrentUserAvatar = () => {
    const displayName = getCurrentUserDisplayName();
    return getAvatarText(displayName);
  };

  const fetchMessages = async (oldestMessageId = null) => {
    try {
      if (!oldestMessageId) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      let query = supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: false })
        .limit(messageLimit);

      if (oldestMessageId) {
        const oldestMessage = messages.find(m => m._id === oldestMessageId);
        if (oldestMessage) {
          query = query.lt('created_at', oldestMessage.createdAt.toISOString());
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const formattedMessages = data.map(msg => {
          // Mark as processed
          processedMessageIds.current.add(msg.id);
          
          return {
            _id: msg.id,
            text: msg.content,
            createdAt: new Date(msg.created_at),
            user: {
              _id: msg.sender_id,
              name: msg.sender_id === userId ? getCurrentUserDisplayName() : (friendProfile?.name || friendName),
              avatar: msg.sender_id === userId 
                ? getCurrentUserAvatar()
                : getAvatarText(friendProfile?.name || friendName),
            },
            sent: true,
            received: msg.read_at !== null,
            pending: false,
          };
        });

        if (oldestMessageId) {
          setMessages(previousMessages => 
            GiftedChat.append(previousMessages, formattedMessages)
          );
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

  const setupRealtimeSubscription = () => {
    if (!userId) return;

    subscriptionRef.current = supabase
      .channel(`messages-${userId}-${friendId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage = payload.new;
          
          // Check if this message is for this conversation
          if (
            (newMessage.sender_id === userId && newMessage.receiver_id === friendId) ||
            (newMessage.sender_id === friendId && newMessage.receiver_id === userId)
          ) {
            // Check if already processed
            if (processedMessageIds.current.has(newMessage.id)) {
              return;
            }
            
            // Mark as processed immediately
            processedMessageIds.current.add(newMessage.id);

            const formattedMessage = {
              _id: newMessage.id,
              text: newMessage.content,
              createdAt: new Date(newMessage.created_at),
              user: {
                _id: newMessage.sender_id,
                name: newMessage.sender_id === userId ? getCurrentUserDisplayName() : (friendProfile?.name || friendName),
                avatar: newMessage.sender_id === userId 
                  ? getCurrentUserAvatar()
                  : getAvatarText(friendProfile?.name || friendName),
              },
              sent: true,
              received: newMessage.read_at !== null,
              pending: false,
            };

            setMessages(previousMessages => {
              // Check for pending message that matches this real message
              let foundPendingId = null;
              
              for (const [tempId, data] of pendingMessagesRef.current.entries()) {
                if (data.realId === newMessage.id) {
                  foundPendingId = tempId;
                  break;
                }
              }
              
              if (foundPendingId) {
                // Replace the pending message
                pendingMessagesRef.current.delete(foundPendingId);
                return previousMessages.map(msg => 
                  msg._id === foundPendingId ? formattedMessage : msg
                );
              }
              
              // Double check: don't add if message with this ID already exists
              const exists = previousMessages.some(m => m._id === newMessage.id);
              if (exists) {
                return previousMessages;
              }
              
              // This is a new message from friend or from another device
              return GiftedChat.append(previousMessages, [formattedMessage]);
            });

            // Mark as read if message is from friend AND screen is focused
            if (newMessage.sender_id === friendId && isScreenFocused) {
              markMessageAsRead(newMessage.id);
              // Update badge count after marking as read
              setTimeout(() => {
                updateBadgeCount();
              }, 300);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updatedMessage = payload.new;
          
          // Only update if the message belongs to this conversation
          if (
            (updatedMessage.sender_id === userId && updatedMessage.receiver_id === friendId) ||
            (updatedMessage.sender_id === friendId && updatedMessage.receiver_id === userId)
          ) {
            setMessages(previousMessages => 
              previousMessages.map(msg => 
                msg._id === updatedMessage.id
                  ? { ...msg, received: updatedMessage.read_at !== null }
                  : msg
              )
            );
          }
        }
      )
      .subscribe();
  };

  const markMessageAsRead = async (messageId) => {
    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('receiver_id', userId) // Only mark as read if current user is receiver
        .is('read_at', null);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const markAllMessagesAsRead = async () => {
    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', friendId)
        .eq('receiver_id', userId)
        .is('read_at', null);
    } catch (error) {
      console.error('Error marking all messages as read:', error);
    }
  };

  const onSend = useCallback(async (newMessages = []) => {
    if (!newMessages[0] || !userId) return;
    
    // Prevent multiple simultaneous sends
    if (isSendingRef.current) {
      console.log('Already sending a message, skipping...');
      return;
    }
    
    isSendingRef.current = true;

    try {
      const message = newMessages[0];
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const optimisticMessage = {
        ...message,
        _id: tempId,
        pending: true,
        sent: false,
        received: false,
        user: {
          _id: userId,
          name: getCurrentUserDisplayName(),
          avatar: getCurrentUserAvatar(),
        },
      };

      // Add optimistic message immediately
      setMessages(previousMessages => {
        // Double check: don't add if this temp message already exists
        const exists = previousMessages.some(m => m._id === tempId);
        if (exists) {
          return previousMessages;
        }
        return GiftedChat.append(previousMessages, [optimisticMessage]);
      });

      // Send to database
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            sender_id: userId,
            receiver_id: friendId,
            content: message.text,
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        // Remove the failed message
        setMessages(previousMessages =>
          previousMessages.filter(msg => msg._id !== tempId)
        );
        pendingMessagesRef.current.delete(tempId);
      } else {
        // Store the mapping
        pendingMessagesRef.current.set(tempId, {
          realId: data.id,
          timestamp: Date.now()
        });
        
        // Mark as processed to prevent realtime duplicate
        processedMessageIds.current.add(data.id);
        
        // Update the message with real ID
        setMessages(previousMessages => {
          return previousMessages.map(msg =>
            msg._id === tempId
              ? {
                  ...msg,
                  _id: data.id,
                  pending: false,
                  sent: true,
                }
              : msg
          );
        });
        
        // Clean up the mapping after delay
        setTimeout(() => {
          pendingMessagesRef.current.delete(tempId);
        }, 3000);
      }
    } catch (error) {
      console.error('Error in onSend:', error);
    } finally {
      // Reset sending flag
      isSendingRef.current = false;
    }
  }, [friendId, userId, currentUserProfile, friendProfile, friendName]);

  const loadMoreMessages = () => {
    if (!loadingMore && hasMoreMessages && messages.length > 0) {
      const oldestMessage = messages[messages.length - 1];
      fetchMessages(oldestMessage._id);
    }
  };

  const renderBubble = (props) => {
    const isCurrentUser = props.currentMessage.user._id === userId;
    
    return (
      <View style={styles.bubbleContainer}>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: '#5C7CFA',
              borderRadius: 20,
              borderBottomRightRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 6,
              marginLeft: 80,
              marginRight: 8,
              marginVertical: 2,
              maxWidth: '80%',
              elevation: 0,
            },
            left: {
              backgroundColor: '#F3F4F6',
              borderRadius: 20,
              borderBottomLeftRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 6,
              marginRight: 80,
              marginLeft: 4,
              marginVertical: 2,
              maxWidth: '80%',
              elevation: 0,
            },
          }}
          textStyle={{
            right: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
            left: { color: '#111827', fontSize: 15, lineHeight: 22 },
          }}
          containerStyle={{
            right: { marginBottom: 4 },
            left: { marginBottom: 4 }
          }}
          renderTime={() => null}
          renderTicks={() => null}
        />
        <View style={[
          styles.messageFooter,
          isCurrentUser ? styles.messageFooterRight : styles.messageFooterLeft
        ]}>
          <Text style={[
            styles.messageTime,
            isCurrentUser ? styles.messageTimeRight : styles.messageTimeLeft
          ]}>
            {props.currentMessage.createdAt.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
          {isCurrentUser && renderMessageStatus(props.currentMessage)}
        </View>
      </View>
    );
  };

  const renderMessageStatus = (message) => {
    if (message.user._id !== userId) return null;
    
    if (message.pending) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.statusText}>Delivered</Text>
        <Ionicons name="checkmark-circle-outline" size={12} color="#9CA3AF" style={{ marginLeft: 2 }} />
      </View>
    );
  };

  const renderAvatar = (props) => {
    const isCurrentUser = props.currentMessage.user._id === userId;
    const avatarText = isCurrentUser 
      ? getCurrentUserAvatar()
      : props.currentMessage.user.avatar;
    
    return (
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, isCurrentUser && styles.avatarCurrentUser]}>
          {avatarText?.length > 2 && avatarText.startsWith('http') ? (
            <Image source={{ uri: avatarText }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{avatarText}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderInputToolbar = (props) => {
    return (
      <View style={styles.bottomSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesContainer}>
          <TouchableOpacity style={[styles.quickReplyBtn, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="flash" size={14} color="#5C7CFA" />
            <Text style={[styles.quickReplyText, { color: '#5C7CFA' }]}>Meet now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickReplyBtn}>
            <Ionicons name="time-outline" size={14} color="#6B7280" />
            <Text style={styles.quickReplyText}>5 mins?</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickReplyBtn}>
            <Ionicons name="cafe-outline" size={14} color="#6B7280" />
            <Text style={styles.quickReplyText}>Coffee?</Text>
          </TouchableOpacity>
        </ScrollView>
        <InputToolbar
          {...props}
          containerStyle={styles.inputToolbar}
          primaryStyle={styles.inputPrimary}
          renderActions={() => (
            <TouchableOpacity style={styles.plusButton}>
              <Ionicons name="add" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  const renderSend = (props) => {
    return (
      <View style={styles.sendWrapper}>
        <TouchableOpacity style={styles.locationIconBtn}>
          <Ionicons name="location-outline" size={20} color="#9CA3AF" />
        </TouchableOpacity>
        <Send {...props} containerStyle={styles.sendContainer}>
          <View style={styles.sendButton}>
            <Ionicons name="arrow-up" size={18} color="#FFF" />
          </View>
        </Send>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color="#1E88E5" />
        </View>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerName}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {getAvatarText(friendProfile?.name || friendName)}
            </Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerName}>{friendProfile?.name || friendName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
              <Text style={styles.headerStatus}>NEARBY</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="call-outline" size={20} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {/* GiftedChat Component */}
      <GiftedChat
        messages={messages}
        onSend={messages => onSend(messages)}
        user={{
          _id: userId || 'currentUser',
        }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        renderAvatar={renderAvatar}
        renderFooter={renderFooter}
        alwaysShowSend
        scrollToBottom
        scrollToBottomComponent={() => (
          <View style={styles.scrollToBottomButton}>
            <Text style={styles.scrollToBottomText}>↓</Text>
          </View>
        )}
        placeholder="Type a message..."
        showUserAvatar={true}
        renderUsernameOnMessage={false}
        messagesContainerStyle={styles.messagesContainer}
        textInputStyle={styles.textInput}
        minInputToolbarHeight={60}
        bottomOffset={0}
        infiniteScroll
        loadEarlier={hasMoreMessages}
        onLoadEarlier={loadMoreMessages}
        isLoadingEarlier={loadingMore}
        minComposerHeight={40}
        maxComposerHeight={100}
        renderTime={() => null}
        renderTicks={() => null}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  headerStatus: {
    fontSize: 10,
    color: '#5C7CFA',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  messagesContainer: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 20,
  },
  bubbleContainer: {
    marginVertical: 4,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
  },
  messageFooterRight: {
    justifyContent: 'flex-end',
    marginRight: 8,
  },
  messageFooterLeft: {
    justifyContent: 'flex-start',
    marginLeft: 42,
  },
  messageTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  messageTimeRight: {
    color: '#9CA3AF',
    marginRight: 6,
  },
  messageTimeLeft: {
    color: '#9CA3AF',
  },
  statusText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  avatarContainer: {
    marginRight: 8,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCurrentUser: {
    display: 'none',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  bottomSection: {
    backgroundColor: '#FFFFFF',
  },
  quickRepliesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  quickReplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickReplyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  inputToolbar: {
    borderTopWidth: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  inputPrimary: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    paddingLeft: 4,
  },
  plusButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 20,
    color: '#111827',
  },
  sendWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#5C7CFA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollToBottomButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollToBottomText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
});
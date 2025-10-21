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
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { GiftedChat, Bubble, InputToolbar, Send, Avatar, Time } from 'react-native-gifted-chat';
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
              backgroundColor: '#1E88E5',
              borderRadius: 18,
              borderBottomRightRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 9,
              marginLeft: 80,
              marginRight: 8,
              marginVertical: 2,
              maxWidth: '75%',
              elevation: 1,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
            },
            left: {
              backgroundColor: '#E8E8E8',
              borderRadius: 18,
              borderBottomLeftRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 9,
              marginRight: 80,
              marginLeft: 8,
              marginVertical: 2,
              maxWidth: '75%',
              elevation: 1,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
            },
          }}
          textStyle={{
            right: {
              color: '#FFFFFF',
              fontSize: 15,
              lineHeight: 20,
            },
            left: {
              color: '#000000',
              fontSize: 15,
              lineHeight: 20,
            },
          }}
          containerStyle={{
            right: {
              marginBottom: 4,
            },
            left: {
              marginBottom: 4,
            }
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
    
    let statusIcon;
    let statusColor;
    
    if (message.pending) {
      return null; // No icon for pending
    } else if (message.received) {
      statusIcon = '✓✓'; // Double tick when read
      statusColor = '#2196F3'; // Blue when read
    } else if (message.sent) {
      statusIcon = '✓✓'; // Double tick when delivered
      statusColor = '#999999'; // Gray for delivered but not read
    } else {
      statusIcon = '✓'; // Single tick when sent but not delivered
      statusColor = '#999999'; // Gray for sent
    }
    
    return (
      <Text style={[styles.statusIcon, { color: statusColor }]}>
        {statusIcon}
      </Text>
    );
  };

  const renderAvatar = (props) => {
    const isCurrentUser = props.currentMessage.user._id === userId;
    
    // Get the correct avatar text - recalculate for current user to ensure it's always up to date
    const avatarText = isCurrentUser 
      ? getCurrentUserAvatar()
      : props.currentMessage.user.avatar;
    
    return (
      <View style={styles.avatarContainer}>
        <View style={[
          styles.avatar,
          isCurrentUser && styles.avatarCurrentUser
        ]}>
          <Text style={styles.avatarText}>
            {avatarText}
          </Text>
        </View>
      </View>
    );
  };

  const renderInputToolbar = (props) => {
    return (
      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbar}
        primaryStyle={styles.inputPrimary}
      />
    );
  };

  const renderSend = (props) => {
    return (
      <Send {...props} containerStyle={styles.sendContainer}>
        <View style={styles.sendButton}>
          <Text style={styles.sendButtonText}>➤</Text>
        </View>
      </Send>
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
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {getAvatarText(friendProfile?.name || friendName)}
            </Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerName}>{friendProfile?.name || friendName}</Text>
            <Text style={styles.headerStatus}>● Online</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>📹</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  backIcon: {
    fontSize: 26,
    color: '#262626',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    elevation: 2,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  headerAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  headerStatus: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  iconText: {
    fontSize: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666666',
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  messagesContainer: {
    backgroundColor: '#E3F2FD',
    paddingBottom: 4,
  },
  bubbleContainer: {
    marginVertical: 1,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  messageFooterRight: {
    justifyContent: 'flex-end',
    marginRight: 12,
  },
  messageFooterLeft: {
    justifyContent: 'flex-start',
    marginLeft: 52,
  },
  messageTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  messageTimeRight: {
    color: '#999999',
    marginRight: 4,
  },
  messageTimeLeft: {
    color: '#999999',
  },
  statusIcon: {
    fontSize: 12,
    fontWeight: '600',
  },
  avatarContainer: {
    marginBottom: 4,
    marginLeft: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  avatarCurrentUser: {
    backgroundColor: '#4CAF50',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarSpacer: {
    width: 40,
  },
  inputToolbar: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  inputPrimary: {
    alignItems: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    fontSize: 15,
    backgroundColor: '#F8F9FA',
    lineHeight: 20,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollToBottomButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E88E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 4,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  scrollToBottomText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
});
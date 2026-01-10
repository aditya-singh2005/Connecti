// FILE: app/home/_layout.js
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { TouchableOpacity, Alert, View, Text, StyleSheet } from 'react-native';
import { useFriendships } from '../../hooks/useFriendships';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { pendingCount, friends } = useFriendships();
  const { updateBadgeCount } = useChatNotifications();
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [userId, setUserId] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchUnreadCount();
      setupRealtimeSubscription();
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  // Refresh unread count when returning to chat screen or when friends change
  useEffect(() => {
    if (userId) {
      fetchUnreadCount();
    }
  }, [segments, friends, userId]);

  // Update badge count when screen focuses
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchUnreadCount();
        updateBadgeCount();
      }
    }, [userId, updateBadgeCount])
  );

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

  const setupRealtimeSubscription = () => {
    if (!userId) return;

    // Remove existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`unread_messages_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          fetchUnreadCount();
          updateBadgeCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        },
        (payload) => {
          console.log('Message updated:', payload);
          // When message is marked as read
          if (payload.new.read_at) {
            fetchUnreadCount();
            updateBadgeCount();
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    channelRef.current = channel;
  };

  const fetchUnreadCount = async () => {
    if (!userId) return;

    try {
      // Count total unread messages where current user is the receiver
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .is('read_at', null);

      if (error) {
        console.error('Error fetching unread count:', error);
        return;
      }

      console.log('Unread message count:', count);
      setUnreadChatCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          if (channelRef.current) {
            await supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1E88E5' },
        headerTintColor: '#fff',
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 15 }}>
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#e5e5e5',
        },
      }}
    >
      {/* 🏠 Home */}
      <Tabs.Screen
        name="HomeScreen"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: 'Connecti - Home',
        }}
      />

      {/* 🔍 Search */}
      <Tabs.Screen
        name="SearchScreen"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
          headerTitle: 'Search Friends',
        }}
      />

      {/* 💬 Chat with Badge */}
      <Tabs.Screen
        name="ChatScreen"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
              {unreadChatCount > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </Text>
                </View>
              )}
            </View>
          ),
          headerTitle: 'Chat',
        }}
      />

      {/* 👤 Profile */}
      <Tabs.Screen
        name="ProfileScreen"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons name="person-outline" size={size} color={color} />
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </Text>
                </View>
              )}
            </View>
          ),
          headerTitle: 'My Profile',
        }}
      />

      {/* Hidden Screens - These won't appear in tab bar */}
      <Tabs.Screen
        name="FriendsListScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="FriendRequestsScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="ProximitySettingsScreen"
        options={{
          href: null,
          headerTitle: 'Proximity Notifications',
          headerStyle: { backgroundColor: '#1E88E5' },
          headerTintColor: '#fff',
        }}
      />
      <Tabs.Screen
        name="ChatConversationScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      
      {/* 🚫 HIDE PermissionsScreen from navbar */}
      <Tabs.Screen
        name="PermissionsScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      
      {/* 🚫 HIDE SettingsScreen from navbar */}
      <Tabs.Screen
        name="SettingsScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -10,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
    zIndex: 1,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  chatBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
    zIndex: 1,
  },
  chatBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
});
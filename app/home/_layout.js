// FILE: app/home/_layout.js
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { useFriendships } from '../../hooks/useFriendships';
import { supabase } from '../../lib/supabase';

export default function HomeLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { unseenCount, friends } = useFriendships();
  const { updateBadgeCount } = useChatNotifications();
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [userId, setUserId] = useState(null);
  const channelRef = useRef(null);
  const lastUnreadErrorRef = useRef(null);

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
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .is('read_at', null);

      if (error) {
        // Only log the full error once per unique error message to avoid spamming
        const errKey = `${error.code}:${error.message}`;
        if (lastUnreadErrorRef.current !== errKey) {
          lastUnreadErrorRef.current = errKey;
          console.warn(
            '[Chat] Error fetching unread count:',
            '\n  code:', error.code,
            '\n  message:', error.message,
            '\n  details:', error.details,
            '\n  hint:', error.hint
          );
        }
        return;
      }

      lastUnreadErrorRef.current = null; // reset on success
      setUnreadChatCount(count || 0);
    } catch (err) {
      console.warn('[Chat] Unexpected error in fetchUnreadCount:', err?.message || err);
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
          title: 'HOME',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons name="home-outline" size={size} color={color} />
              {unseenCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unseenCount > 9 ? '9+' : unseenCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ),
          headerTitle: 'Connecti - Home',
          headerShown: false,
        }}
      />

      {/* 🌊 Waves */}
      <Tabs.Screen
        name="WavesScreen"
        options={{
          title: 'WAVES',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="water-outline" size={size} color={color} />
          ),
          headerShown: false,
        }}
      />

      {/* 🔍 Search */}
      <Tabs.Screen
        name="SearchScreen"
        options={{
          title: 'SEARCH',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
          headerShown: false,
        }}
      />

      {/* 💬 Chat */}
      <Tabs.Screen
        name="ChatScreen"
        options={{
          title: 'CHAT',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconContainer}>
              <Ionicons name="chatbubble-outline" size={size} color={color} />
              {unreadChatCount > 0 ? (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ),
          headerTitle: 'Chat',
          headerShown: false,
        }}
      />

      {/* 👤 Profile */}
      <Tabs.Screen
        name="ProfileScreen"
        options={{
          title: 'PROFILE',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          headerTitle: 'My Profile',
          headerShown: false,
        }}
      />

      {/* ⚙️ Settings (Hidden from navbar, accessible from Profile) */}
      <Tabs.Screen
        name="SettingsScreen"
        options={{
          href: null,
          title: 'SETTINGS',
          headerTitle: 'Settings',
          headerShown: false,
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

      {/* 🚫 HIDE BLETestScreen from navbar */}
      <Tabs.Screen
        name="BLETestScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      {/* 🚫 HIDE NotificationTestScreen from navbar */}
      <Tabs.Screen
        name="NotificationTestScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      {/* 🚫 HIDE HintScreen from navbar */}
      <Tabs.Screen
        name="HintScreen"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      {/* 🗺️ HIDE GeofenceTestScreen from navbar */}
      <Tabs.Screen
        name="GeofenceTestScreen"
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
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Alert, AppState } from 'react-native';

export function useFriendships() {
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  const fetchFriendships = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      // Fetch accepted friends - BOTH DIRECTIONS
      const { data: friendsData, error: friendsError } = await supabase
        .from('friendships')
        .select('id, user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (friendsError) throw friendsError;

      // Get friend profiles separately
      let formattedFriends = [];
      if (friendsData && friendsData.length > 0) {
        // Determine the friend ID based on who the current user is in each row
        const friendIds = friendsData.map(f => 
          f.user_id === user.id ? f.friend_id : f.user_id
        );
        
        const { data: friendProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, contact, username, city, country')
          .in('id', friendIds);

        if (profilesError) throw profilesError;

        formattedFriends = friendsData.map(f => {
          const friendId = f.user_id === user.id ? f.friend_id : f.user_id;
          const profile = friendProfiles.find(p => p.id === friendId);
          return {
            id: profile?.id,
            friendshipId: f.id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            city: profile?.city || '',
            country: profile?.country || '',
          };
        });
      }

      // Fetch pending requests (received) - where current user is friend_id
      const { data: pendingData, error: pendingError } = await supabase
        .from('friendships')
        .select('id, user_id, created_at')
        .eq('friend_id', user.id)
        .eq('status', 'pending');

      if (pendingError) throw pendingError;

      // Get requester profiles separately
      let formattedPending = [];
      if (pendingData && pendingData.length > 0) {
        const userIds = pendingData.map(p => p.user_id);
        const { data: userProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, contact, username')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        formattedPending = pendingData.map(p => {
          const profile = userProfiles.find(up => up.id === p.user_id);
          return {
            id: p.id,
            userId: profile?.id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            createdAt: p.created_at,
          };
        });
      }

      // Fetch sent requests - where current user is user_id
      const { data: sentData, error: sentError } = await supabase
        .from('friendships')
        .select('id, friend_id, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (sentError) throw sentError;

      // Get sent request profiles separately
      let formattedSent = [];
      if (sentData && sentData.length > 0) {
        const friendIds = sentData.map(s => s.friend_id);
        const { data: friendProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, contact, username')
          .in('id', friendIds);

        if (profilesError) throw profilesError;

        formattedSent = sentData.map(s => {
          const profile = friendProfiles.find(fp => fp.id === s.friend_id);
          return {
            id: s.id,
            friendId: profile?.id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            createdAt: s.created_at,
          };
        });
      }

      setFriends(formattedFriends);
      setPendingRequests(formattedPending);
      setSentRequests(formattedSent);

    } catch (error) {
      console.error('Error fetching friendships:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Setup realtime subscription and app state listener
  useEffect(() => {
    let channel;
    
    const setupRealtimeSubscription = async () => {
      await fetchFriendships();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try to create a channel for realtime updates
      try {
        channel = supabase
          .channel('friendships-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'friendships',
            },
            (payload) => {
              console.log('Realtime update received:', payload);
              
              const isRelevant = 
                payload.new?.user_id === user.id || 
                payload.new?.friend_id === user.id ||
                payload.old?.user_id === user.id || 
                payload.old?.friend_id === user.id;

              if (isRelevant) {
                fetchFriendships(false);
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Realtime subscription active');
            } else if (status === 'CHANNEL_ERROR') {
              console.log('Realtime not available, using AppState fallback');
            }
          });
      } catch (error) {
        console.log('Realtime setup failed, using AppState fallback');
      }
    };

    setupRealtimeSubscription();

    // Refresh when app comes to foreground
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchFriendships(false);
      }
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      appStateSubscription.remove();
    };
  }, [fetchFriendships]);

  const acceptFriendRequest = async (friendshipId) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

      if (error) throw error;

      await fetchFriendships(false);
      return true;
    } catch (error) {
      console.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
      return false;
    }
  };

  const removeFriendship = async (friendshipId) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) throw error;

      await fetchFriendships(false);
      return true;
    } catch (error) {
      console.error('Error removing friendship:', error);
      Alert.alert('Error', 'Failed to remove friendship');
      return false;
    }
  };

  const sendFriendRequest = async (friendId) => {
    try {
      if (!currentUserId) {
        Alert.alert('Error', 'User not authenticated');
        return false;
      }

      // Check if friendship already exists in EITHER direction
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') {
          Alert.alert('Info', 'You are already friends with this user');
        } else {
          Alert.alert('Info', 'Friend request already sent');
        }
        return false;
      }

      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: currentUserId,
          friend_id: friendId,
          status: 'pending'
        });

      if (error) throw error;

      Alert.alert('Success', 'Friend request sent!');
      await fetchFriendships(false);
      return true;
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request');
      return false;
    }
  };

  const searchUsers = async (query) => {
    try {
      if (!currentUserId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, contact, username')
        .or(`name.ilike.%${query}%,contact.ilike.%${query}%,username.ilike.%${query}%`)
        .neq('id', currentUserId)
        .limit(20);

      if (error) throw error;

      const usersWithStatus = await Promise.all(
        data.map(async (user) => {
          // Check friendship in BOTH directions
          const { data: friendship } = await supabase
            .from('friendships')
            .select('status')
            .or(`and(user_id.eq.${currentUserId},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${currentUserId})`)
            .maybeSingle();

          return {
            ...user,
            is_friend: friendship?.status === 'accepted',
            friendship_status: friendship?.status || null,
          };
        })
      );

      return usersWithStatus;
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  };

  return {
    friends,
    pendingRequests,
    sentRequests,
    isLoading,
    friendCount: friends.length,
    pendingCount: pendingRequests.length,
    sentCount: sentRequests.length,
    acceptFriendRequest,
    removeFriendship,
    sendFriendRequest,
    searchUsers,
    refreshFriendships: fetchFriendships,
  };
}
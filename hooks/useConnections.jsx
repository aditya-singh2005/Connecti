// hooks/useConnections.jsx
// Replaces useFriendships - now uses the new `connections` and `interactions` tables
// from the restructured Supabase schema.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../context/AuthProvider';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../services/api';

const ConnectionsContext = createContext(null);

function useConnectionsState() {
  const { user } = useAuth();
  const [connections, setConnections] = useState([]);
  const [pendingInteractions, setPendingInteractions] = useState([]);
  const [sentInteractions, setSentInteractions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const currentUserIdRef = useRef(null);
  const optimisticConnectionsRef = useRef(new Map());
  const relationshipEventsChannelRef = useRef(null);
  // Tracks last time user opened the Inbox — used to compute unseenCount
  const [lastInboxVisit, setLastInboxVisit] = useState(0);
  const lastInboxVisitRef = useRef(0);
  const lastInboxVisitKeyRef = useRef(null);
  const [unseenNotificationCount, setUnseenNotificationCount] = useState(0);

  /**
   * Fetch all connections (mutual matches) and pending interactions.
  * `friendships` table: user1_id, user2_id
   * `interactions` table: sender_id, receiver_id, interaction_type, status, zone_id
   */
  const fetchConnections = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const inboxVisitKey = `inbox_last_visit_${user.id}`;
      if (lastInboxVisitKeyRef.current !== inboxVisitKey) {
        const stored = await AsyncStorage.getItem(inboxVisitKey);
        const ts = stored ? parseInt(stored, 10) : 0;
        lastInboxVisitKeyRef.current = inboxVisitKey;
        lastInboxVisitRef.current = ts;
        setLastInboxVisit(ts);
      }

      setCurrentUserId(user.id);
      currentUserIdRef.current = user.id;

      // ── Fetch accepted connections (mutual matches) ───────────────────────
      const { data: connectionsData, error: connError } = await supabase
        .from('friendships')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (connError) {
        console.error('Error fetching connections:', connError);
      }

      let formattedConnections = [];
      if (connectionsData && connectionsData.length > 0) {
        const partnerIds = connectionsData.map(c =>
          c.user1_id === user.id ? c.user2_id : c.user1_id
        );

        const { data: partnerProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, contact, username, city, country')
          .in('id', partnerIds);

        if (profileError) console.error('Error fetching partner profiles:', profileError);

        formattedConnections = connectionsData.map(c => {
          const partnerId = c.user1_id === user.id ? c.user2_id : c.user1_id;
          const profile = (partnerProfiles || []).find(p => p.id === partnerId);
          return {
            id: profile?.id,
            connectionId: c.id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            city: profile?.city || '',
            country: profile?.country || '',
            connectedAt: c.created_at,
          };
        }).filter(c => c.id); // remove any that had no profile
      }

      // ── Fetch pending incoming interactions (waves/hints to me) ──────────
      const { data: pendingData, error: pendingError } = await supabase
        .from('interactions')
        .select('id, sender_id, interaction_type, zone_id, created_at')
        .eq('receiver_id', user.id)
        .eq('status', 'pending');

      if (pendingError) console.error('Error fetching pending interactions:', pendingError);

      let formattedPending = [];
      if (pendingData && pendingData.length > 0) {
        const senderIds = pendingData.map(i => i.sender_id);
        const { data: senderProfiles } = await supabase
          .from('profiles')
          .select('id, name, contact, username')
          .in('id', senderIds);

        formattedPending = pendingData.map(i => {
          const profile = (senderProfiles || []).find(p => p.id === i.sender_id);
          return {
            id: i.id,
            senderId: i.sender_id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            interactionType: i.interaction_type,
            zoneId: i.zone_id,
            createdAt: i.created_at,
          };
        });
      }

      // ── Fetch sent pending interactions (waves I sent) ────────────────────
      const { data: sentData, error: sentError } = await supabase
        .from('interactions')
        .select('id, receiver_id, interaction_type, zone_id, created_at')
        .eq('sender_id', user.id)
        .eq('status', 'pending');

      if (sentError) console.error('Error fetching sent interactions:', sentError);

      let formattedSent = [];
      if (sentData && sentData.length > 0) {
        const receiverIds = sentData.map(i => i.receiver_id);
        const { data: receiverProfiles } = await supabase
          .from('profiles')
          .select('id, name, contact, username')
          .in('id', receiverIds);

        formattedSent = sentData.map(i => {
          const profile = (receiverProfiles || []).find(p => p.id === i.receiver_id);
          return {
            id: i.id,
            receiverId: i.receiver_id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            interactionType: i.interaction_type,
            zoneId: i.zone_id,
            createdAt: i.created_at,
          };
        });
      }

      const reconciledConnections = [...formattedConnections];
      optimisticConnectionsRef.current.forEach((connection, partnerId) => {
        if (!reconciledConnections.some(existing => existing.id === partnerId)) {
          reconciledConnections.push(connection);
        } else {
          optimisticConnectionsRef.current.delete(partnerId);
        }
      });

      setConnections(reconciledConnections);
      setPendingInteractions(formattedPending);
      setSentInteractions(formattedSent);

    } catch (error) {
      console.error('Error in fetchConnections:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyAcceptedConnection = useCallback((row) => {
    const userId = currentUserIdRef.current;
    if (!userId || (row.sender_id !== userId && row.receiver_id !== userId)) return;

    const partnerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    const optimisticConnection = {
      id: partnerId,
      connectionId: `interaction-${row.id}`,
      name: 'Connecti user',
      contact: '',
      username: '',
      city: '',
      country: '',
      zoneId: row.zone_id,
      connectedAt: row.updated_at || new Date().toISOString(),
    };
    optimisticConnectionsRef.current.set(partnerId, optimisticConnection);
    setConnections(prev => prev.some(connection => connection.id === partnerId)
      ? prev
      : [optimisticConnection, ...prev]
    );
  }, []);

  // ── Setup realtime subscriptions ─────────────────────────────────────────
  // Optimistic local mutations — badges update in <50ms, no full re-fetches.
  useEffect(() => {
    let channel;
    let notificationSubscription;
    let cancelled = false;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let databaseStatus = 'CLOSED';

    const removeRealtimeChannels = () => {
      if (channel) supabase.removeChannel(channel);
      channel = null;
      relationshipEventsChannelRef.current = null;
      databaseStatus = 'CLOSED';
    };

    let setup;

    const scheduleReconnect = (status) => {
      if (cancelled || !user?.id || reconnectTimer || databaseStatus === 'SUBSCRIBED') return;

      const delay = Math.min(30000, 1000 * (2 ** Math.min(reconnectAttempt, 5)));
      reconnectAttempt += 1;
      console.warn(`[Connections] Realtime ${status}; retrying in ${delay}ms`);

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (cancelled) return;
        removeRealtimeChannels();
        setup();
      }, delay);
    };

    setup = async () => {
      console.log('[Connections] Provider setup', user?.id || 'signed out');
      if (!user?.id) {
        setConnections([]);
        optimisticConnectionsRef.current.clear();
        relationshipEventsChannelRef.current = null;
        setPendingInteractions([]);
        setSentInteractions([]);
        setCurrentUserId(null);
        currentUserIdRef.current = null;
        lastInboxVisitKeyRef.current = null;
        lastInboxVisitRef.current = 0;
        setLastInboxVisit(0);
        setIsLoading(false);
        return;
      }

      if (cancelled) return;

      currentUserIdRef.current = user.id;
      setCurrentUserId(user.id);

      if (!notificationSubscription) {
        notificationSubscription = Notifications.addNotificationReceivedListener((notification) => {
          const type = String(notification.request.content.data?.type || '').toUpperCase();
          if (type === 'FRIEND_REQUEST') {
            setUnseenNotificationCount(previousCount => previousCount + 1);
            fetchConnections(false);
          }
        });
      }

      console.log('[Connections] Opening realtime channel for', user.id);
      channel = supabase
        .channel(`friendships-rt-${user.id}`)
        .on('broadcast', { event: 'friend_accepted' }, ({ payload }) => {
          applyAcceptedConnection(payload);
          fetchConnections(false);
        })

        // NEW incoming request → instantly bump pendingInteractions
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'interactions',
          filter: `receiver_id=eq.${user.id}`,
        }, async (payload) => {
          const row = payload.new;
          if (row.status !== 'pending') return;
          const { data: profile } = await supabase
            .from('profiles').select('id, name, contact, username')
            .eq('id', row.sender_id).single();
          const item = {
            id: row.id, senderId: row.sender_id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            interactionType: row.interaction_type,
            zoneId: row.zone_id, createdAt: row.created_at,
          };
          setPendingInteractions(prev =>
            prev.some(p => p.id === row.id) ? prev : [item, ...prev]
          );
        })

        // Interaction updated (accepted / ignored) → remove from lists
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'interactions',
        }, (payload) => {
          const row = payload.new;
          if (row.receiver_id === user.id && row.status !== 'pending') {
            setPendingInteractions(prev => prev.filter(p => p.id !== row.id));
          }
          if (row.sender_id === user.id && row.status !== 'pending') {
            setSentInteractions(prev => prev.filter(s => s.id !== row.id));
          }
          if (row.status === 'accepted' && (row.sender_id === user.id || row.receiver_id === user.id)) {
            applyAcceptedConnection(row);
          }
          if (row.status !== 'pending') {
            fetchConnections(false);
          }
        })

        // Interaction deleted (cancel) → remove
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'interactions',
        }, (payload) => {
          const row = payload.old;
          if (row?.id) {
            setPendingInteractions(prev => prev.filter(p => p.id !== row.id));
            setSentInteractions(prev => prev.filter(s => s.id !== row.id));
          }
          // Reconcile from the server as well. This handles DELETE payloads
          // arriving without the old row under restrictive realtime policies.
          fetchConnections(false);
        })

        // New connection inserted → prepend
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
        }, async (payload) => {
          const row = payload.new;
          if (row.user1_id !== user.id && row.user2_id !== user.id) return;
          const partnerId = row.user1_id === user.id ? row.user2_id : row.user1_id;
          const { data: profile } = await supabase
            .from('profiles').select('id, name, contact, username, city, country')
            .eq('id', partnerId).single();
          const conn = {
            id: profile?.id, connectionId: row.id,
            name: profile?.name || 'Unknown',
            contact: profile?.contact || '',
            username: profile?.username || '',
            city: profile?.city || '',
            country: profile?.country || '',
            connectedAt: row.created_at,
          };
          optimisticConnectionsRef.current.delete(partnerId);
          setConnections(prev => {
            const existingIndex = prev.findIndex(c => c.connectionId === row.id || c.id === partnerId);
            if (existingIndex === -1) return [conn, ...prev];
            return prev.map((existing, index) => index === existingIndex ? conn : existing);
          });
        })

        // Connection removed → filter out
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'friendships',
        }, (payload) => {
          const row = payload.old;
          if (row.user1_id !== user.id && row.user2_id !== user.id) return;
          const partnerId = row.user1_id === user.id ? row.user2_id : row.user1_id;
          optimisticConnectionsRef.current.delete(partnerId);
          setConnections(prev => prev.filter(c => c.connectionId !== row.id && c.id !== partnerId));
        })

        .subscribe((status) => {
          databaseStatus = status;
          console.log(`[Connections] Database events: ${status}`);
          if (status === 'SUBSCRIBED') reconnectAttempt = 0;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            scheduleReconnect(status);
          }
        });
      relationshipEventsChannelRef.current = channel;

      if (!cancelled) await fetchConnections();
    };

    setup();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      fetchConnections(false);

      if (
        user?.id &&
        !cancelled &&
        databaseStatus !== 'SUBSCRIBED'
      ) {
        scheduleReconnect('RESUME');
      }
    });

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      removeRealtimeChannels();
      notificationSubscription?.remove();
      appStateSub.remove();
    };
  }, [applyAcceptedConnection, fetchConnections, user?.id]);

  // ── Accept an incoming interaction → creates a connection ────────────────
  const acceptInteraction = async (interactionId) => {
    // Optimistic: instantly remove from pending list
    setPendingInteractions(prev => prev.filter(p => p.id !== interactionId));
    try {
      // 1. Fetch the interaction details to get sender/receiver
      const { data: interaction, error: fetchError } = await supabase
        .from('interactions')
        .select('*')
        .eq('id', interactionId)
        .single();
        
      if (fetchError) throw fetchError;

      // 2. Update interaction status to accepted
      const { error: updateError } = await supabase
        .from('interactions')
        .update({ status: 'accepted' })
        .eq('id', interactionId);

      if (updateError) throw updateError;

      // 3. Attempt to manually create connection (fails silently if already exists via trigger)
      const { error: connError } = await supabase
        .from('friendships')
        .insert({
          user1_id: interaction.sender_id,
          user2_id: interaction.receiver_id
        });
        
      if (connError && connError.code !== '23505') {
         // ignore unique constraint violation (23505)
         console.warn('Manual connection insert error:', connError);
      }

      await relationshipEventsChannelRef.current?.send({
        type: 'broadcast',
        event: 'friend_accepted',
        payload: {
          id: interaction.id,
          sender_id: interaction.sender_id,
          receiver_id: interaction.receiver_id,
          updated_at: new Date().toISOString(),
        },
      });

      await fetchConnections(false);
      return true;
    } catch (error) {
      console.error('Error accepting interaction:', error);
      await fetchConnections(false); // rollback optimistic update
      Alert.alert('Error', 'Failed to accept. Please try again.');
      return false;
    }
  };

  // ── Decline an incoming interaction ──────────────────────────────────────
  const declineInteraction = async (interactionId) => {
    // Optimistic: instantly remove from pending list
    setPendingInteractions(prev => prev.filter(p => p.id !== interactionId));
    try {
      const { error } = await supabase
        .from('interactions')
        .update({ status: 'ignored' })
        .eq('id', interactionId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error declining interaction:', error);
      await fetchConnections(false); // rollback optimistic
      Alert.alert('Error', 'Failed to decline.');
      return false;
    }
  };

  // ── Cancel a sent interaction ────────────────────────────────────────────
  const cancelInteraction = async (interactionId) => {
    // Optimistic: instantly remove from sent
    setSentInteractions(prev => prev.filter(s => s.id !== interactionId));
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('No authenticated user');

      const { data: deletedInteraction, error } = await supabase
        .from('interactions')
        .delete()
        .eq('id', interactionId)
        .eq('sender_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!deletedInteraction) {
        throw new Error('Request was not deleted');
      }

      await fetchConnections(false);
      return true;
    } catch (error) {
      console.error('Error canceling interaction:', error);
      await fetchConnections(false); // rollback
      Alert.alert('Error', 'Failed to cancel request.');
      return false;
    }
  };

  // ── Send a friend request ─────────────────────────────────────────────────
  const sendInteraction = async (receiverId, interactionType = 'wave', zoneId = null) => {
    try {
      const normalizedInteractionType = interactionType === 'friend_request'
        ? 'wave'
        : interactionType;
      const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const uid = authenticatedUser?.id;
      if (!uid) {
        Alert.alert('Error', 'You must be logged in.');
        return false;
      }

      currentUserIdRef.current = uid;
      setCurrentUserId(uid);

      // Check if already connected or interaction already sent
      const { data: existing } = await supabase
        .from('interactions')
        .select('id, status')
        .eq('sender_id', uid)
        .eq('receiver_id', receiverId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        Alert.alert('Info', 'You already sent a friend request to this person.');
        return false;
      }

      // Use .select().single() so we get the new row back for optimistic update
      const { data: newRow, error } = await supabase
        .from('interactions')
        .insert({
          sender_id: uid,
          receiver_id: receiverId,
          interaction_type: normalizedInteractionType,
          zone_id: zoneId || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      const { data: receiverProfile, error: receiverProfileError } = await supabase
        .from('profiles')
        .select('name, contact, username, fcm_token, expo_push_token')
        .eq('id', receiverId)
        .maybeSingle();

      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('name, username')
        .eq('id', uid)
        .maybeSingle();

      if (receiverProfileError) {
        console.warn('Unable to load sent request profile:', receiverProfileError);
      }

      if (newRow) {
        setSentInteractions(prev =>
          prev.some(s => s.id === newRow.id) ? prev : [{
            id: newRow.id,
            receiverId,
            name: receiverProfile?.name || receiverProfile?.username || 'Connecti user',
            contact: receiverProfile?.contact || '',
            username: receiverProfile?.username || '',
            interactionType: normalizedInteractionType,
            zoneId: newRow.zone_id,
            createdAt: newRow.created_at,
          }, ...prev]
        );

        const senderName = senderProfile?.name || senderProfile?.username || authenticatedUser.user_metadata?.first_name || authenticatedUser.user_metadata?.name || 'Someone';
        const receiverToken = receiverProfile?.fcm_token || receiverProfile?.expo_push_token;
        if (receiverToken) {
          sendPushNotification({
            token: receiverToken,
            title: interactionType === 'hint' ? 'You received a private hint' : 'New friend request',
            body: `${senderName} wants to be your friend. Accept or decline in your inbox.`,
            data: {
              type: interactionType === 'hint' ? 'WAVE_HINT' : 'FRIEND_REQUEST',
              categoryId: interactionType === 'hint' ? 'MATCH_HINT' : 'FRIEND_REQUEST',
              interactionId: newRow.id,
              senderName,
            },
          }).catch(notificationError => {
            console.warn('[Connections] Could not notify receiver:', notificationError.message);
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Error sending interaction:', error);
      Alert.alert('Error', 'Failed to send. Please try again.');
      return false;
    }
  };

  // ── Remove a connection (unmatch) ────────────────────────────────────────
  const removeConnection = async (connectionId) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;
      await fetchConnections(false);
      return true;
    } catch (error) {
      console.error('Error removing connection:', error);
      Alert.alert('Error', 'Failed to remove connection.');
      return false;
    }
  };

  // ── Search users (profiles) ───────────────────────────────────────────────
  const searchUsers = useCallback(async (query) => {
    try {
      const normalizedQuery = query?.trim();
      if (!normalizedQuery) return [];

      // Do not depend on fetchConnections having completed. Search can be used
      // immediately after the screen opens, before the connections effect has
      // finished loading the current user.
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = user?.id || currentUserIdRef.current || currentUserId;
      if (!userId) return [];

      const pattern = `%${normalizedQuery}%`;

      // Query columns independently. Besides avoiding fragile PostgREST OR
      // expressions, this keeps search working for databases that still use
      // the documented `full_name` column instead of `name`.
      const searchColumn = async (column, selectColumn = column) => {
        const result = await supabase
          .from('profiles')
          .select(`id, ${selectColumn}`)
          .ilike(column, pattern)
          .neq('id', userId)
          .limit(20);
        if (result.error) throw result.error;
        return result.data || [];
      };
      const isMissingColumnError = (error) =>
        /column .* does not exist|schema cache/i.test(error?.message || '');
      const optionalSearchColumn = async (column) => {
        try {
          return await searchColumn(column);
        } catch (error) {
          // A partially migrated profiles table should not disable all search.
          if (isMissingColumnError(error)) return [];
          throw error;
        }
      };

      let nameResults;
      try {
        nameResults = await searchColumn('name');
      } catch (nameError) {
        // `full_name` is used by older/provisioned schemas.
        if (!isMissingColumnError(nameError)) {
          throw nameError;
        }
        nameResults = await optionalSearchColumn('full_name');
      }

      const [contactResults, usernameResults] = await Promise.all([
        optionalSearchColumn('contact'),
        optionalSearchColumn('username'),
      ]);

      const uniqueUsers = new Map();
      [...nameResults, ...contactResults, ...usernameResults].forEach(profile => {
        uniqueUsers.set(profile.id, {
          ...profile,
          // Normalize both supported schema names for the UI.
          name: profile.name || profile.full_name || '',
        });
      });

      // Annotate each user with connection status
      const usersWithStatus = await Promise.all(
        [...uniqueUsers.values()].slice(0, 20).map(async (u) => {
          // Check if already connected
          const { data: conn } = await supabase
            .from('friendships')
            .select('id')
            .or(`and(user1_id.eq.${userId},user2_id.eq.${u.id}),and(user1_id.eq.${u.id},user2_id.eq.${userId})`)
            .maybeSingle();

          // Check if interaction pending
          const { data: interaction } = await supabase
            .from('interactions')
            .select('id, sender_id, receiver_id, status')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${u.id}),and(sender_id.eq.${u.id},receiver_id.eq.${userId})`)
            .eq('status', 'pending')
            .maybeSingle();

          const isOutgoingPending = interaction?.sender_id === userId;

          return {
            ...u,
            is_friend: !!conn,
            friendship_status: conn
              ? 'accepted'
              : isOutgoingPending
                ? 'outgoing_pending'
                : interaction
                  ? 'incoming_pending'
                  : null,
            interaction_id: interaction?.id || null,
          };
        })
      );

      return usersWithStatus;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }, [currentUserId]);

  // unseenCount: requests arrived AFTER the last inbox visit
  const unseenCount = useMemo(() =>
    Math.max(
      pendingInteractions.filter(p => new Date(p.createdAt).getTime() > lastInboxVisit).length,
      unseenNotificationCount
    ),
    [pendingInteractions, lastInboxVisit, unseenNotificationCount]
  );

  // Call this when the user opens the Inbox — instantly clears badges
  const markInboxSeen = useCallback(async () => {
    const userId = currentUserIdRef.current;
    if (!userId) return;

    const now = Date.now();
    lastInboxVisitRef.current = now;
    setLastInboxVisit(now);
    setUnseenNotificationCount(0);
    await AsyncStorage.setItem(`inbox_last_visit_${userId}`, String(now));
  }, []);

  return {
    // Data
    friends: connections,
    connections,
    pendingRequests: pendingInteractions,
    pendingInteractions,
    sentRequests: sentInteractions,
    sentInteractions,
    isLoading,

    // Counts
    friendCount: connections.length,
    connectionCount: connections.length,
    pendingCount: pendingInteractions.length,
    unseenCount,               // ← badge: only unread since last inbox visit
    sentCount: sentInteractions.length,

    // Actions
    acceptFriendRequest: acceptInteraction,
    acceptInteraction,
    declineInteraction,
    cancelInteraction,
    sendInteraction,
    removeFriendship: removeConnection,
    removeConnection,
    searchUsers,
    markInboxSeen,             // ← call on Inbox focus to clear badges
    refreshFriendships: fetchConnections,
    refresh: fetchConnections,
  };
}

export function ConnectionsProvider({ children }) {
  const value = useConnectionsState();

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
}

export function useConnections() {
  const context = useContext(ConnectionsContext);

  if (!context) {
    throw new Error('useConnections must be used within a ConnectionsProvider');
  }

  return context;
}

// Re-export as useFriendships for backward compatibility with files that import it
export { useConnections as useFriendships };

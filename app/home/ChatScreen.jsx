// app/home/ChatScreen.jsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import { supabase } from  '../../lib/supabase'; // adjust path if needed

export default function ChatScreen({ route }) {
  // Expect route.params: { currentUserId, otherUserId, currentUserName, otherUserName }
  const { currentUserId, otherUserId, currentUserName, otherUserName } = route?.params || {};
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const toGifted = (row) => ({
    _id: row.id,
    text: row.content,
    createdAt: new Date(row.created_at),
    user: {
      _id: row.sender_id,
      name: row.sender_id === currentUserId ? currentUserName : otherUserName,
    },
  });

  // fetch recent messages (latest first)
  const fetchMessages = async () => {
    if (!currentUserId || !otherUserId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setMessages((data || []).map(toGifted));
    } catch (err) {
      console.warn('fetchMessages error', err);
    } finally {
      setLoading(false);
    }
  };

  // send message - optimistic update
  const onSend = useCallback(async (msgs = []) => {
    if (!msgs || msgs.length === 0) return;
    const m = msgs[0];
    setMessages(prev => GiftedChat.append(prev, m)); // optimistic
    try {
      await supabase.from('messages').insert([
        { sender_id: currentUserId, receiver_id: otherUserId, content: m.text }
      ]);
    } catch (err) {
      console.warn('send error', err);
      // Optionally, mark failed or refetch
    }
  }, [currentUserId, otherUserId]);

  useEffect(() => {
    fetchMessages();

    // subscribe to realtime inserts on messages table
    const channel = supabase
      .channel('public:messages') // name arbitrary
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const row = payload.new;
        // only append if message belongs to this chat
        if (
          (row.sender_id === currentUserId && row.receiver_id === otherUserId) ||
          (row.sender_id === otherUserId && row.receiver_id === currentUserId)
        ) {
          setMessages(prev => GiftedChat.append(prev, toGifted(row)));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel); // unsubscribe on unmount
    };
  }, [currentUserId, otherUserId]);

  if (loading) {
    return <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}><ActivityIndicator size="large" /></View>;
  }

  return (
    <GiftedChat
      messages={messages.sort((a,b) => b.createdAt - a.createdAt)}
      onSend={msgs => onSend(msgs)}
      user={{ _id: currentUserId, name: currentUserName }}
      showUserAvatar
      renderUsernameOnMessage
    />
  );
}

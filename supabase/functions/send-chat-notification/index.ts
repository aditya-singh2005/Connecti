// supabase/functions/send-chat-notification/index.ts
// Sends push via Expo Push API when a new chat message is inserted.
// Called from DB webhook on messages INSERT.
// @deno-types="npm:@supabase/supabase-js@2"
import { createClient } from '@supabase/supabase-js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

Deno.serve(async (req: Request) => {
  try {
    // Support both DB webhook (record) and direct API calls
    const payload = await req.json();
    const record = payload.record || payload;

    const {
      id: messageId,
      sender_id,
      receiver_id,
      content,
    } = record;

    if (!sender_id || !receiver_id || !content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get receiver profile (expo push token + notification preference)
    const { data: receiverProfile, error: receiverError } = await supabase
      .from('profiles')
      .select('expo_push_token, fcm_token, chat_notifications_enabled, name, username')
      .eq('id', receiver_id)
      .single();

    if (receiverError || !receiverProfile) {
      console.error('Receiver profile not found:', receiverError);
      return new Response(JSON.stringify({ error: 'Receiver not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure we send push regardless of the flag if they have a token (based on user request)
    const pushToken = receiverProfile.expo_push_token;
    if (!pushToken) {
      console.log('No push token for receiver:', receiver_id);
      return new Response(JSON.stringify({ message: 'No push token' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get sender name
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name, username')
      .eq('id', sender_id)
      .single();

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', receiver_id)
      .is('read_at', null);

    const senderFirst = senderProfile?.name
      ? senderProfile.name.trim().split(' ')[0]
      : senderProfile?.username || 'Someone';
    const senderFull = senderProfile?.name || senderProfile?.username || 'Someone';
    const preview = content.length > 100 ? content.substring(0, 97) + '...' : content;
    const badge = (unreadCount || 1) as number;

    // Build Expo push payload
    const expoPush = {
      to: pushToken,
      sound: 'default',
      title: `💬 ${senderFirst}`,
      body: preview,
      badge,
      priority: 'high',
      channelId: 'chat-messages',
      data: {
        type: 'chat_message',
        senderId: sender_id,
        senderName: senderFull,
        messageId,
        screen: 'ChatConversationScreen',
        timestamp: Date.now(),
      },
    };

    console.log('Sending push to:', pushToken.substring(0, 20) + '...');

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPush),
    });

    const result = await response.json();
    const status = result.data?.[0]?.status === 'ok' ? 'sent' : 'failed';
    const errMsg = result.data?.[0]?.message || result.errors?.[0]?.message;

    console.log(`Push ${status}:`, errMsg || 'ok');

    // Log result (best-effort — ignore table-not-found errors)
    try {
      await supabase.from('notification_logs').insert({
        user_id: receiver_id,
        message_id: messageId,
        notification_type: 'chat_message',
        status,
        error_message: errMsg,
      });
    } catch (_) { /* notification_logs table may not exist */ }

    return new Response(JSON.stringify({ success: true, status, result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Edge function error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
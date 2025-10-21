// supabase/functions/send-chat-notification/index.ts
// Deploy: supabase functions deploy send-chat-notification

// @deno-types="npm:@supabase/supabase-js@2"
import { createClient } from '@supabase/supabase-js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface NotificationPayload {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

interface ReceiverProfile {
  expo_push_token: string | null;
  chat_notifications_enabled: boolean | null;
  name: string | null;
  username: string | null;
}

interface SenderProfile {
  name: string | null;
  username: string | null;
}

interface ExpoResponseData {
  status?: string;
  message?: string;
}

interface ExpoError {
  message?: string;
}

interface ExpoResponse {
  data?: ExpoResponseData[];
  errors?: ExpoError[];
}

// Type declarations for Deno globals
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

Deno.serve(async (req: Request) => {
  try {
    // Parse the incoming webhook payload
    const payload: NotificationPayload = await req.json();
    
    console.log('📨 Received notification request:', payload);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get receiver's profile with push token and notification settings
    const { data: receiverProfile, error: receiverError } = await supabase
      .from('profiles')
      .select('expo_push_token, chat_notifications_enabled, name, username')
      .eq('id', payload.receiver_id)
      .single();

    if (receiverError || !receiverProfile) {
      console.error('❌ Receiver profile not found:', receiverError);
      return new Response(
        JSON.stringify({ error: 'Receiver not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typedReceiverProfile = receiverProfile as ReceiverProfile;

    // Check if notifications are enabled and push token exists
    if (!typedReceiverProfile.chat_notifications_enabled || !typedReceiverProfile.expo_push_token) {
      console.log('⚠️ Notifications disabled or no push token');
      return new Response(
        JSON.stringify({ message: 'Notifications disabled or no token' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get sender's profile
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name, username')
      .eq('id', payload.sender_id)
      .single();

    const typedSenderProfile = senderProfile as SenderProfile | null;

    // Get unread message count for sender
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', payload.sender_id)
      .eq('receiver_id', payload.receiver_id)
      .is('read_at', null);

    // Format sender name (first name only)
    const senderName = typedSenderProfile?.name 
      ? typedSenderProfile.name.trim().split(' ')[0]
      : typedSenderProfile?.username || 'Someone';

    const fullSenderName = typedSenderProfile?.name || typedSenderProfile?.username || 'Someone';

    // Truncate message if too long
    const messagePreview = payload.content.length > 100
      ? payload.content.substring(0, 97) + '...'
      : payload.content;

    const totalUnread = unreadCount || 1;

    // Prepare Expo push notification
    const expoPushMessage = {
      to: typedReceiverProfile.expo_push_token,
      sound: 'default' as const,
      title: `💬 ${senderName}`,
      body: messagePreview,
      subtitle: totalUnread > 1 ? `${totalUnread} new messages` : undefined,
      data: {
        type: 'chat_message',
        senderId: payload.sender_id,
        senderName: fullSenderName,
        messageId: payload.message_id,
        screen: 'ChatConversationScreen',
        timestamp: Date.now(),
      },
      badge: totalUnread,
      priority: 'high' as const,
      channelId: 'chat-messages',
    };

    console.log('📤 Sending push notification:', expoPushMessage);

    // Send push notification to Expo
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPushMessage),
    });

    const result = await response.json() as ExpoResponse;
    console.log('✅ Expo response:', result);

    // Log notification delivery
    const logStatus = result.data?.[0]?.status === 'ok' ? 'sent' : 'failed';
    const errorMessage = result.data?.[0]?.message || result.errors?.[0]?.message;

    await supabase
      .from('notification_logs')
      .insert({
        user_id: payload.receiver_id,
        message_id: payload.message_id,
        notification_type: 'chat_message',
        status: logStatus,
        error_message: errorMessage,
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        result,
        notification: expoPushMessage 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error sending notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
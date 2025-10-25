// supabase/functions/send-chat-notification/index.ts
// @deno-types="npm:@supabase/supabase-js@2"
import { createClient } from '@supabase/supabase-js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: string;
  table: string;
  record: {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    created_at: string;
  };
  schema: string;
  old_record: any;
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

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    
    console.log('📨 Received webhook payload:', payload);

    // Extract the actual message data from the record
    const { id: messageId, sender_id, receiver_id, content, created_at } = payload.record;

    console.log('📨 Extracted data:', { messageId, sender_id, receiver_id });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get receiver's profile
    const { data: receiverProfile, error: receiverError } = await supabase
      .from('profiles')
      .select('expo_push_token, chat_notifications_enabled, name, username')
      .eq('id', receiver_id)
      .single();

    if (receiverError || !receiverProfile) {
      console.error('❌ Receiver profile not found:', receiverError);
      return new Response(
        JSON.stringify({ error: 'Receiver not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typedReceiverProfile = receiverProfile as ReceiverProfile;

    // Check if notifications are enabled
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
      .eq('id', sender_id)
      .single();

    const typedSenderProfile = senderProfile as SenderProfile | null;

    // Get unread message count
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', sender_id)
      .eq('receiver_id', receiver_id)
      .is('read_at', null);

    // Format sender name
    const senderName = typedSenderProfile?.name 
      ? typedSenderProfile.name.trim().split(' ')[0]
      : typedSenderProfile?.username || 'Someone';

    const fullSenderName = typedSenderProfile?.name || typedSenderProfile?.username || 'Someone';

    // Truncate message
    const messagePreview = content.length > 100
      ? content.substring(0, 97) + '...'
      : content;

    const totalUnread = unreadCount || 1;

    // Prepare push notification
    const expoPushMessage = {
      to: typedReceiverProfile.expo_push_token,
      sound: 'default' as const,
      title: `💬 ${senderName}`,
      body: messagePreview,
      subtitle: totalUnread > 1 ? `${totalUnread} new messages` : undefined,
      data: {
        type: 'chat_message',
        senderId: sender_id,
        senderName: fullSenderName,
        messageId: messageId,
        screen: 'ChatConversationScreen',
        timestamp: Date.now(),
      },
      badge: totalUnread,
      priority: 'high' as const,
      channelId: 'chat-messages',
    };

    console.log('📤 Sending push notification:', expoPushMessage);

    // Send to Expo
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

    // Log notification
    const logStatus = result.data?.[0]?.status === 'ok' ? 'sent' : 'failed';
    const errorMessage = result.data?.[0]?.message || result.errors?.[0]?.message;

    await supabase
      .from('notification_logs')
      .insert({
        user_id: receiver_id,
        message_id: messageId,
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
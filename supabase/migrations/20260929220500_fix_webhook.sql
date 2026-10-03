-- Fix webhook parameter type
CREATE OR REPLACE FUNCTION public.notify_chat_message_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload jsonb;
  _url text;
  _anon_key text;
BEGIN
  _payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'messages',
    'schema', 'public',
    'record', jsonb_build_object(
      'id', NEW.id,
      'sender_id', NEW.sender_id,
      'receiver_id', NEW.receiver_id,
      'content', NEW.content,
      'created_at', NEW.created_at,
      'read_at', NEW.read_at
    ),
    'old_record', null
  );

  _url := 'https://qczxsjfkjpcvjbqvcqbc.supabase.co/functions/v1/send-chat-notification';

  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjenhzamZranBjdmpicXZjcWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4OTE1ODIsImV4cCI6MjA3MjQ2NzU4Mn0.B4LAlYkS4U1dYjph6QdexQmKFhIyBG69Dg6C3VmGeeY';

  -- FIX: body is passed as jsonb, not text
  PERFORM net.http_post(
    url     => _url,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body    => _payload
  );

  RETURN NEW;
END;
$$;

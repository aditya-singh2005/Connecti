-- ============================================================================
-- Create a Supabase DB webhook that calls the send-chat-notification
-- Edge Function whenever a new message is inserted.
-- This ensures push notifications fire even when the sender's app is closed.
-- ============================================================================

-- Enable pg_net extension (required for HTTP calls from triggers)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old webhook if it exists
DROP TRIGGER IF EXISTS on_new_chat_message ON public.messages;
DROP FUNCTION IF EXISTS public.notify_chat_message_webhook();

-- Create the webhook trigger function
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
  -- Build the full record payload (mimics Supabase realtime structure)
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

  -- Edge function URL — replace <project-ref> with your Supabase project ref
  _url := 'https://qczxsjfkjpcvjbqvcqbc.supabase.co/functions/v1/send-chat-notification';

  -- Use service role key stored as a DB setting or hardcode your anon key
  -- (edge function will use its own service role key from env)
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjenhzamZranBjdmpicXZjcWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4OTE1ODIsImV4cCI6MjA3MjQ2NzU4Mn0.B4LAlYkS4U1dYjph6QdexQmKFhIyBG69Dg6C3VmGeeY';

  -- Fire async HTTP POST (non-blocking — won't slow down inserts)
  PERFORM net.http_post(
    url     => _url,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body    => _payload::text
  );

  RETURN NEW;
END;
$$;

-- Attach trigger: fires AFTER every INSERT on messages
CREATE TRIGGER on_new_chat_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message_webhook();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.notify_chat_message_webhook() TO postgres, service_role;

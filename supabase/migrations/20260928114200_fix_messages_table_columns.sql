-- ============================================================================
-- Fix messages table: add receiver_id, read_at columns if missing
-- The table already exists from a previous migration but lacks these columns
-- ============================================================================

-- Step 1: Add receiver_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'receiver_id'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 2: Add read_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN read_at timestamptz;
  END IF;
END $$;

-- Step 3: Add content column if it doesn't exist (might be named differently)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN content text;
  END IF;
END $$;

-- Step 4: Indexes for conversation queries
CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_conversation_reverse_idx
  ON public.messages (receiver_id, sender_id, created_at DESC);

-- Step 5: RLS policies
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;
CREATE POLICY "Users can read own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can insert own messages" ON public.messages;
CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update received messages" ON public.messages;
CREATE POLICY "Users can update received messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

-- Step 6: Enable realtime (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- ============================================================================
-- Create messages table for direct chat between two users
-- Safe version: uses IF NOT EXISTS throughout, no indexes here (added in next migration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);


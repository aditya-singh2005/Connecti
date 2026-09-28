-- Drop the restrictive check constraint on interaction_type 
-- so that 'mutual_discovery' is allowed.
-- This was causing the upsert_mutual_discovery_pair function to fail.

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;

SELECT 'CONSTRAINT_DROPPED' as status;

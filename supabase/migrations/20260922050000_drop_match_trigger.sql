-- Drop the trigger that runs matching inside the wave update transaction.
-- We will now trigger matching asynchronously from the client via RPC
-- AFTER the wave write is fully committed, to guarantee 100% isolation.

DROP TRIGGER IF EXISTS match_active_waves_on_presence ON public.active_zone_users;

-- Also drop the friendship trigger for the same reason (can be triggered asynchronously if needed in the future, or left dropped as matching happens on wave)
DROP TRIGGER IF EXISTS match_active_waves_on_friendship ON public.friendships;

SELECT 'TRIGGERS_DROPPED' as status;

-- Drop the status check constraint that blocks 'SHOWN_HINTS' from being inserted.
ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_status_check;

-- Now immediately re-trigger matching for all waving users
DO $$
DECLARE u record;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
    FROM public.active_zone_users
    WHERE open_to_wave = true AND last_updated > now() - interval '30 minutes'
  LOOP
    BEGIN
      PERFORM public.match_active_waves_for_user(u.user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[retrigger] User % failed: %', u.user_id, SQLERRM;
    END;
  END LOOP;
END $$;

SELECT 'STATUS_CHECK_DROPPED_AND_RETRIGGERED' AS status;

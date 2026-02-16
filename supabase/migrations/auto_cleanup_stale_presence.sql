-- ============================================================================
-- AUTO-CLEANUP SYSTEM FOR STALE PRESENCE RECORDS
-- ============================================================================
-- This migration implements automatic cleanup of stale records in active_zone_users
-- Records older than 30 minutes are automatically removed
-- If user is still in the same zone after 30 mins, timer is refreshed but open_to_wave is reset

-- ============================================================================
-- 1. CLEANUP FUNCTION - Removes stale records and resets open_to_wave
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_stale_presence_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stale_threshold TIMESTAMP;
    affected_rows INTEGER;
BEGIN
    -- Calculate threshold: 30 minutes ago
    stale_threshold := NOW() - INTERVAL '30 minutes';
    
    -- Log cleanup start
    RAISE NOTICE 'Starting cleanup of records older than %', stale_threshold;
    
    -- Delete all records older than 30 minutes
    -- This handles the case where user left the zone or app is closed
    DELETE FROM active_zone_users
    WHERE last_seen < stale_threshold;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Removed % stale presence records', affected_rows;
    
    -- For users still in zones but timer expired (last_seen between 29-30 mins ago)
    -- Reset their open_to_wave to false and refresh their last_seen
    UPDATE active_zone_users
    SET 
        open_to_wave = false,
        last_seen = NOW()
    WHERE 
        last_seen < NOW() - INTERVAL '29 minutes'
        AND last_seen >= stale_threshold
        AND open_to_wave = true;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Reset open_to_wave for % active users with expired timers', affected_rows;
    
END;
$$;

-- ============================================================================
-- 2. SCHEDULED JOB - Run cleanup every minute using pg_cron
-- ============================================================================
-- Note: pg_cron extension must be enabled in Supabase
-- This can be done via Supabase Dashboard > Database > Extensions

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup job to run every minute
-- This ensures stale records are removed promptly
SELECT cron.schedule(
    'cleanup-stale-presence',           -- Job name
    '* * * * *',                        -- Every minute (cron format)
    $$SELECT cleanup_stale_presence_records();$$
);

-- ============================================================================
-- 3. MANUAL TRIGGER OPTION - Can be called manually if needed
-- ============================================================================
-- You can manually trigger cleanup by running:
-- SELECT cleanup_stale_presence_records();

-- ============================================================================
-- 4. MONITORING QUERY - Check for stale records
-- ============================================================================
-- Use this query to monitor stale records:
-- SELECT 
--     user_id, 
--     zone_name, 
--     open_to_wave,
--     last_seen,
--     NOW() - last_seen as age
-- FROM active_zone_users
-- WHERE last_seen < NOW() - INTERVAL '30 minutes'
-- ORDER BY last_seen DESC;

-- ============================================================================
-- 5. VIEW SCHEDULED JOBS
-- ============================================================================
-- To view all scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule this job (if needed):
-- SELECT cron.unschedule('cleanup-stale-presence');

COMMENT ON FUNCTION cleanup_stale_presence_records() IS 
'Automatically removes presence records older than 30 minutes and resets open_to_wave for users still in zones with expired timers';

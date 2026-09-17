# Performance Considerations

Given its reliance on real-time location and background processing, Connecti must carefully manage performance and battery consumption.

## Geofencing & Battery Life
- **Passive vs. Active Tracking**: The app uses OS-level geofencing (Google Play Services Location API on Android). This is significantly more battery-efficient than active GPS polling. The OS wakes up the app only when a geofence boundary is crossed.
- **AlarmManager Polling**: In scenarios where geofencing boundaries fail, the native module uses an `AlarmManager` to perform periodic polling (currently configured to 10-second intervals for testing, but must be drastically increased for production to avoid battery drain).

## Database Polling & Throttling
- The JS frontend may poll the `active_zone_users` table to refresh the list of users in the current zone. 
- **Optimization**: We should avoid heavy long-polling. Moving towards Supabase Realtime (WebSockets) for zone updates is recommended over HTTP polling to reduce overhead.

## API Limits
- **Upserts**: Geofence `ENTER` events trigger upserts to the `active_zone_users` table. Rapidly entering and exiting zones could cause a spike in writes. Debouncing these events in the native layer is crucial.
- **Push Notifications**: FCM is used to wake up the app and notify users. Batching these notifications on the backend (Supabase Edge Functions) helps prevent spamming the client and hitting FCM limits.

## State Management
- `AsyncStorage` is heavily utilized for caching (e.g., `user_zone_suppressions`, `wave_timer_expiry`). 
- **Optimization**: By caching the suppressions locally, the app avoids round-trips to the database to check if a zone has been marked as "Later".

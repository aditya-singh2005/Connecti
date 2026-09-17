# Security

Connecti relies on Supabase for securing user data and maintaining authorization.

## Authentication
- **Supabase Auth**: Users authenticate using their email and password. Session tokens are managed automatically by the Supabase JS client and persisted securely on the device.
- **Session Restoration**: On app launch, `app/index.jsx` checks for a valid session before directing the user to the `home` screens or the `login` screen.

## Database Security (Row Level Security)
Row Level Security (RLS) in PostgreSQL is critical to Connecti's security model. It ensures that a compromised client cannot read or modify data belonging to other users.

- **Profiles**: 
  - Users can read all profiles (required for matching).
  - Users can ONLY update their own row in the `profiles` table.
- **Active Zone Users**:
  - Insert/Update: Users can only upsert records where `user_id` matches `auth.uid()`.
  - Read: Users can query the `active_zone_users` table to see who is in the zone. 
- **Notification Logs (Matches/Waves)**:
  - Users can only query logs where their `auth.uid()` matches either `user1_id` or `user2_id`.

## Native Module Security
The Android native geofencing module needs to update the database when the app is in the background or killed. 
- To do this, the Javascript layer passes the Supabase URL, Anon Key, and the User's ID (`auth.uid()`) to the native module via `storeSupabaseCreds`.
- These are stored securely in Android `SharedPreferences`. The native code uses these to construct REST API requests to Supabase.

## Data Privacy
- Location coordinates (`latitude`, `longitude`) in the `active_zone_users` table are highly ephemeral. They are updated on entry and explicitly deleted when the user leaves the geofence or their 30-minute "Wave" timer expires.
- Contact information (phone numbers) in the `profiles` table should not be exposed to other users until a mutual connection/reveal occurs.

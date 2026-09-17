# Database Architecture

Connecti uses **Supabase** (PostgreSQL) as its primary backend. Below are the core tables driving the application logic for our feature-by-feature Native Android rebuild.

## Tables

### `profiles`
Stores user profile information. Linked to Supabase Auth.
- `id` (UUID): Primary key, references `auth.users.id`.
- `username`, `full_name`, `email`, `contact`, `dob`.
- `created_at` (Timestamp).

### `geofence_zones`
Defines the physical boundaries where interactions can happen.
- `id` (UUID): Primary key.
- `name` (Text): Friendly name of the zone.
- `latitude`, `longitude` (Float): Center coordinate.
- `radius` (Float): Size in meters.

### `active_zone_users`
Tracks real-time presence of users within zones (ephemeral).
- `user_id` (UUID): References `profiles.id`.
- `zone_id` (UUID): References `geofence_zones.id`.
- `open_to_wave` (Boolean): Active matching status.
- `fcm_token` (Text): For direct push notifications.
- `last_updated` (Timestamp).

### `interactions`
Tracks asymmetric actions ('wave', 'hint', 'decline') between users in a zone. Replaces the legacy wave logs.
- `id` (UUID): Primary key.
- `sender_id`, `receiver_id` (UUID): References `profiles.id`.
- `zone_id` (UUID): References `geofence_zones.id`.
- `interaction_type` (Text): 'wave', 'hint', 'decline'.
- `status` (Text): 'pending', 'accepted', 'ignored'.

### `connections`
Tracks mutual matches when two users accept an interaction.
- `id` (UUID): Primary key.
- `user1_id`, `user2_id` (UUID): References `profiles.id`.
- `zone_id` (UUID): References `geofence_zones.id`.

### `messages`
Facilitates real-time chat between connected users.
- `id` (UUID): Primary key.
- `connection_id` (UUID): References `connections.id`.
- `sender_id` (UUID): References `profiles.id`.
- `content` (Text).

## Row Level Security (RLS)
- Users can edit their own `profiles`.
- Users can see their own `interactions` and `connections`.
- Users can only read/write `messages` within their active `connections`.

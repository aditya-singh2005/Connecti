# Feature: Blocking

The Blocking feature ensures user safety and privacy by allowing users to prevent specific individuals from seeing them or interacting with them.

## Logic Flow
1. **Action**: A user selects "Block" from another user's profile view.
2. **Database Update**: The block action is recorded in a dedicated table (e.g., `user_blocks`) linking the `blocker_id` and the `blocked_id`.
3. **Filtering**: 
   - When querying the `active_zone_users` table to display users in a zone, the database (or the client via RLS) filters out any users who have blocked the requesting user, or whom the requesting user has blocked.
4. **Unblocking**: Users can manage their block list from settings to unblock users.

*Note: The explicit table schema for blocking should be added to `DATABASE.md` once finalized in the Supabase schema.*
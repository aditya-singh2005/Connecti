# Feature: Connections

Connections are formed when two users exhibit mutual interest, typically via the `interactions` table.

## Logic Flow
1. **Mutual Interest**: When User B accepts an interaction from User A (e.g., a "Wave"), the interaction status changes to `accepted`.
2. **Persistence**: A trigger or Edge Function automatically creates a record in the `connections` table, ensuring the connection survives even after users leave the geofence zone.
3. **Capabilities**: Connected users gain access to:
   - Direct messaging/chat capabilities via the `messages` table.
   - Viewing the full profile of the connected user (the "Reveal" feature).
4. **Severing**: Connections can be severed if a user unmatches or blocks the other user, which removes or disables the `connections` record.

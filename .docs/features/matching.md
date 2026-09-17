# Feature: Matching

The Matching system determines how users indicate interest and how the system pairs them up, utilizing the new `interactions` and `connections` tables.

## Interaction Types
- **Wave**: A direct indication of interest from User A to User B.
- **Hint**: An anonymous or subtle ping.

## The Matching Process
1. **User Action**: User A sends a Wave to User B in their zone.
2. **Database Logging**: A record is created in the `interactions` table with `sender_id = A`, `receiver_id = B`, `interaction_type = 'wave'`, and `status = pending`.
3. **Notification**: User B receives a Push Notification (via FCM / Supabase Edge Functions) that they received a Wave.
4. **Response**: 
   - User B can **Accept** (Wave back). The `interactions` status updates to `accepted`.
   - User B can **Decline** (Pass). The `interactions` status updates to `ignored` or a new decline interaction is logged.
5. **Connection**: If User B accepts, a record is automatically created in the `connections` table. Both users are notified of the mutual match.
6. **Chat**: Once a `connections` record exists, they can message each other via the `messages` table.

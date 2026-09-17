# Feature: Notifications

Notifications are critical for a real-time, location-based app. Connecti uses Firebase Cloud Messaging (FCM) natively on Android.

## Token Management
- **Registration**: On app launch, the Firebase SDK generates a device token.
- **Syncing**: These tokens are synced to the user's row in `active_zone_users` upon entering a Geofence.

## Scenarios
1. **Zone Entry**: A local Android notification (`NotificationManager`) fires when a user enters a geofence.
2. **Receiving a Wave**: When User A waves at User B, a Supabase Edge Function sends an FCM payload to User B's token.
3. **Match Notification**: When an interaction is accepted and a connection is formed, both users receive a "New Match" notification.

## Notification Handling (Native Android)
- **Foreground**: If the app is open, the FCM message is caught by `FirebaseMessagingService` and triggers in-app UI alerts or Compose state updates.
- **Background/Killed**: If the app is closed, tapping the notification opens the app via a `PendingIntent`. The `MainActivity`'s initialization logic checks for intent extras and routes the user directly to the relevant screen (e.g., Match or Chat screen) using Jetpack Navigation.

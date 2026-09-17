# Connecti App Architecture

Connecti uses a **Native Android** architecture, built with Kotlin and Jetpack Compose. This architectural pivot from cross-platform ensures maximum reliability for critical background location services and geofencing APIs.

## System Components

### 1. Frontend (Native Android)
- **Language**: Kotlin.
- **UI Toolkit**: Jetpack Compose for declarative and modern UI.
- **Architecture Pattern**: MVVM (Model-View-ViewModel) with Kotlin Coroutines and Flows for state management.
- **Local Persistence**: Room Database / DataStore for caching state (e.g., current zone, user session).

### 2. Backend (Supabase)
- Connecti relies on Supabase for the entire backend layer:
  - **Auth**: Email and Password authentication.
  - **Database**: PostgreSQL (see `DATABASE.md`).
  - **Realtime**: Supabase Realtime subscriptions for instant interactions and chat updates.

### 3. Background Services & Geofencing
To ensure the app can detect geofence entries even when killed or in the background, Connecti relies on robust native Android features:
- **Foreground Services**: Used when the user is actively "Open to Wave" to ensure continuous location tracking and system priority.
- **Geofencing API (Google Play Services)**: Handles the low-power monitoring of zone boundaries.
- **BroadcastReceivers**: Intercepts geofence transition events when the app is in the background or killed state.
- **WorkManager**: Handles syncing state to Supabase when the app wakes up from a transition event.

### 4. Push Notifications (FCM)
- **Firebase Cloud Messaging (FCM)**: Handles direct device-to-device push notifications via Supabase Edge Functions.
- Tokens are stored in the `active_zone_users` table for rapid delivery.

## Data Flow (Geofence Entry)
1. User physically enters a zone.
2. Native Android Geofencing API detects the transition via a `PendingIntent`.
3. A `BroadcastReceiver` wakes up, delegating the network call to a `CoroutineWorker` (WorkManager).
4. The worker updates the `active_zone_users` table in Supabase directly via the REST API.
5. A local notification is fired alerting the user they entered a zone.

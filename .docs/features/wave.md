# Connecti Phase Implementation Specification

## Global Runtime Requirement

This phase is part of the Connecti Android application and must work correctly in all three runtime states:

1. **Foreground** — app is open and active.
2. **Background** — app is not currently visible but the OS is allowing background execution/notifications.
3. **Killed / not in recent apps** — the app process is not running. Server-side events must still be able to reach the user through push notifications, and tapping a notification must cold-start the app into the correct phase.

The implementation must NOT assume that the React/UI process is alive.

### Runtime principles
- Android-native background capabilities, geofencing, and FCM/push notifications should be used where appropriate.
- Never implement continuous GPS polling just to keep Connecti alive.
- Important state is server-authoritative and must be recoverable after a cold start.
- On app launch/resume, fetch the current server state rather than trusting stale local UI state.
- Notifications must contain enough safe routing/context for the app to open the relevant phase, but must never expose another person's exact location.
- Every operation must be idempotent where duplicate background callbacks, notification deliveries, or user taps are possible.
- Handle network loss, delayed callbacks, duplicate callbacks, app restarts, expired state, and stale notifications.
- Do not depend on a notification being tapped for the backend state transition.

# Phase 1 — Wave

## Purpose

Wave is the first active phase of Connecti. It means:

> “I am in this Connecti Zone and I am open to reconnecting with an existing Connecti friend who is participating in the same zone.”

Connecti is for reconnecting with people the user already knows. Wave must never become a stranger-discovery or continuous-location-sharing mechanism.

## Preconditions

A user may start/refresh a Wave only when:
- authenticated;
- onboarding/profile requirements are complete;
- location/geofencing capability is available;
- the user is inside a valid predefined Connecti Zone;
- there is no incompatible active reconnection/session state;
- the account is not blocked/restricted from proximity functionality.

## Connecti Zones

A Connecti Zone is a predefined server-managed geographic area such as:
- metro station;
- college;
- office;
- café;
- mall;
- conference;
- hackathon.

The client must identify the current zone through the approved geofence/zone mechanism. Do not expose exact coordinates, exact distance to another user, or live movement.

## Wave duration

A Wave lasts **30 minutes**.

The server owns:
- `started_at`;
- `expires_at`;
- active/inactive status;
- the zone associated with the Wave.

The client may display a countdown, but the countdown is informational. The backend decides whether the Wave is still active.

## Critical zone-change behavior

A user's Wave is tied to the **current Connecti Zone**.

### Case A — User already has an active Wave and enters a different Connecti Zone

If the user moves from Zone A to Zone B while their Wave is active:

1. Detect the new Connecti Zone using the Android geofencing/background mechanism.
2. Compare the new zone ID with the zone ID stored on the user's current Wave.
3. If it is genuinely a different zone:
   - automatically refresh the Wave for the new zone;
   - update the existing/current Wave record so it references the new zone;
   - reset the Wave timer to a fresh **30 minutes starting from the zone transition/refresh**;
   - update `started_at` and `expires_at`;
   - immediately make the user eligible for matching/reconnection in the new zone;
   - stop using the old zone for matching.
4. The user must NOT have to manually cancel the old Wave first.
5. The transition must be idempotent so duplicate geofence events cannot create multiple active Waves or reset the timer repeatedly for the same zone event.

Example:

```text
10:00  User enters Zone A
10:01  Wave starts -> expires 10:31

10:15  User enters Zone B
       -> Wave is automatically refreshed
       -> current zone = Zone B
       -> new expiry = 10:45
       -> matching now happens in Zone B
```

If the user later enters Zone C, the same rule applies: refresh to Zone C for another 30 minutes.

### Case B — User has no active Wave and enters a new Connecti Zone

When a user enters a Connecti Zone and does not currently have an active Wave:

- show/trigger a user prompt asking whether they want to Wave in this zone;
- this must work even if the app is in background or killed by using an appropriate push notification/background pathway;
- do not silently opt the user into a Wave unless a previously defined product rule explicitly grants consent;
- the prompt should identify the zone by its safe public name, not coordinates.

Example:

```text
You're at Connaught Place
Want to Wave here for 30 minutes?

[ Start Wave ] [ Not Now ]
```

If the user selects **Start Wave**, create/activate the Wave for that zone.

If the user selects **Not Now**, do not activate a Wave.

Repeated geofence callbacks for the same zone must not repeatedly spam the user. Use server-side/client-side cooldown or zone-entry deduplication.

## Wave state machine

```text
NO_WAVE
   |
   | user starts in current zone
   v
STARTING
   |
   v
ACTIVE
   |
   +---- user enters different zone ----> ACTIVE (new zone, fresh 30 min)
   |
   +---- user cancels ------------------> CANCELLED
   |
   +---- timer expires -----------------> EXPIRED
```

The zone-refresh transition is not a second independent Wave for matching purposes. There must be one authoritative current participation state.

## Matching eligibility

A Wave alone does not reveal anyone.

A potential reconnection requires:
- both users are accepted Connecti friends;
- both are eligible for proximity;
- neither has blocked the other;
- both have valid active participation;
- both are associated with the same current Connecti Zone;
- both are in compatible active sessions;
- cooldown/anti-abuse rules pass;
- no existing terminated/expired reconnection prevents the attempt.

## Foreground / background / killed behavior

### Foreground
- Zone entry is detected.
- If no Wave exists, show the Wave prompt.
- If an active Wave exists and zone changes, refresh to the new zone and update the UI immediately.
- Show the 30-minute countdown.

### Background
- Android geofencing/background event detects zone entry/transition.
- Server/state update happens without requiring the main UI to be open.
- If user consent is required for a new Wave, send a push notification/prompt.
- Do not run continuous GPS.

### Killed
- Geofence/background mechanisms must still be configured as supported by Android.
- A server-triggered notification can prompt the user.
- When the user taps the notification, cold-start the app and fetch authoritative current Wave/zone state.
- Never assume the old in-memory state exists.

## Cancellation

Cancel Wave is server-authoritative and idempotent.

After cancellation:
- the Wave is inactive;
- matching eligibility from that Wave ends;
- pending matching work must revalidate state;
- duplicate cancel requests are safe.

## Security

The Android client must never be trusted to decide:
- current zone eligibility;
- Wave expiry;
- matching eligibility;
- another user's presence;
- reward eligibility.

Never put Supabase service-role credentials in the app.

## Acceptance criteria

- Wave lasts exactly 30 server-controlled minutes.
- Entering a different Connecti Zone while waved automatically refreshes the Wave to that zone for 30 minutes.
- The current Wave record/state references the new zone.
- Matching immediately uses the new zone.
- Entering a zone with no active Wave produces a consent prompt.
- Duplicate geofence events do not create duplicate Waves or repeatedly reset the timer.
- Foreground, background, and killed states are supported.
- Cold-start always reconciles with server state.
- No continuous GPS tracking is used.

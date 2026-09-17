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

# Phase 2 — Show Hint

## Purpose

Show Hint is the recognition step between a valid match and identity reveal.

It tells the user:

> “Someone you already know may be here.”

without immediately exposing the person's identity.

## Preconditions

A Hint may be shown only when:
- a valid Match exists;
- both participants are accepted Connecti friends;
- neither has blocked the other;
- the relevant Wave/session is valid;
- the reconnection has not expired or been cancelled;
- server-side eligibility is still valid at the moment of access.

## Hint content

Possible safe contextual information:
- shared school;
- shared college;
- shared workplace;
- approximate last-met context;
- limited approved profile context such as gender where product settings permit;
- the fact that both users chose to participate in the same Connecti Zone.

Example:

```text
Someone you know may be here.

You both studied at Delhi Technological University.
Last met: More than a year ago.
You both chose to participate in this Connecti Zone.

[ Continue ] [ Not Now ]
```

Do NOT expose:
- exact location;
- exact distance;
- live movement;
- phone number;
- private contact information;
- hidden/private profile fields;
- exact timestamp/location history.

## State machine

```text
HIDDEN
   |
   v
AVAILABLE
   |
   +---- Not Now --------> DISMISSED
   |
   +---- Continue --------> REVEAL_PENDING
```

`Continue` must cause a fresh server-side validation before Reveal can proceed.

`Not Now` stops progression and does not reveal identity.

## Foreground / background / killed

### Foreground
Display the Hint screen normally and revalidate state before Continue.

### Background
A safe notification may inform the user that a Connecti reconnection is available. Do not put sensitive identity information in notification text.

### Killed
FCM/push notification must be capable of bringing the user back into the Hint phase. On cold start:
1. authenticate/restore session;
2. fetch the active reconnection;
3. verify that the Match/Hint is still valid;
4. open Hint or show the appropriate expired/ended state.

Never trust a stale notification as proof that the Match still exists.

## Backend authority

The backend generates/approves the Hint payload. The client cannot construct arbitrary hint claims and submit them as trusted data.

## Edge cases

Handle:
- Match expires while Hint is open;
- other participant cancels;
- block occurs;
- user taps an old notification;
- duplicate Continue requests;
- network timeout;
- app killed between Hint and Continue.

## Acceptance criteria

- No identity is leaked before Reveal.
- Continue always revalidates server state.
- Not Now prevents progression.
- Hint notifications work across foreground/background/killed states.
- Stale notifications never bypass server validation.

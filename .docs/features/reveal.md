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

# Phase 3 — Reveal

## Purpose

Reveal is the identity-confirmation stage. It is the moment when the two matched Connecti friends are allowed to see who is on the other side.

## Preconditions

Reveal requires:
- accepted Connecti friendship;
- valid Match;
- no block;
- valid Wave/session;
- Hint progression completed;
- reconnection not cancelled/expired;
- any required mutual reveal condition has been satisfied.

The server, not the client, owns the reveal transition.

## Mutual reveal

Identity should not be exposed prematurely.

The backend must maintain an explicit mutual reveal state. Only when **both participants have completed the required Reveal action** should the reconnection transition to the fully revealed state.

Example:

```text
User A -> Continue
User B -> Continue

Server verifies both
        |
        v
Both revealed
        |
        +--> server sends notification to A
        |
        +--> server sends notification to B
```

The client must never simply set `revealed = true` locally.

## Simultaneous reveal notification — critical product behavior

When both users have revealed, the server must trigger notifications to **both users at essentially the same event/time**.

This notification is a core Connecti moment.

The goal is for both users to experience:

> “You found each other.”

at the same time and immediately discover who is on the other side.

### Notification behavior

The server should:
1. atomically transition the reconnection to the revealed state;
2. record the reveal completion event;
3. issue push notification jobs for both participants;
4. make both notifications refer to the same reconnection/reveal event;
5. ensure duplicate delivery does not create duplicate rewards or state transitions.

Notification text must be safe and should reveal only the identity that the product has now authorized.

Example:

```text
You found each other! 🎉
Rahul is here to reconnect with you.
```

The exact notification wording is a UI/content decision, but it should make the reveal immediately understandable.

### Important timing requirement

“Same time” means the **server creates the reveal event once and fan-outs the notification to both users from that same event**, rather than one client notifying the other.

Do not rely on device clocks to determine whether reveal happened simultaneously.

FCM/device/network delivery can have unavoidable small delivery differences. The implementation should nevertheless originate both notifications from the same server-side reveal event.

## After Reveal

Once Reveal is completed, both users independently receive the Reconnect experience.

They can:
- cancel the reconnection;
- open Chat;
- open/prepare BLE verification for 2× eligible rewards;
- access the partner offer/reward information.

The Reconnect phase is specified in `reconnect.md`.

## Reveal reward — Connecti Coins

Immediately after the reveal is successfully completed for both users:

- **both users individually receive Connecti Coins**;
- each user's coin grant is recorded independently in the server-authoritative coin ledger;
- the reward must be idempotent;
- duplicate notification delivery or repeated app opening must never grant coins twice.

The exact base coin amount is configurable by backend/product configuration and should not be hardcoded into UI logic.

Conceptually:

```text
Both reveal
   |
   +--> User A + base Connecti Coins
   |
   +--> User B + base Connecti Coins
```

## BLE and 2× rewards

If the two users physically reconnect and complete valid BLE verification:

```text
Reveal completed
      |
      v
Reconnect
      |
      v
BLE verification
      |
      v
Server validates physical proximity/session
      |
      v
Eligible reward becomes 2×
```

BLE verification must be server-authorized.

The client cannot simply set:
```text
ble_verified = true
reward_multiplier = 2
```

The backend must validate:
- correct participants;
- correct active reconnection;
- valid BLE exchange/verification evidence;
- replay/duplicate protection;
- timing/session constraints;
- reward not already multiplied;
- anti-abuse rules.

If BLE is not completed, the normal base reward remains.

If BLE succeeds, the eligible reward is multiplied according to the configured 2× rule.

## Foreground / background / killed

### Foreground
- When both reveal, both screens update and both users receive the reveal notification.
- Opening the notification or seeing the in-app state should immediately show the identity and Reconnect options.

### Background
- Both devices receive FCM notification.
- Tapping it opens the revealed Reconnect state.
- Backend state remains authoritative even if delivery is delayed.

### Killed
- FCM notification must cold-start the app.
- On cold start, fetch the current reconnection state.
- If reveal is complete, open Reconnect with the correct revealed identity.
- Never depend on in-memory navigation state.

## Cancellation before Reveal

Either participant may terminate the reconnection before Reveal.

The other participant must receive only neutral wording such as:

```text
This reconnection is no longer available.
```

Never reveal who cancelled.

## Idempotency and race conditions

If both users press Continue at nearly the same time:
- backend must resolve one valid reveal transition;
- both users get the same reveal event;
- notifications/rewards are not duplicated.

If a cancellation races with Reveal:
- backend transaction/order determines the final legal state;
- no client may bypass the server state machine.

## Acceptance criteria

- Both participants must satisfy the required reveal condition.
- One server-side reveal event drives both notifications.
- Both users receive the reveal notification from the same server event.
- Both users receive individual base Connecti Coins once.
- BLE can upgrade the eligible reward to 2× only after server validation.
- Foreground/background/killed states all recover correctly.
- Reveal identity is not exposed before the mutual reveal condition.

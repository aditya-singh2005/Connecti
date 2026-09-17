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

# Phase 4 — Reconnect

## Purpose

Reconnect is the main post-Reveal interaction screen.

It should make the reconnection feel complete while giving both users immediate options:

- see the person they found;
- see a partner café/restaurant/experience offer;
- see their reward;
- see Connecti Coins earned;
- Chat;
- optional BLE verification for 2× eligible rewards;
- critically, **Cancel Reconnection**.

## Conceptual screen

```text
RECONNECTED! 🎉

[User Photo]
Rahul
You found each other.

-------------------------
☕ SPECIAL OFFER
20% off at Partner Cafe
Valid today
Minimum spend ₹500
[ View Offer ]
-------------------------

🎁 YOUR REWARD
Base reward / eligible reward

🪙 CONNECTI COINS
+100 Coins

💬 [ Chat ]

🟦 [ Verify with BLE ]
    Earn 2× eligible reward

-------------------------
[ CANCEL RECONNECTION ]
-------------------------
```

The exact visual design may evolve, but these functions must remain represented.

## Partner offer

The offer can contain:
- partner merchant name;
- discount/benefit;
- validity;
- minimum spend;
- terms;
- location/address;
- redemption instructions.

Customer pays the merchant directly using the merchant's accepted payment method (for example UPI/card/cash).

Connecti validates the offer/redemption according to the server-side merchant system.

Do not let the Android client decide that an offer is valid or redeemed.

## Connecti Coins

After Reveal, both users receive their individual base Connecti Coin reward.

The displayed balance must come from the server-authoritative ledger.

Do not increment the balance only in local UI.

Each grant should have:
- user;
- reconnection/session;
- reward type;
- amount;
- unique idempotency/event key;
- timestamp;
- reason.

Duplicate requests must not create duplicate grants.

## BLE — 2× reward

BLE is optional.

A user can choose to verify that the two participants physically met.

Conceptual flow:

```text
Reconnect
   |
   v
BLE verification
   |
   v
Exchange/verification
   |
   v
Server validation
   |
   v
2× eligible reward
```

The client must never self-authorize the multiplier.

Server validation must protect against:
- replay;
- duplicate verification;
- fake client state;
- verification with the wrong participant;
- expired reconnection;
- invalid session;
- repeated reward claims.

The backend records whether the eligible reward has already been multiplied.

### Reward semantics

- Base reward is granted according to the configured product rule after successful Reveal.
- If valid BLE verification is completed, the **eligible reward becomes 2×**.
- If the base reward has already been granted, the system should issue only the additional delta required to reach the 2× total rather than granting the full 2× amount again.
- Connecti Coins must follow the configured reward policy and must not be duplicated because of BLE verification.

Example:

```text
Base eligible reward = 100
Reveal -> user receives 100

Valid BLE
-> total eligible reward becomes 200
-> additional 100 is granted

Final total = 200
```

The exact reward values remain backend/product configuration.

## Chat

Reconnect provides a direct Chat entry point.

```text
Reconnect -> Chat -> Conversation
```

The backend must verify that the users are authorized to chat under the current product rules.

## Critical: Cancel Reconnection

**Cancel Reconnection is a core safety/control function and must be immediately effective.**

It should be clearly visible and accessible from the Reconnect experience.

When either participant selects:

```text
CANCEL RECONNECTION
```

the backend must immediately attempt to transition the reconnection to a terminal `CANCELLED` state.

### Cancellation must:

- terminate the reconnection immediately;
- prevent further progression through Connecti's reconnection flow;
- invalidate pending dependent actions;
- prevent the other participant from moving forward through the reconnection flow;
- suppress future notifications tied specifically to that reconnection where possible;
- make subsequent Chat/Meetup/BLE/reward actions revalidate and reject if they depend on the terminated reconnection;
- be idempotent.

### Privacy requirement

The other participant must **never be told who cancelled**.

They should see only neutral wording such as:

```text
This reconnection has ended.
```

or:

```text
This reconnection is no longer available.
```

Do NOT show:

```text
Rahul cancelled.
```

Do NOT expose an internal cancellation event to the other participant.

Important distinction: after Reveal, the other participant already knows the identity that was revealed. The privacy requirement is specifically that the other user must not learn **which participant initiated the cancellation**.

## Cancellation race conditions

The backend must handle:

### A cancels while B has Reconnect open
B's next server validation must return `CANCELLED`.

### B presses Chat after A cancels
The Chat action must be rejected if it depends on an active reconnection.

### B presses BLE after A cancels
BLE verification must be rejected.

### B presses Meetup after A cancels
Meetup creation must be rejected if tied to the terminated reconnection.

### Notification already queued
The backend should prevent delivery where possible. If delivered after cancellation because of push-system timing, opening it must fetch server state and show the neutral ended state.

### A and B cancel simultaneously
Only one terminal cancellation transition should be committed. Both clients converge to the same terminal state.

## Reconnect state machine

```text
REVEALED
   |
   v
RECONNECT_ACTIVE
   |
   +---- Chat / Meetup / BLE ----> permitted only while valid
   |
   +---- Cancel ----> CANCELLED
   |
   +---- expiry ----> EXPIRED
   |
   +---- successful completion ----> COMPLETED
```

`CANCELLED` is terminal.

## Rewards after cancellation

Cancellation must not create unfair duplicate rewards.

- Rewards already legitimately issued remain in the ledger unless a separate product rule explicitly reverses them.
- Future rewards dependent on the active reconnection must not be issued after cancellation.
- BLE 2× must not be granted after cancellation.
- Duplicate reward requests after cancellation must fail safely.
- If a reward transaction races with cancellation, the backend transaction/state rules decide whether it was legitimately committed before termination; never rely on client timing.

## Foreground / background / killed

### Foreground
- Reconnect screen displays all active options.
- Cancel immediately calls the server and updates UI based on server response.
- Chat/BLE/offer actions revalidate state.

### Background
- If cancellation happens from another device/session, a background notification may be used where appropriate.
- On resume, always fetch the current server state.
- No background process should continue a cancelled reconnection.

### Killed
- If a cancellation occurs while the app is killed, the next launch must fetch the server state and show the terminal state.
- If a stale Reconnect notification is tapped after cancellation, it must not reopen an active reconnection; it must resolve to the ended/expired state.

## Backend authority

The server owns:
- reconnection state;
- cancellation;
- authorization;
- reward grants;
- coin ledger;
- BLE verification;
- offer eligibility;
- chat/meetup eligibility;
- expiry.

The Android client is a presentation/action layer and must not be trusted for these decisions.

## Acceptance criteria

- Reconnect exposes offer, reward, Connecti Coins, Chat, BLE 2× option, and Cancel Reconnection.
- Base Connecti Coins are granted individually to both users after successful Reveal.
- Base reward can become 2× only after valid BLE verification.
- BLE grants only the required additional delta when base reward was already issued.
- Cancellation is immediate and server-authoritative.
- Cancellation is terminal.
- The other participant never learns who initiated cancellation.
- Pending/late actions cannot bypass cancellation.
- Foreground/background/killed states are all supported.
- Stale notifications reconcile against server state.

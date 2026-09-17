# Product Overview

**Connecti** is a hyper-local, real-time social networking app designed to facilitate serendipitous connections between people in the same physical space (e.g., coffee shops, college campuses, events).

## Rollout Strategy
The app is being rebuilt from the ground up natively for Android. We are adopting a **feature-by-feature** approach, meaning we will build, test, and polish one core feature at a time before moving to the next.

## Core Value Proposition
Instead of swiping through profiles of people miles away, Connecti shows you who is *right here, right now* and open to interacting.

## User Journey (Feature Pipeline)

1. **Feature 1: Onboarding & Profile Creation**
   Users sign up using email/password via Supabase Auth. They create a profile containing basic information (Name, Username, DOB, Contact).

2. **Feature 2: Entering a Geofence Zone**
   The app continuously monitors the user's location against predefined Geofence Zones. When a user enters a zone, their presence is detected natively in the background.

3. **Feature 3: Opting-in (The "Wave")**
   By default, users might be invisible or inactive. A user can choose to become "Open to Wave" for a specific duration in their current zone.

4. **Feature 4: Interaction (Waving & Hints)**
   Once open to wave, other users in the same zone can see them. Users can send a Wave (direct interest) or a Hint (subtle signal).

5. **Feature 5: Mutual Connections & Chat**
   If two users express mutual interest, they become connected and can chat, facilitating a real-world meetup since they are in the same location.

6. **Feature 6: Zone Departure**
   When the user leaves the geofence, their presence is automatically removed, and they are no longer visible.

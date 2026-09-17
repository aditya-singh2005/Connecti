# Connecti App Documentation

Welcome to the documentation for **Connecti**, a location-based social and networking application built using React Native (Expo) and Supabase.

## Overview

Connecti enables users to interact with others in their vicinity through "Geofence Zones". When users enter a predefined zone (e.g., a cafe, a park, a campus), they can optionally make themselves "Open to Wave." Other users in the same zone can then "Wave" at them or send hints, facilitating real-world connections.

## Tech Stack

- **Frontend**: React Native with Expo (Managed Workflow with Custom Native Code)
- **Routing**: Expo Router (File-based routing)
- **Backend/Database**: Supabase (PostgreSQL, Authentication, Row Level Security)
- **Push Notifications**: Firebase Cloud Messaging (FCM) & Expo Push Notifications
- **Location/Geofencing**: Background geolocation and native Android modules for reliable zone detection even in killed state.
- **Styling**: React Native StyleSheet & Custom Theme Context

## Directory Structure
- `/app` - Expo Router screens and layouts.
- `/components` - Reusable UI components.
- `/services` - Business logic (WaveService, GeofenceManager).
- `/tasks` - Expo background tasks.
- `/context` - React Context providers (Auth, Theme).
- `/android` - Custom native Android code for background geofencing and notification handling.

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Start the App**
   ```bash
   npx expo start
   ```

*Note: For testing native geofencing and background notifications, a physical Android device or emulator with a custom development build is required.*

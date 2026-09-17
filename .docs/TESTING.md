# Testing Connecti

Testing location-based background applications is notoriously difficult. Connecti includes specific tools to aid in this process.

## The Location Test Screen (`/app/location-test.jsx`)
This screen is built specifically to debug and test geofencing logic without needing to physically walk around.

### Features of the Test Screen:
- **Location Spoofing**: Simulates coordinate changes to trigger geofence `ENTER` and `EXIT` events.
- **Zone Registration**: Manually register or unregister geofences with the native OS.
- **Manual Sync**: Force a sync with Supabase to test database connectivity and RLS rules.
- **Logs**: Displays real-time logs from both the JS side and the Native side to track the flow of events.

## Notification Testing
- `NotificationTester.jsx` (located in `/components`) can be used to simulate incoming FCM notifications. This is vital for testing the navigation redirection logic in `_layout.jsx`.

## Testing Background/Killed States (Android)
To test if the app successfully updates Supabase when the app is completely closed:
1. Open the app and log in.
2. Ensure the app has location permissions (Always Allow).
3. Force-close the app from the Android multitasking menu.
4. Use Android Studio's Emulator Extended Controls -> Location to simulate a route that crosses a registered geofence.
5. Check the Supabase `active_zone_users` table directly via the Supabase dashboard to verify the `execution_state` is logged as `killed` and the user's presence was updated.

## Logging
- A `DebugLogger` component is available to write logs to a file (`app.log` or `adb.log`) on the device, allowing developers to retrieve logs after a background execution sequence finishes.

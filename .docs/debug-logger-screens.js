// Script to add DebugLogger to all screens
// This file documents which screens need DebugLogger added

const screensToUpdate = [
    {
        path: 'app/home/ChatScreen.jsx',
        screenName: 'ChatScreen',
        logTypes: ['LIFECYCLE', 'NOTIFICATION', 'INFO']
    },
    {
        path: 'app/home/ChatConversationScreen.jsx',
        screenName: 'ChatConversationScreen',
        logTypes: ['LIFECYCLE', 'NOTIFICATION', 'INFO']
    },
    {
        path: 'app/home/ProfileScreen.jsx',
        screenName: 'ProfileScreen',
        logTypes: ['LIFECYCLE', 'INFO']
    },
    {
        path: 'app/home/SearchScreen.jsx',
        screenName: 'SearchScreen',
        logTypes: ['LIFECYCLE', 'INFO']
    },
    {
        path: 'app/home/FriendsListScreen.jsx',
        screenName: 'FriendsListScreen',
        logTypes: ['LIFECYCLE', 'INFO']
    },
    {
        path: 'app/home/FriendRequestsScreen.jsx',
        screenName: 'FriendRequestsScreen',
        logTypes: ['LIFECYCLE', 'INFO']
    },
    {
        path: 'app/home/GeofenceTestScreen.jsx',
        screenName: 'GeofenceTestScreen',
        logTypes: ['GEOFENCE', 'BACKGROUND', 'NOTIFICATION', 'LIFECYCLE']
    },
    {
        path: 'app/home/BLETestScreen.jsx',
        screenName: 'BLETestScreen',
        logTypes: ['BLE', 'BACKGROUND', 'LIFECYCLE']
    },
    {
        path: 'app/home/NotificationTestScreen.jsx',
        screenName: 'NotificationTestScreen',
        logTypes: ['NOTIFICATION', 'BACKGROUND', 'LIFECYCLE']
    },
    {
        path: 'app/home/PermissionsScreen.jsx',
        screenName: 'PermissionsScreen',
        logTypes: ['LIFECYCLE', 'INFO']
    },
    {
        path: 'app/home/ProximitySettingsScreen.jsx',
        screenName: 'ProximitySettingsScreen',
        logTypes: ['BLE', 'LIFECYCLE', 'INFO']
    },
    {
        path: 'app/signup.jsx',
        screenName: 'SignupScreen',
        logTypes: ['LIFECYCLE', 'INFO', 'ERROR']
    },
    {
        path: 'app/login.jsx',
        screenName: 'LoginScreen',
        logTypes: ['LIFECYCLE', 'INFO', 'ERROR']
    },
    {
        path: 'app/create-profile.jsx',
        screenName: 'CreateProfileScreen',
        logTypes: ['LIFECYCLE', 'INFO', 'ERROR']
    }
];

// Instructions:
// 1. Add imports at the top of each file:
//    import { DebugLogger } from '../../components/DebugLogger';
//    import { DebugService } from '../../services/DebugService';
//
// 2. Add DebugLogger component before closing tag:
//    <DebugLogger screenName="ScreenName" maxLogs={150} initiallyExpanded={false} />
//
// 3. Add lifecycle logging in useEffect:
//    useEffect(() => {
//      DebugService.lifecycle('ScreenName', 'Component mounted');
//      return () => DebugService.lifecycle('ScreenName', 'Component unmounted');
//    }, []);

module.exports = { screensToUpdate };

// Quick-add script for DebugLogger
// This file contains the exact code snippets to add to each remaining screen

// ============================================
// NOTIFICATION TEST SCREEN
// ============================================
// File: app/home/NotificationTestScreen.jsx
// Add after existing imports:
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

// Add in useEffect (mount):
useEffect(() => {
    DebugService.lifecycle('NotificationTestScreen', 'Component mounted');
    return () => DebugService.lifecycle('NotificationTestScreen', 'Component unmounted');
}, []);

// Add before closing ScrollView/View:
<DebugLogger screenName="NotificationTestScreen" maxLogs={200} initiallyExpanded={false} />

// ============================================
// BLE TEST SCREEN
// ============================================
// File: app/home/BLETestScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('BLETestScreen', 'Component mounted');
    return () => DebugService.lifecycle('BLETestScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="BLETestScreen" maxLogs={200} initiallyExpanded={false} />

// ============================================
// PERMISSIONS SCREEN
// ============================================
// File: app/home/PermissionsScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('PermissionsScreen', 'Component mounted');
    return () => DebugService.lifecycle('PermissionsScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="PermissionsScreen" maxLogs={150} initiallyExpanded={false} />

// ============================================
// CHAT SCREEN
// ============================================
// File: app/home/ChatScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('ChatScreen', 'Component mounted');
    return () => DebugService.lifecycle('ChatScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="ChatScreen" maxLogs={150} initiallyExpanded={false} />

// ============================================
// CHAT CONVERSATION SCREEN
// ============================================
// File: app/home/ChatConversationScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('ChatConversationScreen', 'Component mounted');
    return () => DebugService.lifecycle('ChatConversationScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="ChatConversationScreen" maxLogs={150} initiallyExpanded={false} />

// ============================================
// PROFILE SCREEN
// ============================================
// File: app/home/ProfileScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('ProfileScreen', 'Component mounted');
    return () => DebugService.lifecycle('ProfileScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="ProfileScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// SEARCH SCREEN
// ============================================
// File: app/home/SearchScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('SearchScreen', 'Component mounted');
    return () => DebugService.lifecycle('SearchScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="SearchScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// FRIENDS LIST SCREEN
// ============================================
// File: app/home/FriendsListScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('FriendsListScreen', 'Component mounted');
    return () => DebugService.lifecycle('FriendsListScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="FriendsListScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// FRIEND REQUESTS SCREEN
// ============================================
// File: app/home/FriendRequestsScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('FriendRequestsScreen', 'Component mounted');
    return () => DebugService.lifecycle('FriendRequestsScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="FriendRequestsScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// PROXIMITY SETTINGS SCREEN
// ============================================
// File: app/home/ProximitySettingsScreen.jsx
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

useEffect(() => {
    DebugService.lifecycle('ProximitySettingsScreen', 'Component mounted');
    return () => DebugService.lifecycle('ProximitySettingsScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="ProximitySettingsScreen" maxLogs={150} initiallyExpanded={false} />

// ============================================
// SIGNUP SCREEN
// ============================================
// File: app/signup.jsx
import { DebugLogger } from './components/DebugLogger';
import { DebugService } from './services/DebugService';

useEffect(() => {
    DebugService.lifecycle('SignupScreen', 'Component mounted');
    return () => DebugService.lifecycle('SignupScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="SignupScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// LOGIN SCREEN
// ============================================
// File: app/login.jsx
import { DebugLogger } from './components/DebugLogger';
import { DebugService } from './services/DebugService';

useEffect(() => {
    DebugService.lifecycle('LoginScreen', 'Component mounted');
    return () => DebugService.lifecycle('LoginScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="LoginScreen" maxLogs={100} initiallyExpanded={false} />

// ============================================
// CREATE PROFILE SCREEN
// ============================================
// File: app/create-profile.jsx
import { DebugLogger } from './components/DebugLogger';
import { DebugService } from './services/DebugService';

useEffect(() => {
    DebugService.lifecycle('CreateProfileScreen', 'Component mounted');
    return () => DebugService.lifecycle('CreateProfileScreen', 'Component unmounted');
}, []);

<DebugLogger screenName="CreateProfileScreen" maxLogs={100} initiallyExpanded={false} />

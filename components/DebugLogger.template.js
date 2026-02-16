// Template for adding DebugLogger to screens
// Add these imports at the top:
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

// Add this component before the closing tag of your main container (usually ScrollView or View):
<DebugLogger screenName="YourScreenName" maxLogs={150} initiallyExpanded={false} />

// Common logging patterns:

// Component mount/unmount
useEffect(() => {
    DebugService.lifecycle('ScreenName', 'Component mounted');
    return () => {
        DebugService.lifecycle('ScreenName', 'Component unmounted');
    };
}, []);

// Geofence events
DebugService.geofence('ScreenName', 'Geofence entered', { zoneName, distance });

// Notifications
DebugService.notification('ScreenName', 'Notification received', { type, data });

// Background tasks
DebugService.background('ScreenName', 'Background task started', { taskName });

// Wave events
DebugService.wave('ScreenName', 'Wave sent', { recipientId, zoneId });

// BLE events
DebugService.ble('ScreenName', 'Device discovered', { deviceId, rssi });

// Errors
DebugService.error('ScreenName', 'Operation failed', { error: error.message });

// Success
DebugService.success('ScreenName', 'Operation completed', { result });

// Warnings
DebugService.warn('ScreenName', 'Potential issue detected', { details });

// General info
DebugService.info('ScreenName', 'Status update', { status });

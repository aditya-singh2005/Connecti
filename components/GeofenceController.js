import React from 'react';
import { useAuth } from '../context/AuthProvider';
import { useGeofenceService } from '../hooks/useGeofenceService';
import '../tasks/geofenceTask';

export default function GeofenceController() {
    const { user } = useAuth();
    // ✅ Re-use the robust hook instead of duplicate logic
    // This prevents race conditions and NPEs from uncoordinated task access
    const { startGeofencing, stopGeofencing, isGeofencingActive } = useGeofenceService();

    // We can also use this component to purely handle initial permissions 
    // or just rely on the screens to trigger start/stop.

    // For now, let's keep it simple: simpler is better.
    // If the user is logged in, we let the Home/Test screen manage the 'Active' toggle.
    // This component can just be a shell or removed, but to avoid breaking imports:
    return null;
}

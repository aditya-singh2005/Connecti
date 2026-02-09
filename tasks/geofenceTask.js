// tasks/geofenceTask.js
// This file now delegates to the robust GeofenceManager implementation
// to avoid duplicate task definitions and ensure consistent behavior.

import '../services/GeofenceManager'; // Import side-effect: Registers the task
import { GEOFENCE_TASK_NAME } from '../services/GeofenceManager';

// Re-export the task name for compatibility with GeofenceController
export { GEOFENCE_TASK_NAME };

console.log('[geofenceTask] Delegating to GeofenceManager for task:', GEOFENCE_TASK_NAME);

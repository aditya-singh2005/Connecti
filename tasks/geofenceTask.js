// tasks/geofenceTask.js
// This file now delegates to the robust GeofenceManager implementation
// to avoid duplicate task definitions and ensure consistent behavior.

import * as TaskManager from 'expo-task-manager';
import '../services/GeofenceManager'; // Import side-effect: Registers the task
import { GEOFENCE_TASK_NAME } from '../services/GeofenceManager';

// ✅ LEGACY STUB: Register the OLD task name as a no-op so Android OS stops
// firing "task not defined" warnings for geofences registered under the old name.
// This can be removed once all devices have been re-registered with the new V2 name.
const LEGACY_GEOFENCE_TASK = 'CONNECTI_GEOFENCE_TASK';
if (!TaskManager.isTaskDefined(LEGACY_GEOFENCE_TASK)) {
  TaskManager.defineTask(LEGACY_GEOFENCE_TASK, () => {
    // No-op: old task name, ignore silently
    return;
  });
}

// Re-export the task name for compatibility with GeofenceController
export { GEOFENCE_TASK_NAME };

console.log('[geofenceTask] Delegating to GeofenceManager for task:', GEOFENCE_TASK_NAME);


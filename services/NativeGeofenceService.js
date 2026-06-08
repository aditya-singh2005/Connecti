// services/NativeGeofenceService.js - Wrapper for native geofencing module
import { NativeModules, Platform } from 'react-native';

const getNativeModule = () => NativeModules?.NativeGeofenceModule;

function normalizeNativeGeofence(zone, index) {
  const latitude = Number(zone?.latitude);
  const longitude = Number(zone?.longitude);
  const rawRadius = Number(zone?.radius);
  const radius = Number.isFinite(rawRadius) ? Math.max(120, rawRadius) : 500;

  const identifier =
    zone?.identifier ||
    zone?.name ||
    (zone?.id != null ? `zone_${zone.id}` : `zone_${index}`);

  return {
    identifier: String(identifier),
    latitude,
    longitude,
    radius,
    transitionTypes: 1, // GEOFENCE_TRANSITION_ENTER
    name: String(zone?.name || identifier),
  };
}

/**
 * NativeGeofenceService - JavaScript wrapper for native Android geofencing
 *
 * Provides a clean interface to the native GeofencingClient implementation
 * that works even when the app is killed (swiped from recents).
 */
class NativeGeofenceService {
  /**
   * Checks if native geofencing is available
   */
  async isAvailable() {
    if (Platform.OS !== 'android') {
      console.log('ℹ️ Native geofencing only available on Android');
      return false;
    }

    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) {
      console.log('⚠️ NativeGeofenceModule not found');
      return false;
    }

    try {
      const available = await NativeGeofenceModule.isAvailable();
      console.log(`${available ? '✅' : '❌'} Native geofencing available: ${available}`);
      return available;
    } catch (error) {
      console.error('❌ Error checking native geofencing availability:', error.message);
      return false;
    }
  }

  /**
   * Registers geofences with the native module
   *
   * @param {Array} zones - Array of zone objects with {name/identifier, latitude, longitude, radius}
   * @returns {Promise<boolean>} - True if registration successful
   */
  async registerGeofences(zones) {
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) {
      throw new Error('NativeGeofenceModule not available');
    }

    try {
      const geofences = (zones || [])
        .map((zone, index) => normalizeNativeGeofence(zone, index))
        .filter((zone) => Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude));

      if (!geofences.length) {
        throw new Error('No valid geofences to register');
      }

      console.log(`📍 Registering ${geofences.length} native geofences...`);

      const success = await NativeGeofenceModule.registerGeofences(geofences);

      if (success) {
        console.log(`✅ Successfully registered ${geofences.length} native geofences`);
      } else {
        console.log('⚠️ Native geofence registration returned false');
      }

      return success;
    } catch (error) {
      console.error('❌ Failed to register native geofences:', error.message);
      throw error;
    }
  }

  /**
   * Removes all registered geofences
   */
  async removeGeofences() {
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) {
      throw new Error('NativeGeofenceModule not available');
    }

    try {
      console.log('🗑️ Removing all native geofences...');
      const success = await NativeGeofenceModule.removeGeofences();

      if (success) {
        console.log('✅ Successfully removed all native geofences');
      }

      return success;
    } catch (error) {
      console.error('❌ Failed to remove native geofences:', error.message);
      throw error;
    }
  }

  /**
   * Gets list of currently registered geofence IDs
   */
  async getRegisteredGeofences() {
    return []; // Native module doesn't support listing yet
  }

  async setAppRuntimeState(state, timestamp = Date.now()) {
    // Native module doesn't support state sync yet
  }

  /**
   * Syncs user session context to native for background tasks
   */
  async setSessionContext(userId, supabaseUrl, supabaseKey) {
    if (Platform.OS !== 'android') return false;
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) return false;

    try {
      console.log('🔑 Syncing session context to native...');
      return await NativeGeofenceModule.setSessionContext(userId, supabaseUrl, supabaseKey);
    } catch (error) {
      console.error('❌ Failed to set native session context:', error.message);
      return false;
    }
  }

  /**
   * Updates the "Waved" state in the native module
   */
  async setIsWaved(isWaved, expiryTimeMs = 0) {
    if (Platform.OS !== 'android') return false;
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) return false;

    try {
      console.log(`${isWaved ? '🌊' : '🛑'} Setting native isWaved: ${isWaved}`);
      return await NativeGeofenceModule.setIsWaved(isWaved, expiryTimeMs);
    } catch (error) {
      console.error('❌ Failed to set native isWaved:', error.message);
      return false;
    }
  }

  /**
   * Drains pending notification actions (WAVE, LATER) from native
   */
  async getPendingActions() {
    if (Platform.OS !== 'android') return [];
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule?.getPendingActions) return [];

    try {
      return await NativeGeofenceModule.getPendingActions();
    } catch (error) {
      console.error('❌ Failed to get pending actions:', error.message);
      return [];
    }
  }

  /**
   * Clears pending notification actions from native
   */
  async clearPendingActions() {
    if (Platform.OS !== 'android') return false;
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule?.clearPendingActions) return false;

    try {
      return await NativeGeofenceModule.clearPendingActions();
    } catch (error) {
      console.error('❌ Failed to clear pending actions:', error.message);
      return false;
    }
  }

  /**
   * Drains pending waves (arrivals) from native
   */
  async getPendingWaves() {
    if (Platform.OS !== 'android') return [];
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule?.getPendingWaves) return [];

    try {
      return await NativeGeofenceModule.getPendingWaves();
    } catch (error) {
      console.error('❌ Failed to get pending waves:', error.message);
      return [];
    }
  }

  /**
   * Schedules a 15-min periodic WorkManager for killed-state background refresh
   */
  async startPeriodicRefresh() {
    if (Platform.OS !== 'android') return false;
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule?.startPeriodicRefresh) return false;

    try {
      console.log('🔄 Scheduling native periodic geofence refresh...');
      return await NativeGeofenceModule.startPeriodicRefresh();
    } catch (error) {
      console.error('❌ Failed to schedule periodic refresh:', error.message);
      return false;
    }
  }
}

export default new NativeGeofenceService();

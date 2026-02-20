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
    id: String(identifier),
    latitude,
    longitude,
    radius,
    transitionTypes: 1, // GEOFENCE_TRANSITION_ENTER
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
      const available = await NativeGeofenceModule.checkGeofencingAvailability();
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
    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule) {
      return [];
    }

    try {
      const geofenceIds = await NativeGeofenceModule.getRegisteredGeofences();
      console.log(`ℹ️ Currently registered geofences: ${geofenceIds.length}`);
      return geofenceIds;
    } catch (error) {
      console.error('❌ Failed to get registered geofences:', error.message);
      return [];
    }
  }

  async setAppRuntimeState(state, timestamp = Date.now()) {
    if (Platform.OS !== 'android') return;

    const NativeGeofenceModule = getNativeModule();
    if (!NativeGeofenceModule?.updateAppRuntimeState) return;

    try {
      await NativeGeofenceModule.updateAppRuntimeState(String(state), Number(timestamp));
    } catch (error) {
      console.log('⚠️ Failed to sync runtime state to native:', error?.message || error);
    }
  }
}

export default new NativeGeofenceService();

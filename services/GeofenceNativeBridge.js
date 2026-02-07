// services/GeofenceNativeBridge.js
import { NativeModules, Platform } from 'react-native';

const { GeofenceNative } = NativeModules;

/**
 * JavaScript bridge to native geofencing module
 * Provides simple API for React Native to use native geofencing
 */

class GeofenceNativeBridge {
  
  /**
   * Check if native module is available
   */
  isAvailable() {
    return Platform.OS === 'android' && GeofenceNative != null;
  }

  /**
   * Register geofences with native Android system
   * These will persist and trigger even when app is killed
   * 
   * @param {Array} geofences - Array of geofence objects
   * @returns {Promise<Object>} Result with success status
   */
  async registerGeofences(geofences) {
    if (!this.isAvailable()) {
      throw new Error('Native geofencing not available on this platform');
    }

    try {
      console.log('📍 Registering native geofences:', geofences.length);
      
      // Convert to format expected by native module
      const nativeGeofences = geofences.map(g => ({
        identifier: g.identifier,
        latitude: g.latitude,
        longitude: g.longitude,
        radius: g.radius,
      }));

      const geofencesJson = JSON.stringify(nativeGeofences);
      const result = await GeofenceNative.registerGeofences(geofencesJson);
      
      console.log('✅ Native geofences registered:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Failed to register native geofences:', error);
      throw error;
    }
  }

  /**
   * Unregister all geofences
   */
  async unregisterGeofences() {
    if (!this.isAvailable()) {
      throw new Error('Native geofencing not available');
    }

    try {
      console.log('🛑 Unregistering native geofences...');
      const result = await GeofenceNative.unregisterGeofences();
      console.log('✅ Native geofences unregistered');
      return result;
      
    } catch (error) {
      console.error('❌ Failed to unregister:', error);
      throw error;
    }
  }

  /**
   * Get events that were stored by native code while app was killed
   * @returns {Promise<Array>} Array of event objects
   */
  async getStoredEvents() {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const eventsJson = await GeofenceNative.getStoredEvents();
      const events = JSON.parse(eventsJson);
      
      console.log(`📊 Retrieved ${events.length} native events`);
      return events;
      
    } catch (error) {
      console.error('❌ Failed to get stored events:', error);
      return [];
    }
  }

  /**
   * Clear stored events from native storage
   */
  async clearStoredEvents() {
    if (!this.isAvailable()) {
      return true;
    }

    try {
      await GeofenceNative.clearStoredEvents();
      console.log('🧹 Native events cleared');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to clear events:', error);
      return false;
    }
  }

  /**
   * Check if location permissions are granted
   */
  async hasLocationPermissions() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      return await GeofenceNative.hasLocationPermissions();
    } catch (error) {
      console.error('❌ Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Get status of native geofencing system
   */
  async getStatus() {
    if (!this.isAvailable()) {
      return {
        available: false,
        platform: Platform.OS,
      };
    }

    try {
      const hasPermissions = await this.hasLocationPermissions();
      const storedEvents = await this.getStoredEvents();
      
      return {
        available: true,
        platform: 'android',
        hasPermissions,
        storedEventsCount: storedEvents.length,
        nativeModuleVersion: '1.0.0',
      };
      
    } catch (error) {
      console.error('❌ Failed to get status:', error);
      return {
        available: true,
        error: error.message,
      };
    }
  }
}

export default new GeofenceNativeBridge();
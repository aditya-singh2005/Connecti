// services/GeofenceNativeBridge.js - Native Android Bridge
import { NativeModules, Platform } from 'react-native';

const { GeofenceNative } = NativeModules;

class GeofenceNativeBridge {
  
  isAvailable() {
    return Platform.OS === 'android' && GeofenceNative != null;
  }

  async registerGeofences(geofences) {
    if (!this.isAvailable()) {
      throw new Error('Native geofencing not available');
    }

    try {
      console.log('📍 Registering native geofences:', geofences.length);
      
      const nativeGeofences = geofences.map(g => ({
        identifier: g.identifier,
        latitude: g.latitude,
        longitude: g.longitude,
        radius: g.radius,
      }));

      const geofencesJson = JSON.stringify(nativeGeofences);
      const result = await GeofenceNative.registerGeofences(geofencesJson);
      
      console.log('✅ Native geofences registered');
      return result;
      
    } catch (error) {
      console.error('❌ Native registration failed:', error);
      throw error;
    }
  }

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
      console.error('❌ Unregister failed:', error);
      throw error;
    }
  }

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
      console.error('❌ Failed to get events:', error);
      return [];
    }
  }

  async clearStoredEvents() {
    if (!this.isAvailable()) {
      return true;
    }

    try {
      await GeofenceNative.clearStoredEvents();
      console.log('🧹 Native events cleared');
      return true;
      
    } catch (error) {
      console.error('❌ Clear failed:', error);
      return false;
    }
  }

  async storeFCMToken(token) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await GeofenceNative.storeFCMToken(token);
      console.log('✅ FCM token stored in native');
      return true;
      
    } catch (error) {
      console.error('❌ Token storage failed:', error);
      return false;
    }
  }

  async hasLocationPermissions() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      return await GeofenceNative.hasLocationPermissions();
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      return false;
    }
  }

  async getStatus() {
    if (!this.isAvailable()) {
      return {
        available: false,
        platform: Platform.OS,
      };
    }

    try {
      const status = await GeofenceNative.getStatus();
      return status;
      
    } catch (error) {
      console.error('❌ Status check failed:', error);
      return {
        available: true,
        error: error.message,
      };
    }
  }
}

export default new GeofenceNativeBridge();
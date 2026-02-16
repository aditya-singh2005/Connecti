// services/ExpoPushTokenService.js - FCM DEVICE TOKEN SERVICE (NOT EXPO PUSH TOKENS!)
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const FCM_DEVICE_TOKEN_KEY = 'fcm_device_token';
const TOKEN_LAST_ATTEMPT_KEY = 'fcm_token_last_attempt';
const TOKEN_RETRY_DELAY = 30000; // 30 seconds between retries

class ExpoPushTokenService {
  constructor() {
    this.isFetching = false;
    this.cachedToken = null;
  }

  /**
   * Get FCM Device Push Token (requires Google Play Services)
   * This is what your FCM API expects - NOT Expo Push Tokens!
   */
  async getToken() {
    // Return cached token if available
    if (this.cachedToken) {
      console.log('✅ Using cached FCM Device Token');
      return this.cachedToken;
    }

    // Try to get from storage
    const storedToken = await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
    if (storedToken) {
      console.log('✅ Using stored FCM Device Token');
      this.cachedToken = storedToken;
      return storedToken;
    }

    // Fetch new token
    return await this.fetchNewToken();
  }

  /**
   * Fetch a new FCM Device Token
   */
  async fetchNewToken(forceRetry = false) {
    // Prevent multiple simultaneous fetches
    if (this.isFetching) {
      console.log('⏳ Token fetch already in progress');
      return null;
    }

    // Check rate limiting
    if (!forceRetry) {
      const lastAttempt = await AsyncStorage.getItem(TOKEN_LAST_ATTEMPT_KEY);
      if (lastAttempt) {
        const timeSinceLastAttempt = Date.now() - parseInt(lastAttempt);
        if (timeSinceLastAttempt < TOKEN_RETRY_DELAY) {
          console.log(`ℹ️ Rate limited - wait ${Math.round((TOKEN_RETRY_DELAY - timeSinceLastAttempt) / 1000)}s`);
          return null;
        }
      }
    }

    // Record attempt time
    await AsyncStorage.setItem(TOKEN_LAST_ATTEMPT_KEY, Date.now().toString());

    // Check if running on physical device
    if (!Device.isDevice) {
      console.log('ℹ️ Emulator detected - FCM not available');
      return null;
    }

    this.isFetching = true;

    try {
      console.log('🔑 Fetching FCM Device Push Token...');

      // 1. Check/request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Notification permissions denied');
        this.isFetching = false;
        return null;
      }

      // 2. Get FCM DEVICE TOKEN
      // CRITICAL FIX: Use getDevicePushTokenAsync and extract the token correctly
      let tokenData;
      try {
        tokenData = await Notifications.getDevicePushTokenAsync();
        console.log('🔍 Raw token data:', tokenData);
      } catch (e) {
        if (e.message.includes('SERVICE_NOT_AVAILABLE') || 
            e.message.includes('GOOGLE_PLAY_SERVICES') ||
            e.message.includes('not available')) {
          console.log('⚠️ Google Play Services not available');
          this.isFetching = false;
          return null;
        }
        throw e;
      }

      // Extract the actual FCM token
      let token = null;
      
      if (Platform.OS === 'android') {
        // Android: tokenData.data contains the FCM token
        if (tokenData?.data) {
          token = tokenData.data;
        } else if (typeof tokenData === 'string') {
          token = tokenData;
        }
      } else if (Platform.OS === 'ios') {
        // iOS: tokenData.data contains the APNs token
        if (tokenData?.data) {
          token = tokenData.data;
        } else if (typeof tokenData === 'string') {
          token = tokenData;
        }
      }

      // Validate token format
      if (token) {
        console.log('🔍 Token type:', typeof token);
        console.log('🔍 Token length:', token.length);
        console.log('🔍 Token preview:', token.substring(0, 50) + '...');

        // For Android, FCM tokens should be long strings with ":" separator
        // Example: "cd2Vi7n9QjCAispPSXcyIH:APA91bFw9sozvU9DGS894khU..."
        if (Platform.OS === 'android') {
          if (!token.includes(':') || token.length < 100) {
            console.log('⚠️ Invalid FCM token format (too short or missing colon)');
            this.isFetching = false;
            return null;
          }
        }

        console.log('✅ FCM Device Token obtained successfully!');
        console.log('✅ Full token:', token);

        // Store token
        await AsyncStorage.setItem(FCM_DEVICE_TOKEN_KEY, token);
        this.cachedToken = token;

        this.isFetching = false;
        return token;
      } else {
        console.log('❌ No token extracted from tokenData');
        this.isFetching = false;
        return null;
      }

    } catch (error) {
      console.error('❌ FCM Token Fetch Error:', error.message);
      console.error('❌ Full error:', error);
      this.isFetching = false;
      return null;
    }
  }

  /**
   * Force retry token fetch (ignores rate limiting)
   */
  async forceRetry() {
    console.log('🔄 Force retrying FCM token fetch...');
    this.cachedToken = null;
    await AsyncStorage.removeItem(FCM_DEVICE_TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_LAST_ATTEMPT_KEY);
    return await this.fetchNewToken(true);
  }

  /**
   * Clear stored token
   */
  async clearToken() {
    try {
      await AsyncStorage.removeItem(FCM_DEVICE_TOKEN_KEY);
      await AsyncStorage.removeItem(TOKEN_LAST_ATTEMPT_KEY);
      this.cachedToken = null;
      console.log('✅ FCM Device Token cleared');
    } catch (error) {
      console.log('⚠️ Failed to clear token:', error.message);
    }
  }

  /**
   * Check if FCM is available
   */
  async isAvailable() {
    if (!Device.isDevice) {
      return false;
    }

    try {
      const token = await this.getToken();
      return token !== null && token.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get token status for debugging
   */
  async getStatus() {
    const storedToken = await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
    const lastAttempt = await AsyncStorage.getItem(TOKEN_LAST_ATTEMPT_KEY);

    return {
      hasToken: !!storedToken,
      hasCachedToken: !!this.cachedToken,
      isFetching: this.isFetching,
      isDevice: Device.isDevice,
      platform: Platform.OS,
      lastAttempt: lastAttempt ? new Date(parseInt(lastAttempt)).toISOString() : null,
      tokenPreview: storedToken ? `${storedToken.substring(0, 50)}...` : null,
      tokenLength: storedToken ? storedToken.length : 0,
      tokenType: 'FCM Device Token (Firebase)',
      isValidFormat: storedToken ? (Platform.OS === 'android' ? storedToken.includes(':') : true) : false,
    };
  }

  /**
   * Wait for Google Play Services to be ready, then fetch token
   * Useful after device boot
   */
  async waitAndFetch(maxWaitMs = 120000) { // 2 minutes max
    console.log('⏳ Waiting for Google Play Services to be ready...');

    const startTime = Date.now();
    const retryInterval = 10000; // 10 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const token = await this.fetchNewToken(true);

      if (token && token.length > 0) {
        console.log('✅ FCM token obtained after waiting');
        return token;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏳ Retrying in 10 seconds... (${elapsed}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }

    console.log('⏱️ Timeout waiting for Google Play Services');
    return null;
  }

  /**
   * Debug: Print all token information
   */
  async debugTokenInfo() {
    console.log('═══════════════════════════════════════');
    console.log('🔍 FCM TOKEN DEBUG INFO');
    console.log('═══════════════════════════════════════');
    
    const status = await this.getStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    
    const storedToken = await AsyncStorage.getItem(FCM_DEVICE_TOKEN_KEY);
    if (storedToken) {
      console.log('Full stored token:', storedToken);
      console.log('Token length:', storedToken.length);
      console.log('Has colon:', storedToken.includes(':'));
      console.log('Starts with:', storedToken.substring(0, 30));
    } else {
      console.log('No stored token found');
    }
    
    console.log('═══════════════════════════════════════');
  }
}

// Export singleton instance
export default new ExpoPushTokenService();
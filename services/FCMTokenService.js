// services/FCMTokenService.js - PROPER FCM DEVICE TOKEN SERVICE
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const FCM_TOKEN_KEY = 'fcm_device_token';
const TOKEN_LAST_ATTEMPT_KEY = 'fcm_token_last_attempt';
const TOKEN_RETRY_DELAY = 30000; // 30 seconds between retries

class FCMTokenService {
  constructor() {
    this.isFetching = false;
    this.cachedToken = null;
  }

  /**
   * Get FCM Device Push Token (requires Google Play Services)
   * This is what your backend expects!
   */
  async getToken() {
    // Return cached token if available
    if (this.cachedToken) {
      console.log('✅ Using cached FCM Device Token');
      return this.cachedToken;
    }

    // Try to get from storage
    const storedToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
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
        console.log('📱 Requesting notification permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Notification permissions denied');
        this.isFetching = false;
        return null;
      }

      console.log('✅ Notification permissions granted');

      // 2. Get FCM DEVICE TOKEN (NOT Expo Push Token!)
      console.log('📡 Requesting FCM Device Token from Firebase...');
      
      // This requires Google Play Services and google-services.json
      const tokenData = await Notifications.getDevicePushTokenAsync();

      if (tokenData?.data) {
        const token = tokenData.data;
        console.log('✅ FCM Device Token obtained successfully!');
        console.log(`📝 Token type: ${tokenData.type}`);
        console.log(`📝 Token preview: ${token.substring(0, 50)}...`);

        // Store token
        await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
        this.cachedToken = token;

        this.isFetching = false;
        return token;
      } else {
        console.log('⚠️ No FCM token data returned');
        this.isFetching = false;
        return null;
      }

    } catch (error) {
      const errorMessage = error.message || '';
      
      console.log('❌ FCM Device Token fetch error:', errorMessage);
      
      // Handle specific errors
      if (errorMessage.includes('SERVICE_NOT_AVAILABLE')) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  GOOGLE PLAY SERVICES NOT AVAILABLE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('This can happen when:');
        console.log('1. Device just booted (wait 2-5 minutes)');
        console.log('2. Play Services is updating');
        console.log('3. Network connectivity issues');
        console.log('4. Play Services not installed/outdated');
        console.log('');
        console.log('SOLUTIONS:');
        console.log('✅ Wait 2-5 minutes and try again');
        console.log('✅ Restart your device');
        console.log('✅ Update Google Play Services from Play Store');
        console.log('✅ Check internet connection');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else if (errorMessage.includes('TIMEOUT')) {
        console.log('⏱️ Request timed out - network or Play Services issue');
      } else if (errorMessage.includes('INVALID_SENDER_ID')) {
        console.log('❌ Invalid sender ID - check google-services.json');
      } else {
        console.log('💡 Unknown error - may resolve after device restart');
      }

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
    await AsyncStorage.removeItem(FCM_TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_LAST_ATTEMPT_KEY);
    return await this.fetchNewToken(true);
  }

  /**
   * Clear stored token
   */
  async clearToken() {
    try {
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);
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
      return token !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get token status for debugging
   */
  async getStatus() {
    const storedToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    const lastAttempt = await AsyncStorage.getItem(TOKEN_LAST_ATTEMPT_KEY);
    
    return {
      hasToken: !!storedToken,
      hasCachedToken: !!this.cachedToken,
      isFetching: this.isFetching,
      isDevice: Device.isDevice,
      platform: Platform.OS,
      lastAttempt: lastAttempt ? new Date(parseInt(lastAttempt)).toISOString() : null,
      tokenPreview: storedToken ? `${storedToken.substring(0, 50)}...` : null,
      tokenType: 'FCM Device Token (Firebase)',
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
      
      if (token) {
        console.log('✅ FCM token obtained after waiting');
        return token;
      }
      
      console.log(`⏳ Retrying in 10 seconds... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.log('⏱️ Timeout waiting for Google Play Services');
    return null;
  }
}

// Export singleton instance
export default new FCMTokenService(); 
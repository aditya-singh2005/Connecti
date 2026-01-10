// lib/bleutils.js - OPTIMIZED FOR TESTING

/**
 * BLE Default Configuration - TESTING MODE (More Sensitive)
 */
export const BLE_DEFAULTS = {
  // RSSI thresholds (signal strength in dBm) - VERY LENIENT FOR TESTING
  MIN_RSSI_THRESHOLD: -110, // Detect even very weak signals
  PROXIMITY_IMMEDIATE: -60,  // Very close (~0.5-2m)
  PROXIMITY_NEAR: -80,       // Near (~5-15m)
  PROXIMITY_FAR: -100,       // Far (~20-40m)
  
  // Sampling
  RSSI_SAMPLE_SIZE: 2,       // Only 2 readings for faster detection
  
  // Path loss constant for distance calculation
  PATH_LOSS_EXPONENT: 2.0,   // Environment-specific (2.0 = free space)
  REFERENCE_RSSI: -59,       // RSSI at 1 meter distance
};

/**
 * Convert RSSI (signal strength) to approximate distance in meters
 * Uses a simplified log-distance path loss model
 * 
 * @param {number} rssi - Signal strength in dBm
 * @param {number} txPower - Transmission power at 1m (default: -59)
 * @param {number} n - Path loss exponent (default: 2.0)
 * @returns {number} Distance in meters
 */
export function rssiToDistance(rssi, txPower = -59, n = 2.0) {
  if (rssi === 0 || rssi === null || rssi === undefined) {
    return -1; // Invalid RSSI
  }

  // Simplified formula: distance = 10 ^ ((txPower - rssi) / (10 * n))
  const distance = Math.pow(10, (txPower - rssi) / (10 * n));
  
  // Clamp to reasonable values
  if (distance < 0.5) return 0.5; // Minimum 0.5m
  if (distance > 100) return 100; // Maximum 100m
  
  return distance;
}

/**
 * Get proximity level based on RSSI
 * 
 * @param {number} rssi - Signal strength in dBm
 * @returns {string} 'immediate', 'near', 'far', or 'unknown'
 */
export function getProximityLevel(rssi) {
  if (rssi >= BLE_DEFAULTS.PROXIMITY_IMMEDIATE) {
    return 'immediate'; // Very close (~0.5-2m)
  } else if (rssi >= BLE_DEFAULTS.PROXIMITY_NEAR) {
    return 'near'; // Close (~5-15m)
  } else if (rssi >= BLE_DEFAULTS.PROXIMITY_FAR) {
    return 'far'; // Distant (~20-40m)
  } else {
    return 'unknown'; // Very far or weak signal
  }
}

/**
 * Format distance for display
 * 
 * @param {number} distance - Distance in meters
 * @returns {string} Formatted distance string
 */
export function formatDistance(distance) {
  if (distance < 0) return 'Unknown';
  if (distance < 1) return '<1m';
  if (distance < 5) return `${Math.round(distance)}m`;
  if (distance < 10) return `~${Math.round(distance)}m`;
  if (distance < 50) return `~${Math.round(distance / 5) * 5}m`;
  if (distance < 100) return `~${Math.round(distance / 10) * 10}m`;
  return '>100m';
}

/**
 * Check if RSSI is within proximity threshold
 * 
 * @param {number} rssi - Signal strength in dBm
 * @param {number} threshold - RSSI threshold (default: -100 for testing)
 * @returns {boolean} True if within threshold
 */
export function isWithinProximity(rssi, threshold = -100) {
  return rssi >= threshold;
}

/**
 * Smooth RSSI readings using exponential moving average
 * 
 * @param {number} currentRssi - Current RSSI reading
 * @param {number} previousSmoothed - Previous smoothed value
 * @param {number} alpha - Smoothing factor (0-1, default: 0.3)
 * @returns {number} Smoothed RSSI
 */
export function smoothRSSI(currentRssi, previousSmoothed, alpha = 0.3) {
  if (previousSmoothed === null || previousSmoothed === undefined) {
    return currentRssi;
  }
  return alpha * currentRssi + (1 - alpha) * previousSmoothed;
}

/**
 * Generate a unique BLE identifier for a user
 * Uses a hash of the user ID to create a consistent identifier
 * 
 * @param {string} userId - User ID
 * @returns {string} BLE identifier
 */
export function generateBLEIdentifier(userId) {
  // Create a simple hash from user ID
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to positive hex
  const hexHash = Math.abs(hash).toString(16).toUpperCase();
  
  // Take first 8 characters and pad if needed
  const shortId = (hexHash + '00000000').substring(0, 8);
  
  return `BLE_${shortId}`;
}

/**
 * Calculate signal quality percentage (0-100)
 * 
 * @param {number} rssi - Signal strength in dBm
 * @returns {number} Quality percentage
 */
export function getSignalQuality(rssi) {
  // Map RSSI range (-100 to -40) to 0-100%
  const minRssi = -100;
  const maxRssi = -40;
  
  if (rssi <= minRssi) return 0;
  if (rssi >= maxRssi) return 100;
  
  const quality = ((rssi - minRssi) / (maxRssi - minRssi)) * 100;
  return Math.round(quality);
}

/**
 * Get signal quality label
 * 
 * @param {number} rssi - Signal strength in dBm
 * @returns {string} 'Excellent', 'Good', 'Fair', or 'Poor'
 */
export function getSignalQualityLabel(rssi) {
  if (rssi >= -50) return 'Excellent';
  if (rssi >= -60) return 'Good';
  if (rssi >= -70) return 'Fair';
  return 'Poor';
}

/**
 * Estimate battery impact based on scan frequency
 * 
 * @param {number} scanInterval - Scan interval in milliseconds
 * @returns {string} 'Low', 'Medium', or 'High'
 */
export function estimateBatteryImpact(scanInterval) {
  if (scanInterval >= 60000) return 'Low'; // 1+ minute
  if (scanInterval >= 30000) return 'Medium'; // 30s - 1min
  return 'High'; // < 30s
}

/**
 * Validate BLE device ID format
 * 
 * @param {string} deviceId - Device ID to validate
 * @returns {boolean} True if valid
 */
export function isValidBLEDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return false;
  
  // Check for BLE_ prefix and reasonable length
  return deviceId.startsWith('BLE_') && deviceId.length >= 8 && deviceId.length <= 50;
}

/**
 * Calculate average RSSI from history
 * 
 * @param {number[]} rssiHistory - Array of RSSI readings
 * @returns {number} Average RSSI
 */
export function calculateAverageRSSI(rssiHistory) {
  if (!rssiHistory || rssiHistory.length === 0) return null;
  
  const sum = rssiHistory.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / rssiHistory.length);
}

/**
 * Get color for distance visualization
 * 
 * @param {number} distance - Distance in meters
 * @returns {string} Color hex code
 */
export function getDistanceColor(distance) {
  if (distance < 5) return '#4CAF50';   // Green - Very close
  if (distance < 10) return '#8BC34A';  // Light green - Close
  if (distance < 20) return '#FF9800';  // Orange - Medium
  if (distance < 50) return '#F44336';  // Red - Far
  return '#9E9E9E';                      // Gray - Very far
}

/**
 * Get emoji for proximity level
 * 
 * @param {string} proximity - Proximity level
 * @returns {string} Emoji
 */
export function getProximityEmoji(proximity) {
  switch (proximity) {
    case 'immediate': return '🔥';
    case 'near': return '👋';
    case 'far': return '👀';
    default: return '📡';
  }
}

/**
 * Format timestamp for display
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatLastSeen(timestamp) {
  if (!timestamp) return 'Never';
  
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Check if device is stale (not seen recently)
 * 
 * @param {number} lastSeen - Last seen timestamp
 * @param {number} threshold - Stale threshold in milliseconds (default: 20s for testing)
 * @returns {boolean} True if stale
 */
export function isDeviceStale(lastSeen, threshold = 20000) {
  if (!lastSeen) return true;
  return Date.now() - lastSeen > threshold;
}
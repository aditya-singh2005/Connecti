// hooks/useBLENearbyFriends.js - FIXED with Better Matching
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { 
  rssiToDistance, 
  formatDistance, 
  BLE_DEFAULTS 
} from "../lib/bleutils";

/**
 * Calculate similarity between two BLE fingerprints
 * Returns a score from 0-100 based on overlapping MAC addresses
 */
function calculateFingerprintSimilarity(myDevices, friendDevices) {
  if (!myDevices || !friendDevices || myDevices.length === 0 || friendDevices.length === 0) {
    return 0;
  }

  const myMacs = new Set(myDevices.map(d => d.id.toLowerCase()));
  const friendMacs = new Set(friendDevices.map(d => d.id.toLowerCase()));
  
  // Find overlapping devices
  const overlap = [...myMacs].filter(mac => friendMacs.has(mac));
  
  if (overlap.length === 0) {
    return 0;
  }

  // Calculate similarity score based on overlap
  let totalScore = 0;

  for (const mac of overlap) {
    const myDevice = myDevices.find(d => d.id.toLowerCase() === mac);
    const friendDevice = friendDevices.find(d => d.id.toLowerCase() === mac);
    
    if (myDevice && friendDevice) {
      // Both see this device - calculate average RSSI
      const avgRssi = (myDevice.rssi + friendDevice.rssi) / 2;
      // Convert RSSI to score (higher RSSI = better score)
      const rssiScore = Math.max(0, 100 + avgRssi); // -100 dBm = 0, -40 dBm = 60
      totalScore += rssiScore;
    }
  }

  // Normalize score
  const avgScore = totalScore / overlap.length;
  
  // Boost based on number of overlapping devices (more overlaps = more confident)
  const overlapBonus = Math.min(overlap.length * 15, 50); // Up to +50 for many overlaps
  
  const finalScore = Math.min(100, avgScore + overlapBonus);
  
  return finalScore;
}

/**
 * BLE Nearby Friends Hook - OPTIMIZED
 */
export const useBleNearbyFriends = (bleState, options = {}) => {
  const {
    similarityThreshold = 25, // Lower threshold for easier detection
    maxResults = 50,
    autoRefresh = true,
    refreshInterval = 8000, // Check every 8 seconds
  } = options;

  const [nearbyFriends, setNearbyFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const isFetchingRef = useRef(false);

  /**
   * Fetch nearby friends using BLE fingerprint matching
   */
  const fetchNearbyFriends = useCallback(async (currentBleState = bleState) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log("⏭️ Skipping fetch (already in progress)");
      return nearbyFriends;
    }

    if (!currentBleState?.ble_active) {
      console.log("⚠️ BLE not active");
      return [];
    }

    try {
      isFetchingRef.current = true;
      setIsLoading(true);
      setError(null);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log("⚠️ No authenticated user");
        return [];
      }

      console.log("\n🔍 Fetching nearby friends via BLE fingerprinting...");

      // Get friendships
      const { data: friendships, error: friendshipError } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (friendshipError) {
        console.error("❌ Friendship error:", friendshipError);
        setError(friendshipError.message);
        return [];
      }

      if (!friendships || friendships.length === 0) {
        console.log("👥 No friends found");
        setNearbyFriends([]);
        return [];
      }

      const friendIds = friendships.map(f => 
        f.user_id === user.id ? f.friend_id : f.user_id
      );

      console.log(`👥 Checking ${friendIds.length} friends`);

      // Get friend profiles with BLE fingerprints
      const { data: friendProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, contact, ble_device_id, ble_active, ble_last_seen, ble_fingerprint, ble_fingerprint_updated')
        .in('id', friendIds)
        .eq('ble_active', true);

      if (profileError) {
        console.error("❌ Profile error:", profileError);
        setError(profileError.message);
        return [];
      }

      if (!friendProfiles || friendProfiles.length === 0) {
        console.log("📱 No friends with active BLE");
        setNearbyFriends([]);
        setDebugInfo(prev => ({
          ...prev,
          lastFetchTime: new Date().toISOString(),
          friendsChecked: friendIds.length,
          friendsWithBLE: 0,
          similarityThreshold
        }));
        return [];
      }

      console.log(`📱 ${friendProfiles.length} friends have BLE active`);

      // Get my nearby devices
      const myDevices = currentBleState.nearbyDevices || [];
      
      if (myDevices.length === 0) {
        console.log("📡 No devices detected yet");
        setNearbyFriends([]);
        return [];
      }

      console.log(`📡 My BLE fingerprint: ${myDevices.length} devices`);

      // Compare fingerprints
      const processedFriends = [];
      
      for (const friend of friendProfiles) {
        try {
          // Check if fingerprint exists and is not empty
          if (!friend.ble_fingerprint || friend.ble_fingerprint.trim() === '' || friend.ble_fingerprint === '[]') {
            console.log(`  ⚠️ ${friend.name} has no/empty fingerprint - they need to start BLE scanning`);
            continue;
          }

          const friendDevices = JSON.parse(friend.ble_fingerprint);
          
          if (!Array.isArray(friendDevices) || friendDevices.length === 0) {
            console.log(`  ⚠️ ${friend.name} has empty fingerprint array`);
            continue;
          }

          console.log(`\n🔍 Checking: ${friend.name} (${friendDevices.length} devices)`);
          
          // Check fingerprint age (should be recent)
          if (friend.ble_fingerprint_updated) {
            const age = Date.now() - new Date(friend.ble_fingerprint_updated).getTime();
            const ageSeconds = Math.floor(age / 1000);
            console.log(`  ⏱️  Fingerprint age: ${ageSeconds}s`);
            
            if (age > 120000) { // 2 minutes - fingerprint too old
              console.log(`  ⚠️ Fingerprint too old (${ageSeconds}s), skipping`);
              continue;
            }
          }

          // Calculate similarity
          const similarity = calculateFingerprintSimilarity(myDevices, friendDevices);
          
          console.log(`  📊 Similarity: ${similarity.toFixed(1)}% (threshold: ${similarityThreshold}%)`);

          if (similarity < similarityThreshold) {
            console.log(`  ❌ ${friend.name} not nearby (score: ${similarity.toFixed(1)})`);
            continue;
          }

          // Find common devices
          const myMacs = new Set(myDevices.map(d => d.id.toLowerCase()));
          const commonDevices = friendDevices.filter(d => myMacs.has(d.id.toLowerCase()));
          
          console.log(`  🔗 Common devices: ${commonDevices.length}`);

          // Estimate distance from strongest common signal
          let bestRssi = -100;
          let estimatedDistance = 50;
          
          if (commonDevices.length > 0) {
            // Use strongest common signal for distance
            const strongestCommon = commonDevices.reduce((best, current) => 
              current.rssi > best.rssi ? current : best
            );
            
            // Also check my RSSI for same device
            const myDevice = myDevices.find(d => d.id.toLowerCase() === strongestCommon.id.toLowerCase());
            if (myDevice) {
              // Average both RSSIs for more accurate distance
              bestRssi = Math.round((strongestCommon.rssi + myDevice.rssi) / 2);
            } else {
              bestRssi = strongestCommon.rssi;
            }
            
            estimatedDistance = rssiToDistance(bestRssi);
            
            console.log(`  📶 Best RSSI: ${bestRssi} dBm → Distance: ${estimatedDistance.toFixed(1)}m`);
          }

          const distanceFormatted = formatDistance(estimatedDistance);
          const proximity = bestRssi >= -60 ? 'immediate' : bestRssi >= -80 ? 'near' : 'far';

          console.log(`  ✅ ${friend.name} IS NEARBY! Distance: ${distanceFormatted}, Similarity: ${similarity.toFixed(1)}%`);

          processedFriends.push({
            id: friend.id,
            name: friend.name || 'Unknown Friend',
            contact: friend.contact,
            ble_device_id: friend.ble_device_id,
            rssi: bestRssi,
            distance: Math.round(estimatedDistance),
            distanceFormatted,
            proximity,
            lastSeen: Date.now(),
            similarity: Math.round(similarity),
            commonDevices: commonDevices.length,
          });
        } catch (err) {
          console.error(`  ❌ Error processing ${friend.name}:`, err);
        }
      }

      // Sort by similarity (highest first)
      processedFriends.sort((a, b) => b.similarity - a.similarity);

      setNearbyFriends(processedFriends);
      setLastFetch(new Date());
      
      setDebugInfo(prev => ({
        ...prev,
        lastFetchTime: new Date().toISOString(),
        friendsChecked: friendIds.length,
        friendsWithBLE: friendProfiles.length,
        friendsNearby: processedFriends.length,
        similarityThreshold,
        myDeviceCount: myDevices.length
      }));

      console.log(`\n✅ RESULT: Found ${processedFriends.length} nearby friends`);
      if (processedFriends.length > 0) {
        console.log("📋 Nearby friends:");
        processedFriends.forEach(f => 
          console.log(`  - ${f.name}: ${f.distanceFormatted} (${f.similarity}%, ${f.commonDevices} common)`)
        );
      }

      return processedFriends;

    } catch (err) {
      console.error("❌ Error fetching nearby friends:", err);
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [bleState, similarityThreshold, nearbyFriends]);

  // Auto-fetch when BLE state changes
  useEffect(() => {
    if (bleState?.ble_active && bleState?.nearbyDevices?.length > 0 && autoRefresh) {
      fetchNearbyFriends(bleState);
    }
  }, [bleState?.nearbyDevices?.length, bleState?.ble_active]);

  // Periodic refresh
  useEffect(() => {
    if (!autoRefresh || !refreshInterval) return;

    const interval = setInterval(() => {
      if (bleState?.ble_active && bleState?.nearbyDevices?.length > 0) {
        console.log("🔄 Periodic friend check");
        fetchNearbyFriends(bleState);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [bleState, fetchNearbyFriends, autoRefresh, refreshInterval]);

  const refreshNearbyFriends = useCallback(async () => {
    console.log("🔄 Manual friend refresh");
    return await fetchNearbyFriends();
  }, [fetchNearbyFriends]);

  const getFriendById = useCallback((friendId) => {
    return nearbyFriends.find(friend => friend.id === friendId);
  }, [nearbyFriends]);

  const isDataStale = useCallback(() => {
    if (!lastFetch) return true;
    const staleThreshold = refreshInterval * 1.5;
    return Date.now() - lastFetch.getTime() > staleThreshold;
  }, [lastFetch, refreshInterval]);

  const getFriendsByProximity = useCallback((proximity) => {
    return nearbyFriends.filter(friend => friend.proximity === proximity);
  }, [nearbyFriends]);

  return {
    nearbyFriends,
    isLoading,
    lastFetch,
    error,
    debugInfo,
    
    refreshNearbyFriends,
    fetchNearbyFriends,
    
    getFriendById,
    isDataStale,
    formatDistance,
    getFriendsByProximity,
    
    friendCount: nearbyFriends.length,
    hasFriends: nearbyFriends.length > 0
  };
};
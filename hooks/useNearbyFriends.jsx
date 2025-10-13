// hooks/useNearbyFriends.js
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

export const useNearbyFriends = (location, options = {}) => {
  const {
    radius = 1000, // 1km default
    autoRefresh = true,
    refreshInterval = 300000, // 5 minute default
    maxResults = 50
  } = options;

  const [nearbyFriends, setNearbyFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});

  // Function to fetch nearby friends (only accepted friendships)
  const fetchNearbyFriends = useCallback(async (userLocation = location) => {
    if (!userLocation?.latitude || !userLocation?.longitude) {
      console.log("⚠️ No location available for nearby friends fetch");
      return [];
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log("⚠️ No authenticated user for nearby friends fetch");
        return [];
      }

      console.log("🔍 Fetching nearby friends...", {
        exclude_id: user.id,
        radius_m: radius,
        user_lat: userLocation.latitude,
        user_lng: userLocation.longitude,
      });

      // Call the new RPC function that only returns friends
      const { data, error: rpcError } = await supabase.rpc("find_nearby_friends", {
        exclude_id: user.id,
        radius_m: radius,
        user_lat: userLocation.latitude,
        user_lng: userLocation.longitude,
      });

      console.log("📊 Nearby friends RPC response:", {
        data: data,
        error: rpcError,
        count: data?.length || 0
      });

      if (rpcError) {
        console.error("❌ RPC error:", rpcError);
        setError(rpcError.message);
        setDebugInfo(prev => ({
          ...prev,
          rpcError: rpcError.message,
          lastErrorTime: new Date().toISOString()
        }));
        return [];
      }

      // Process and format the data
      const processedFriends = (data || []).map(friend => ({
        id: friend.id,
        name: friend.name || 'Unknown Friend',
        contact: friend.contact,
        latitude: friend.latitude,
        longitude: friend.longitude,
        distance: Math.round(friend.distance_m || 0),
        distanceFormatted: formatDistance(friend.distance_m || 0)
      }));

      setNearbyFriends(processedFriends);
      setLastFetch(new Date());
      setDebugInfo(prev => ({
        ...prev,
        lastFetchTime: new Date().toISOString(),
        friendsCount: processedFriends.length,
        searchRadius: radius,
        searchLocation: `${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`,
        rpcError: null
      }));

      console.log("✅ Nearby friends updated:", processedFriends.length, "friends found");
      return processedFriends;

    } catch (err) {
      console.error("❌ Error fetching nearby friends:", err);
      setError(err.message);
      setDebugInfo(prev => ({
        ...prev,
        fetchError: err.message,
        lastErrorTime: new Date().toISOString()
      }));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [location, radius]);

  // Format distance for display
  const formatDistance = (distanceMeters) => {
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)}m`;
    } else {
      return `${(distanceMeters / 1000).toFixed(1)}km`;
    }
  };

  // Effect to fetch nearby friends when location changes
  useEffect(() => {
    if (location?.latitude && location?.longitude && autoRefresh) {
      console.log("📍 Location updated, fetching nearby friends...");
      fetchNearbyFriends(location);
    }
  }, [location?.latitude, location?.longitude, fetchNearbyFriends, autoRefresh]);

  // Effect for periodic refresh
  useEffect(() => {
    if (!autoRefresh || !refreshInterval) return;

    const interval = setInterval(() => {
      if (location?.latitude && location?.longitude) {
        console.log("🔄 Periodic nearby friends refresh");
        fetchNearbyFriends(location);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [location, fetchNearbyFriends, autoRefresh, refreshInterval]);

  // Manual refresh function
  const refreshNearbyFriends = useCallback(async () => {
    console.log("🔄 Manual nearby friends refresh requested");
    return await fetchNearbyFriends();
  }, [fetchNearbyFriends]);

  // Function to get friend by ID
  const getFriendById = useCallback((friendId) => {
    return nearbyFriends.find(friend => friend.id === friendId);
  }, [nearbyFriends]);

  // Function to check if data is stale
  const isDataStale = useCallback(() => {
    if (!lastFetch) return true;
    const staleThreshold = refreshInterval * 1.5;
    return Date.now() - lastFetch.getTime() > staleThreshold;
  }, [lastFetch, refreshInterval]);

  return {
    // Data
    nearbyFriends,
    isLoading,
    lastFetch,
    error,
    debugInfo,
    
    // Actions
    refreshNearbyFriends,
    fetchNearbyFriends,
    
    // Utils
    getFriendById,
    isDataStale,
    formatDistance,
    
    // Stats
    friendCount: nearbyFriends.length,
    hasFriends: nearbyFriends.length > 0
  };
};
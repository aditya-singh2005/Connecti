import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthProvider";
import { useGeofenceService } from "../../hooks/useGeofenceService";
import { useFriendships } from "../../hooks/useFriendships";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { activeGeofences } = useGeofenceService();
  const { unseenCount } = useFriendships();
  const [isOpenToWave, setIsOpenToWave] = useState(false);

  const fetchWaveStatus = useCallback(async () => {
    if (user?.id) {
      const { data } = await supabase.from('profiles').select('open_to_wave').eq('id', user.id).single();
      if (data) setIsOpenToWave(data.open_to_wave);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchWaveStatus();
  }, [fetchWaveStatus]);

  useFocusEffect(
    useCallback(() => {
      fetchWaveStatus();
    }, [fetchWaveStatus])
  );

  const handleWaveButtonPress = () => {
    if (isOpenToWave) {
      Alert.alert(
        "Stop Waving?",
        "Do you want to stop waving in this zone?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Stop Waving", 
            style: "destructive", 
            onPress: async () => {
              setIsOpenToWave(false);
              if (user?.id) {
                await supabase.from('profiles').update({ open_to_wave: false }).eq('id', user.id);
              }
            } 
          }
        ]
      );
    } else {
      Alert.alert(
        "Start Waving",
        `You are going to wave for the current Connecti zone (${currentHub}).`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Start Waving", 
            onPress: async () => {
              setIsOpenToWave(true);
              if (user?.id) {
                await supabase.from('profiles').update({ open_to_wave: true }).eq('id', user.id);
              }
              router.push('/home/WavesScreen');
            } 
          }
        ]
      );
    }
  };

  const currentHub = activeGeofences && activeGeofences.length > 0 ? activeGeofences[0].name : "Select Citywalk Mall";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: insets.top + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={20} color="#E5E7EB" />
          </View>
          <View>
            <Text style={styles.greetingTitle}>Hi, {user?.user_metadata?.first_name || 'Aditya'}</Text>
            <Text style={styles.greetingSubtitle}>Ready to connect?</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.notificationBtn}
          onPress={() => router.push('/home/FriendRequestsScreen')}
        >
          <Ionicons name="notifications-outline" size={24} color="#111827" />
          {unseenCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unseenCount > 9 ? '9+' : unseenCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.liveIndicator} />
          <Text style={styles.statusLabel}>LIVE STATUS</Text>
        </View>
        <Text style={styles.statusTitle}>Smart Reconnect is Active</Text>
        <Text style={styles.statusDesc}>
          We're looking for reconnection opportunities around you in real-time.
        </Text>
      </View>

      <TouchableOpacity style={styles.hubSelector} onPress={() => router.push('/home/GeofenceTestScreen')}>
        <View style={styles.hubLeft}>
          <View style={styles.hubIconContainer}>
            <Ionicons name="location-outline" size={20} color="#6366F1" />
          </View>
          <View>
            <Text style={styles.hubLabel}>Current Hub</Text>
            <Text style={styles.hubName}>{currentHub}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </TouchableOpacity>

      <View style={styles.waveSection}>
        <TouchableOpacity 
          style={[styles.waveButton, isOpenToWave ? styles.waveButtonActive : styles.waveButtonInactive]} 
          onPress={handleWaveButtonPress}
          activeOpacity={0.8}
        >
          <Ionicons name="water-outline" size={48} color="#FFFFFF" style={{ marginBottom: 8 }} />
          <Text style={styles.waveButtonText}>{isOpenToWave ? "WAVING" : "SEND A WAVE"}</Text>
          {isOpenToWave && <Text style={styles.waveButtonSub}>Tap to manage</Text>}
        </TouchableOpacity>
        <Text style={styles.waveHint}>
          A Wave alerts people you've met before that you're nearby.
        </Text>
      </View>

      <View style={styles.activitySection}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Nearby Activity</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityList}>
          <View style={styles.activityCard}>
            <View style={[styles.activityIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="flash-outline" size={20} color="#D97706" />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityCardTitle}>New Ripples Nearby</Text>
              <Text style={styles.activityCardDesc}>3 people from Tech Conf are in this zone.</Text>
            </View>
            <Text style={styles.activityTime}>2m ago</Text>
          </View>

          <View style={styles.activityCard}>
            <View style={[styles.activityIconBox, { backgroundColor: '#D1FAE5' }]}>
              <Image source={{ uri: 'https://i.pravatar.cc/100?img=5' }} style={styles.activityAvatar} />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityCardTitle}>Priya just Waved</Text>
              <Text style={styles.activityCardDesc}>She is at Blue Tokai, 200m away.</Text>
            </View>
            <TouchableOpacity style={styles.waveBackBtn}>
              <Text style={styles.waveBackText}>WAVE BACK</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            <View style={[styles.activityIconBox, { backgroundColor: '#F3F4F6' }]}>
              <Ionicons name="help" size={20} color="#4B5563" />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityCardTitle}>Curious about who's here?</Text>
              <Text style={styles.activityCardDesc}>Upgrade to Reveal Mode to see names.</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#5C7CFA',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  statusLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusDesc: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    lineHeight: 18,
  },
  hubSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  hubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hubIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  hubName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  waveSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  waveButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  waveButtonInactive: {
    backgroundColor: '#5C7CFA',
  },
  waveButtonActive: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  waveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  waveButtonSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  waveHint: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 40,
  },
  activitySection: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C7CFA',
  },
  activityList: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  activityIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  activityAvatar: {
    width: '100%',
    height: '100%',
  },
  activityContent: {
    flex: 1,
    justifyContent: 'center',
  },
  activityCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  activityCardDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  activityTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  waveBackBtn: {
    backgroundColor: '#5C7CFA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  waveBackText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

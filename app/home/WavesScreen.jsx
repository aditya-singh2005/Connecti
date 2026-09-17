import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthProvider';
import { useGeofenceService } from '../../hooks/useGeofenceService';
import { supabase } from '../../lib/supabase';

// Demo nearby people data
const DEMO_NEARBY = [
  { id: 1, name: 'Sarah Jenkins', desc: 'Stanford Alum • Product', mutual: '3 mutual circles', dist: '5m', img: 'https://i.pravatar.cc/100?img=1' },
  { id: 2, name: 'Leo Miller', desc: 'Design Circle • Co-founder', mutual: '2 mutual circles', dist: '14m', img: 'https://i.pravatar.cc/100?img=11' },
  { id: 3, name: 'Elena R.', desc: 'Tech Conf • Backend', mutual: '1 mutual circle', dist: '22m', img: 'https://i.pravatar.cc/100?img=5' },
];

// Animated pulsing radar mini-view embedded in status card
function RadarMini({ size = 80 }) {
  const pulse1 = useRef(new Animated.Value(0.4)).current;
  const pulse2 = useRef(new Animated.Value(0.2)).current;
  const pulse3 = useRef(new Animated.Value(0.0)).current;

  useEffect(() => {
    const createPulse = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a1 = createPulse(pulse1, 0);
    const a2 = createPulse(pulse2, 500);
    const a3 = createPulse(pulse3, 1000);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      {/* Pulsing rings */}
      {[pulse1, pulse2, pulse3].map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: size * (0.5 + i * 0.25),
            height: size * (0.5 + i * 0.25),
            borderRadius: size,
            borderWidth: 1.5,
            borderColor: '#5C7CFA',
            opacity: p,
          }}
        />
      ))}
      {/* Center dot */}
      <View style={{
        width: size * 0.25,
        height: size * 0.25,
        borderRadius: size,
        backgroundColor: '#5C7CFA',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Ionicons name="person" size={size * 0.13} color="#FFF" />
      </View>
    </View>
  );
}

export default function WavesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { activeGeofences } = useGeofenceService();

  const [isOpenToWave, setIsOpenToWave] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [nearbyPeople] = useState(DEMO_NEARBY);

  const currentHub = activeGeofences?.length > 0 ? activeGeofences[0].name : 'Citywalk Mall';

  // Load initial open_to_wave state
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('open_to_wave').eq('id', user.id).single()
        .then(({ data }) => { if (data) setIsOpenToWave(data.open_to_wave); });
    }
  }, [user]);

  // Countdown timer
  useEffect(() => {
    let interval;
    if (isOpenToWave && !isPaused && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft <= 0 && isOpenToWave) {
      handleStopWave();
    }
    return () => clearInterval(interval);
  }, [isOpenToWave, isPaused, timeLeft]);

  const handleStartWave = async () => {
    setIsOpenToWave(true);
    setTimeLeft(30 * 60);
    setIsPaused(false);
    if (user?.id) await supabase.from('profiles').update({ open_to_wave: true }).eq('id', user.id);
  };

  const handleStopWave = async () => {
    setIsOpenToWave(false);
    setIsPaused(false);
    if (user?.id) await supabase.from('profiles').update({ open_to_wave: false }).eq('id', user.id);
  };

  const handleExtendWave = () => setTimeLeft(prev => prev + 15 * 60);
  const togglePause = () => setIsPaused(p => !p);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── "Send a Wave" screen (open_to_wave = false) ───────────────────────────
  if (!isOpenToWave) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#FFFFFF' }]}>
        <View style={styles.headerSend}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/home/HomeScreen')}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitleSend}>Connecti</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.sendBody}>
          {/* Animated radar circles */}
          <RadarSendAnimation />

          <Text style={styles.sendTitle}>Someone familiar{'\n'}might be nearby</Text>
          <Text style={styles.sendSubtitle}>
            A soft pulsing wave indicates a potential connection in your area. Reach out without sharing your location.
          </Text>

          <TouchableOpacity style={styles.sendWaveBtn} onPress={handleStartWave}>
            <Text style={styles.sendWaveBtnText}>Wave 👋</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.maybeBtn} onPress={() => router.push('/home/HomeScreen')}>
            <Text style={styles.maybeBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.privacyBox}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#5C7CFA" />
          <Text style={styles.privacyText}>
            <Text style={styles.privacyBold}>Privacy focused: </Text>
            Your precise location is never shared. Only mutual signals unlock identity.
          </Text>
        </View>
      </View>
    );
  }

  // ── Active Wave screen (open_to_wave = true) ──────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleStopWave}>
          <Ionicons name="chevron-down" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Active Wave</Text>
            <View style={[styles.greenDot, isPaused && { backgroundColor: '#F59E0B' }]} />
          </View>
          <Text style={styles.headerSubtitle}>📍 {currentHub} • BLE Active</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Status Card with embedded mini radar ── */}
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            {/* Left: timer + status */}
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>WAVE ACTIVE FOR</Text>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(timeLeft)}</Text>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>
              <View style={styles.statusDivider} />
              <View style={styles.statusRow}>
                <View style={styles.greenDotSmall} />
                <Text style={styles.statusDetail}>Broadcasting Anonymously</Text>
              </View>
              <Text style={styles.statusDetailLight}>Within 50m zone</Text>
            </View>

            {/* Right: mini radar animation */}
            <View style={styles.miniRadarContainer}>
              <RadarMini size={84} />
              <Text style={styles.miniRadarLabel}>Scanning…</Text>
            </View>
          </View>
        </View>

        {/* ── Finding reconnections label ── */}
        <View style={styles.findingRow}>
          <View style={styles.findingDot} />
          <Text style={styles.findingText}>Finding potential reconnection moments</Text>
        </View>

        {/* ── Nearby People list ── */}
        <View style={styles.nearbySection}>
          {nearbyPeople.map((person) => (
            <View key={person.id} style={styles.nearbyCard}>
              <View style={styles.nearbyAvatarWrap}>
                <Image source={{ uri: person.img }} style={styles.nearbyAvatar} />
                <View style={styles.nearbyOnlineDot} />
              </View>
              <View style={styles.nearbyInfo}>
                <Text style={styles.nearbyName}>{person.name}</Text>
                <Text style={styles.nearbyDesc}>{person.desc}</Text>
                <View style={styles.nearbyMutualRow}>
                  <Ionicons name="people-outline" size={11} color="#5C7CFA" />
                  <Text style={styles.nearbyMutual}>{person.mutual}</Text>
                </View>
              </View>
              <View style={styles.nearbyRight}>
                <View style={styles.nearbyDistBadge}>
                  <Text style={styles.nearbyDist}>{person.dist}</Text>
                </View>
                <TouchableOpacity style={styles.nearbyWaveBtn}>
                  <Text style={styles.nearbyWaveBtnText}>Wave 👋</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Anonymous placeholder */}
          <View style={[styles.nearbyCard, styles.nearbyCardAnon]}>
            <View style={[styles.nearbyAvatarWrap, { backgroundColor: '#F3F4F6' }]}>
              <Text style={styles.anonQ}>?</Text>
            </View>
            <View style={styles.nearbyInfo}>
              <Text style={styles.nearbyName}>2 Anonymous</Text>
              <Text style={styles.nearbyDesc}>Unknown connections nearby</Text>
            </View>
            <View style={styles.nearbyRight}>
              <TouchableOpacity style={styles.nearbyRevealBtn}>
                <Text style={styles.nearbyRevealText}>Reveal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Floating Bottom Bar */}
      <View style={[styles.floatingBar, { paddingBottom: insets.bottom + 4 }]}>
        <TouchableOpacity style={styles.extendBtn} onPress={handleExtendWave}>
          <Ionicons name="time-outline" size={18} color="#FFF" />
          <Text style={styles.extendBtnText}>Extend +15m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopBtn} onPress={handleStopWave}>
          <Ionicons name="stop-circle-outline" size={18} color="#EF4444" />
          <Text style={styles.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Separate animated radar for Send screen (bigger, decorative)
function RadarSendAnimation() {
  const p1 = useRef(new Animated.Value(0.6)).current;
  const p2 = useRef(new Animated.Value(0.3)).current;
  const p3 = useRef(new Animated.Value(0.0)).current;

  useEffect(() => {
    const createPulse = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a1 = createPulse(p1, 0);
    const a2 = createPulse(p2, 600);
    const a3 = createPulse(p3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.sendRadarContainer}>
      {[p1, p2, p3].map((p, i) => (
        <Animated.View
          key={i}
          style={[styles.sendRing, {
            width: 100 + i * 55,
            height: 100 + i * 55,
            borderRadius: 200,
            opacity: p,
          }]}
        />
      ))}
      {/* Blue dot */}
      <View style={[styles.sendDot, { top: '18%', right: '28%', backgroundColor: '#5C7CFA' }]} />
      <View style={[styles.sendDot, { bottom: '22%', left: '24%', backgroundColor: '#9CA3AF', width: 6, height: 6, borderRadius: 3 }]} />
      {/* Center avatar */}
      <View style={styles.centerAvatarWrap}>
        <View style={styles.avatarTop} />
        <View style={styles.avatarBottom} />
        <Ionicons name="person" size={40} color="#FFF" style={styles.avatarIcon} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FF',
  },

  // ── Send a Wave ──────────────────────────────────────────────────────────
  headerSend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  headerTitleSend: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sendBody: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  sendRadarContainer: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
  },
  sendRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#5C7CFA',
  },
  sendDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarTop: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: '50%',
    backgroundColor: '#E2C4AD',
  },
  avatarBottom: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '50%',
    backgroundColor: '#EBF0FF',
  },
  avatarIcon: {
    zIndex: 10,
    marginTop: 10,
    opacity: 0.8,
  },
  sendTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  sendSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  sendWaveBtn: {
    width: '100%',
    backgroundColor: '#5C7CFA',
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  sendWaveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  maybeBtn: { paddingVertical: 12 },
  maybeBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    margin: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    gap: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  privacyBold: {
    fontWeight: '700',
    color: '#374151',
  },

  // ── Active Wave ──────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  headerTitleContainer: { alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  headerSubtitle: { fontSize: 11, color: '#5C7CFA', fontWeight: '600', marginTop: 2 },
  scrollContent: { paddingHorizontal: 16 },

  // Status Card
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  statusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  timeText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
  },
  liveBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgePaused: { backgroundColor: '#FEF3C7' },
  liveText: { color: '#5C7CFA', fontSize: 10, fontWeight: '700' },
  liveTextPaused: { color: '#D97706' },
  statusDivider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  greenDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  statusDetail: { fontSize: 12, fontWeight: '600', color: '#374151' },
  statusDetailLight: { fontSize: 12, color: '#9CA3AF' },

  // Mini radar inside card
  miniRadarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRadarLabel: {
    fontSize: 10,
    color: '#5C7CFA',
    fontWeight: '600',
    marginTop: 4,
  },

  // Finding reconnections
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  findingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#5C7CFA',
  },
  findingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.1,
  },

  // Nearby People
  nearbySection: { gap: 10 },
  nearbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 12,
  },
  nearbyCardAnon: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  nearbyAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
  },
  nearbyAvatar: { width: 48, height: 48, borderRadius: 24 },
  nearbyOnlineDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  anonQ: { fontSize: 18, fontWeight: '700', color: '#9CA3AF' },
  nearbyInfo: { flex: 1 },
  nearbyName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  nearbyDesc: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  nearbyMutualRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nearbyMutual: { fontSize: 10, color: '#5C7CFA', fontWeight: '600' },
  nearbyRight: { alignItems: 'flex-end', gap: 8 },
  nearbyDistBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  nearbyDist: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  nearbyWaveBtn: {
    backgroundColor: '#5C7CFA',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  nearbyWaveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  nearbyRevealBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  nearbyRevealText: { color: '#5C7CFA', fontSize: 12, fontWeight: '700' },

  // Floating Bottom Bar
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#F3F6FF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  extendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#5C7CFA',
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: '#5C7CFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  extendBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  pauseBtnText: { color: '#4B5563', fontSize: 13, fontWeight: '700' },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  stopBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
});

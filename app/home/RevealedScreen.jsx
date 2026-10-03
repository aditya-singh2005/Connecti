import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelReconnection, fetchMyReconnections } from '../../services/ReconnectionService';

export default function RevealedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams();
  const [session, setSession] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sparkleScale = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(40)).current;
  const coinBounce = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchMyReconnections()
      .then(items => {
        setSession(items.find(item => item.id === sessionId));
        // Start entrance animations
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(sparkleScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
          Animated.timing(cardSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start(() => {
          // Coin bounce after entrance
          Animated.spring(coinBounce, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
        });

        // Pulsing rings
        const pulseRing = (anim, delay) => Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 1800, delay, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();
        pulseRing(ring1, 0);
        pulseRing(ring2, 900);
      })
      .catch(() => {});
  }, [sessionId]);

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading your connection...</Text>
      </View>
    );
  }

  const partner = session.partner || {};
  const name = partner.name || partner.username || 'Your connection';
  const coins = session.base_reward || 50;
  const partnerInitial = name.charAt(0).toUpperCase();

  const cancel = async () => {
    Alert.alert(
      'Cancel Reconnection',
      'Are you sure you want to cancel this reconnection? This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel Reconnection',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelReconnection(session.id);
              router.replace('/home/HomeScreen');
            } catch (error) {
              Alert.alert('Unable to end', error.message);
            }
          },
        },
      ]
    );
  };

  const ring1Scale = ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ring1Opacity = ring1.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.1, 0] });
  const ring2Scale = ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ring2Opacity = ring2.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.1, 0] });
  const coinScale = coinBounce.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['#EEF2FF', '#F5F3FF', '#FAFAFA']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Safe area top padding */}
      <View style={{ paddingTop: insets.top + 16 }} />

      {/* Pulsing rings + Avatar */}
      <View style={styles.avatarWrapper}>
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
        <Animated.View style={[styles.sparkleContainer, { transform: [{ scale: sparkleScale }] }]}>
          <LinearGradient colors={['#6366F1', '#7C3AED']} style={styles.avatarCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={styles.avatarInitial}>{partnerInitial}</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* Header text */}
      <Animated.View style={[styles.headerSection, { transform: [{ translateY: cardSlide }] }]}>
        <View style={styles.reconnectedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#6366F1" />
          <Text style={styles.reconnectedLabel}>RECONNECTED</Text>
        </View>
        <Text style={styles.title}>You found each other!</Text>
        <Text style={styles.subtitle}>
          A mutual recognition — both of you chose to reveal.{'\n'}Your identities are now shared.
        </Text>
      </Animated.View>

      {/* Name card */}
      <Animated.View style={[styles.nameCard, { transform: [{ translateY: cardSlide }] }]}>
        <View style={styles.nameCardLeft}>
          <View style={styles.nameAvatarSmall}>
            <Text style={styles.nameAvatarInitial}>{partnerInitial}</Text>
          </View>
          <View>
            <Text style={styles.nameCardLabel}>Connected with</Text>
            <Text style={styles.nameCardName}>{name}</Text>
          </View>
        </View>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </Animated.View>

      {/* Coins card */}
      <Animated.View style={[styles.coinsCard, { transform: [{ scale: coinScale }, { translateY: cardSlide }] }]}>
        <View style={styles.coinsLeft}>
          <View style={styles.coinIconBox}>
            <Ionicons name="logo-bitcoin" size={22} color="#F59E0B" />
          </View>
          <View>
            <Text style={styles.coinsLabel}>Connecti Coins Earned</Text>
            <Text style={styles.coinsValue}>+{coins} Coins</Text>
          </View>
        </View>
        <View style={styles.coinsBadge}>
          <Ionicons name="sparkles" size={14} color="#6366F1" />
          <Text style={styles.coinsBadgeText}>Reward</Text>
        </View>
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View style={[styles.actionsSection, { transform: [{ translateY: cardSlide }] }]}>
        <TouchableOpacity
          style={styles.chatBtn}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: '/home/ChatConversationScreen',
            params: {
              friendId: partner.id,
              friendName: name,
            },
          })}
        >
          <LinearGradient colors={['#6366F1', '#7C3AED']} style={styles.chatBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="chatbubble-ellipses" size={22} color="#FFF" />
            <Text style={styles.chatBtnText}>Start chatting with {name}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bleBtn}
          activeOpacity={0.8}
          onPress={() => router.push({
            pathname: '/home/BLETestScreen',
            params: { sessionId: session.id, partnerId: partner.id },
          })}
        >
          <Ionicons name="bluetooth" size={18} color="#6366F1" />
          <Text style={styles.bleBtnText}>Verify nearby with BLE · earn 2× coins</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/home/HomeScreen')}>
          <Ionicons name="home-outline" size={16} color="#9CA3AF" />
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Cancel link */}
      <TouchableOpacity onPress={cancel} style={{ paddingBottom: insets.bottom + 16, alignSelf: 'center' }}>
        <Text style={styles.cancelText}>Cancel reconnection</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
    height: 140,
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6366F1',
  },
  sparkleContainer: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  reconnectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  reconnectedLabel: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  nameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  nameCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nameAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameAvatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6366F1',
  },
  nameCardLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    marginBottom: 2,
  },
  nameCardName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  coinsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  coinsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinsLabel: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    marginBottom: 2,
  },
  coinsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
  },
  coinsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coinsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
  },
  actionsSection: {
    paddingHorizontal: 20,
    gap: 10,
    flex: 1,
  },
  chatBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  chatBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  chatBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  bleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  bleBtnText: {
    color: '#6366F1',
    fontWeight: '700',
    fontSize: 13,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  homeBtnText: {
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: 13,
  },
  cancelText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
    paddingTop: 4,
  },
});
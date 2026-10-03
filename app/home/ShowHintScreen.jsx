import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../../context/AuthProvider';
import { supabase } from '../../lib/supabase';
import { cancelReconnection, continueReconnection, fetchMyReconnections } from '../../services/ReconnectionService';

const INDIGO = '#6366F1';
const PURPLE = '#7C3AED';
const BG_COLOR = '#F9FAFB';

export default function ShowHintScreen() {
    const { sessionId, matchId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    
    // Interaction Data (for matchId)
    const [interactionData, setInteractionData] = useState(null);
    const [senderProfile, setSenderProfile] = useState(null);
    const [actionDone, setActionDone] = useState(null); // 'accepted' | 'declined'
    
    // Session Data (for sessionId)
    const [session, setSession] = useState(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(0.92)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const playEntrance = useCallback(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
        ]).start();

        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.06, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [fadeAnim, cardScale, pulseAnim]);

    useEffect(() => {
        (async () => {
            try {
                if (sessionId) {
                    const reconnections = await fetchMyReconnections();
                    setSession(reconnections.find(item => item.id === sessionId));
                    playEntrance();
                } else if (matchId && user?.id) {
                    const { data: interaction, error } = await supabase
                        .from('interactions')
                        .select('*')
                        .eq('id', matchId)
                        .maybeSingle();

                    if (error) throw error;
                    if (interaction) {
                        setInteractionData(interaction);
                        const senderId = interaction.sender_id;
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('id, name, username, bio, city, country')
                            .eq('id', senderId)
                            .maybeSingle();
                        setSenderProfile(profile);
                        playEntrance();
                    }
                    
                    const channel = supabase
                        .channel(`interaction_${matchId}_${user.id.slice(0, 6)}`)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'interactions',
                            filter: `id=eq.${matchId}`,
                        }, (payload) => {
                            if (payload.new) setInteractionData(payload.new);
                        })
                        .subscribe();
                    return () => supabase.removeChannel(channel);
                }
            } catch (error) {
                Alert.alert('Unavailable', error.message || 'This item is no longer available.');
            } finally {
                setLoading(false);
            }
        })();
    }, [sessionId, matchId, user?.id]);

    // POPUPS & HANDLERS
    const confirmReconnectionReveal = () => {
        Alert.alert(
            'Reveal Identity?',
            'Revealing will share your identity with the other user if they also choose to reveal (Mutual Reveal). Proceed?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reveal', onPress: executeReconnectionReveal },
            ]
        );
    };

    const executeReconnectionReveal = async () => {
        if (!session || working) return;
        setWorking(true);
        try {
            const next = await continueReconnection(session.id);
            router.replace({ pathname: next.phase === 'RECONNECTED' ? '/home/RevealedScreen' : '/home/RevealScreen', params: { sessionId: session.id } });
        } catch (error) {
            Alert.alert('Not available', error.message || 'Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const handleReconnectionIgnore = async () => {
        if (!session || working) return;
        setWorking(true);
        try {
            await cancelReconnection(session.id);
            router.replace('/home/HomeScreen');
        } catch (error) {
            Alert.alert('Not available', error.message || 'Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const confirmInteractionReveal = () => {
        Alert.alert(
            'Reveal Identity?',
            'Revealing will share your identity with the other user if they also choose to reveal (Mutual Reveal). Proceed?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reveal', onPress: executeInteractionAccept },
            ]
        );
    };

    const executeInteractionAccept = async () => {
        if (working || actionDone) return;
        setWorking(true);
        try {
            const { error: updateError } = await supabase
                .from('interactions')
                .update({ status: 'accepted' })
                .eq('id', matchId);
            if (updateError) throw updateError;

            const { error: connError } = await supabase
                .from('friendships')
                .insert({ user1_id: interactionData.sender_id, user2_id: interactionData.receiver_id })
                .select()
                .maybeSingle();

            if (connError && !connError.message.includes('duplicate')) {
                console.warn('[ShowHintScreen] connection insert warning:', connError.message);
            }
            setActionDone('accepted');
            setInteractionData(prev => ({ ...prev, status: 'accepted' }));
        } catch (err) {
            Alert.alert('Error', 'Could not accept. Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const handleInteractionDecline = () => {
        Alert.alert('Decline?', "This person won't know you declined.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Decline', style: 'destructive', onPress: async () => {
                if (working || actionDone) return;
                setWorking(true);
                try {
                    await supabase.from('interactions').update({ status: 'ignored' }).eq('id', matchId);
                    setActionDone('declined');
                    setInteractionData(prev => ({ ...prev, status: 'ignored' }));
                } catch (err) {
                    Alert.alert('Error', 'Could not decline. Please try again.');
                } finally {
                    setWorking(false);
                }
            } },
        ]);
    };

    // UI COMPONENTS
    const DemoHints = () => (
        <View style={styles.hintsWrapper}>
            <Text style={styles.hintsTitle}>This user:</Text>
            
            <View style={styles.hintBadge}>
                <View style={styles.hintIconBox}>
                    <Ionicons name="school" size={20} color={PURPLE} />
                </View>
                <Text style={styles.hintBadgeText}>Studies at your education institution</Text>
            </View>

            <View style={styles.hintBadge}>
                <View style={styles.hintIconBox}>
                    <Ionicons name="football" size={20} color={PURPLE} />
                </View>
                <Text style={styles.hintBadgeText}>Likes to play football & listen to music</Text>
            </View>

            <View style={styles.hintBadge}>
                <View style={styles.hintIconBox}>
                    <Ionicons name="male-female" size={20} color={PURPLE} />
                </View>
                <Text style={styles.hintBadgeText}>Matches your gender preference</Text>
            </View>
        </View>
    );

    // RENDER logic
    if (loading) {
        return (
            <View style={styles.centerFill}>
                <ActivityIndicator size="large" color={INDIGO} />
            </View>
        );
    }

    if (!sessionId && !matchId) {
        return (
            <View style={styles.centerFill}>
                <Ionicons name="alert-circle-outline" size={60} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>Not available</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // --- RECONNECTION MODE ---
    if (sessionId) {
        if (!session) {
            return (
                <View style={styles.centerFill}>
                    <Ionicons name="time-outline" size={60} color="#D1D5DB" />
                    <Text style={styles.emptyTitle}>This reconnection is no longer available.</Text>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
                {/* Header Actions */}
                <View style={styles.topNav}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
                        <Ionicons name="close" size={26} color="#4B5563" />
                    </TouchableOpacity>
                </View>

                {/* Main Content (Non-scrollable) */}
                <View style={styles.mainContent}>
                    <View style={styles.artContainer}>
                        <Animated.View style={[styles.mysteryRing, { transform: [{ scale: pulseAnim }] }]}>
                            <Ionicons name="location" size={48} color={INDIGO} />
                        </Animated.View>
                        <Text style={styles.titleMain}>Someone you know might be nearby</Text>
                    </View>

                    <Animated.View style={[styles.hintsBoard, { transform: [{ scale: cardScale }] }]}>
                        <DemoHints />
                    </Animated.View>
                </View>

                {/* Bottom Actions */}
                <View style={styles.bottomBar}>
                    {(session.sender_id === user?.id ? session.sender_revealed : session.receiver_revealed) ? (
                        <View style={[styles.acceptBtn, styles.btnDisabled, { backgroundColor: '#9CA3AF' }]}>
                            <Text style={styles.acceptBtnText}>You have already revealed</Text>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity style={[styles.acceptBtn, working && styles.btnDisabled]} onPress={confirmReconnectionReveal} disabled={working}>
                                {working ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptBtnText}>Reveal Yourself</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.declineBtn, working && styles.btnDisabled]} onPress={handleReconnectionIgnore} disabled={working}>
                                <Text style={styles.declineBtnText}>Ignore</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </Animated.View>
        );
    }

    // --- INTERACTION MODE ---
    if (matchId) {
        if (!interactionData) {
            return (
                <View style={styles.centerFill}>
                    <Ionicons name="alert-circle-outline" size={60} color="#D1D5DB" />
                    <Text style={styles.emptyTitle}>Interaction not found</Text>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (actionDone === 'accepted' || interactionData.status === 'accepted') {
            return (
                <View style={styles.centerFill}>
                    <Animated.View style={[styles.successRing, { transform: [{ scale: pulseAnim }] }]}>
                        <Ionicons name="heart" size={52} color={INDIGO} />
                    </Animated.View>
                    <Text style={styles.successTitle}>It&apos;s a Connection! 🎉</Text>
                    <Text style={styles.successSubtitle}>
                        You and {senderProfile?.name || 'this person'} are now connected.
                    </Text>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => router.push({ pathname: '/home/ChatConversationScreen', params: { friendId: interactionData.sender_id, friendName: senderProfile?.name || 'Connection' } })}>
                        <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
                        <Text style={styles.chatBtnText}>Start Chatting</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/home/HomeScreen')}>
                        <Text style={styles.homeBtnText}>Back to Home</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (actionDone === 'declined' || interactionData.status === 'ignored') {
            return (
                <View style={styles.centerFill}>
                    <View style={styles.declinedRing}>
                        <Ionicons name="close" size={52} color="#9CA3AF" />
                    </View>
                    <Text style={styles.emptyTitle}>Declined</Text>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home/HomeScreen')}>
                        <Text style={styles.backBtnText}>Back to Home</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        const isHint = interactionData.interaction_type === 'hint';
        return (
            <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
                <View style={styles.topNav}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
                        <Ionicons name="close" size={26} color="#4B5563" />
                    </TouchableOpacity>
                </View>

                <View style={styles.mainContent}>
                    <View style={styles.artContainer}>
                        <Animated.View style={[styles.mysteryRing, { transform: [{ scale: pulseAnim }], borderColor: isHint ? PURPLE : INDIGO, backgroundColor: isHint ? '#F5F3FF' : '#EEF2FF' }]}>
                            <Ionicons name={isHint ? 'eye-off' : 'hand-right'} size={48} color={isHint ? PURPLE : INDIGO} />
                        </Animated.View>
                        <Text style={styles.titleMain}>
                            {isHint ? `${senderProfile?.name || 'Someone'} sent you a hint` : `${senderProfile?.name || 'Someone'} waved at you!`}
                        </Text>
                    </View>

                    {isHint && (
                        <Animated.View style={[styles.hintsBoard, { transform: [{ scale: cardScale }] }]}>
                            <DemoHints />
                        </Animated.View>
                    )}
                </View>

                <View style={styles.bottomBar}>
                    <TouchableOpacity style={[styles.acceptBtn, working && styles.btnDisabled]} onPress={confirmInteractionReveal} disabled={working}>
                        {working ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptBtnText}>{isHint ? 'Reveal Yourself' : 'Wave Back! 🌊'}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.declineBtn, working && styles.btnDisabled]} onPress={handleInteractionDecline} disabled={working}>
                        <Text style={styles.declineBtnText}>Not now</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        );
    }
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG_COLOR },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG_COLOR },
    
    topNav: { paddingTop: 60, paddingHorizontal: 20, alignItems: 'flex-start' },
    navButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    
    mainContent: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 20 },
    
    artContainer: { alignItems: 'center', marginBottom: 40 },
    mysteryRing: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: INDIGO, marginBottom: 24 },
    titleMain: { fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center', letterSpacing: -0.5, lineHeight: 34 },
    
    hintsBoard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 6 },
    hintsWrapper: { width: '100%' },
    hintsTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16 },
    
    hintBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    hintIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    hintBadgeText: { fontSize: 15, fontWeight: '500', color: '#374151', flex: 1, lineHeight: 22 },
    
    bottomBar: { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16 },
    acceptBtn: { backgroundColor: INDIGO, paddingVertical: 18, borderRadius: 20, alignItems: 'center', shadowColor: INDIGO, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6, marginBottom: 12 },
    acceptBtnText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
    declineBtn: { paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: 'transparent' },
    declineBtnText: { fontSize: 16, fontWeight: '700', color: '#6B7280' },
    btnDisabled: { opacity: 0.6 },
    
    // Success / Error / Empty States
    successRing: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#EEF2FF', borderWidth: 3, borderColor: INDIGO, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    successTitle: { fontSize: 26, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 10 },
    successSubtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: INDIGO, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 20, marginBottom: 16, width: '100%' },
    chatBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    homeBtn: { paddingVertical: 14, width: '100%', alignItems: 'center' },
    homeBtnText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
    
    declinedRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 10 },
    backBtn: { backgroundColor: '#F3F4F6', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16, width: '100%', alignItems: 'center', marginTop: 10 },
    backBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' }
});

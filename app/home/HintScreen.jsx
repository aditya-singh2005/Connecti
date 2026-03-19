// app/home/HintScreen.jsx — Mutual Reveal Flow
// States: loading → mystery (hint) → waiting_for_partner → fully_revealed → skipped

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    Alert,
    ScrollView,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthProvider';

const { width } = Dimensions.get('window');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Utility: Fire-and-forget Expo push ───────────────────────────────────────
async function sendExpoPush({ to, title, body, data = {} }) {
    if (!to || !to.startsWith('ExponentPushToken')) return;
    try {
        await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                to, title, body, data,
                sound: 'default', priority: 'high', channelId: 'geofence-alerts',
            }),
        });
    } catch (e) {
        console.warn('[HintScreen] Push failed:', e.message);
    }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HintScreen() {
    const { matchId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [matchData, setMatchData] = useState(null);
    const [partnerProfile, setPartnerProfile] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [showRewardModal, setShowRewardModal] = useState(false); // State for coin reward modal

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(0.93)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef(null);

    // ── Computed flags ─────────────────────────────────────────────────────────
    const amIUser1 = matchData?.user1_id === user?.id;
    const myRevealed = amIUser1 ? matchData?.user1_revealed : matchData?.user2_revealed;
    const partnerRevealed = amIUser1 ? matchData?.user2_revealed : matchData?.user1_revealed;
    // ✅ Reveal is full if BOTH revealed OR revealed_at is set
    const isFullyRevealed = (!!matchData?.user1_revealed && !!matchData?.user2_revealed) || !!matchData?.revealed_at;
    const isSkipped = !!matchData?.skipped_by || !!matchData?.skipped_at;

    // Flip animation logic
    const flipRotation = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (isFullyRevealed) {
            Animated.spring(flipRotation, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        }
    }, [isFullyRevealed]);

    const frontInterpolate = flipRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });
    const backInterpolate = flipRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '360deg'],
    });

    const frontAnimatedStyle = {
        transform: [{ rotateY: frontInterpolate }, { scale: cardScale }],
        opacity: flipRotation.interpolate({
            inputRange: [0, 0.5, 0.51, 1],
            outputRange: [1, 1, 0, 0]
        }),
        zIndex: isFullyRevealed ? 0 : 1
    };

    const backAnimatedStyle = {
        transform: [{ rotateY: backInterpolate }, { scale: cardScale }],
        opacity: flipRotation.interpolate({
            inputRange: [0, 0.5, 0.51, 1],
            outputRange: [0, 0, 1, 1]
        }),
        zIndex: isFullyRevealed ? 1 : 0
    };

    // ── Animations ─────────────────────────────────────────────────────────────
    const playEntrance = useCallback(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 360, useNativeDriver: true }),
            Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 42, useNativeDriver: true }),
        ]).start();
    }, []);

    // Pulse the "?" only while in mystery state
    useEffect(() => {
        if (!isFullyRevealed && !isSkipped) {
            pulseLoop.current = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.11, duration: 850, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 850, useNativeDriver: true }),
                ])
            );
            pulseLoop.current.start();
        } else {
            pulseLoop.current?.stop();
            pulseAnim.setValue(1);
        }
        return () => pulseLoop.current?.stop();
    }, [isFullyRevealed, isSkipped]);

    // ── Data layer ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!matchId || !user?.id) return;
        fetchMatchDetails(true);

        // Supabase Realtime — instant updates
        const channel = supabase
            .channel(`hint_${matchId}_${user.id.slice(0, 6)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'wave_notification_logs',
                filter: `id=eq.${matchId}`,
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    setMatchData(prev => ({ ...prev, skipped_by: 'deleted', skipped_at: new Date().toISOString() }));
                    return;
                }
                if (payload.new) setMatchData(payload.new);
            })
            .subscribe();

        // Polling fallback — 4s
        const poll = setInterval(() => fetchMatchDetails(false), 4000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
        };
    }, [matchId, user?.id]);

    const fetchMatchDetails = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);

            const { data: log, error } = await supabase
                .from('wave_notification_logs')
                .select('*')
                .eq('id', matchId)
                .maybeSingle();

            if (error) throw error;
            setMatchData(log);

            // Partner profile — fetch once; re-use on polls
            const partnerId = log.user1_id === user.id ? log.user2_id : log.user1_id;
            if (!partnerProfile || partnerProfile.id !== partnerId) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, name, bio, city, username')
                    .eq('id', partnerId)
                    .maybeSingle();
                setPartnerProfile(profile);
            }

            playEntrance();
        } catch (err) {
            console.error('[HintScreen] fetch error:', err.message);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    // ── Reveal handler ─────────────────────────────────────────────────────────
    const handleReveal = async () => {
        if (myRevealed || actionLoading) return;
        setActionLoading(true);
        try {
            console.log('[HintScreen] 👁️ Calling reveal_match RPC...');
            const { data: revealResult, error } = await supabase
                .rpc('reveal_match', {
                    match_id: matchId,
                    user_id: user.id
                });

            if (error) throw error;
            console.log('[HintScreen] ✅ RPC Result:', revealResult);

            // Show the custom reward modal immediately after successful reveal
            setShowRewardModal(true);

        } catch (err) {
            Alert.alert('Error', 'Could not reveal. Please try again.');
            console.error('[HintScreen] reveal error:', err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // ── Skip handler (works from BOTH mystery AND revealed state) ──────────────
    const handleSkip = () => {
        Alert.alert(
            'Skip this moment?',
            'This will end the connection for both of you.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Skip', style: 'destructive', onPress: confirmSkip },
            ]
        );
    };

    const confirmSkip = async () => {
        if (actionLoading) return;
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('wave_notification_logs')
                .update({
                    skipped_by: user.id,
                    skipped_at: new Date().toISOString(),
                })
                .eq('id', matchId);

            if (error) throw error;

            // Notify the other person immediately
            const partnerToken = amIUser1
                ? matchData?.user2_expo_push_token
                : matchData?.user1_expo_push_token;

            await sendExpoPush({
                to: partnerToken,
                title: '🌫️ Moment Passed',
                body: 'The other person skipped this moment.',
                data: { type: 'skipped', matchId },
            });

            // Show "skipped" to ourselves immediately too (don't wait for realtime)
            setMatchData(prev => ({ ...prev, skipped_by: user.id, skipped_at: new Date().toISOString() }));
        } catch (err) {
            Alert.alert('Error', 'Could not skip. Please try again.');
            console.error('[HintScreen] skip error:', err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <ActivityIndicator size="large" color={INDIGO} />
            </View>
        );
    }

    if (isSkipped) {
        const amISkipper = matchData?.skipped_by === user?.id;
        return (
            <View style={styles.centerFill}>
                <View style={[styles.avatarRingMystery, { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="close" size={54} color="#EF4444" />
                </View>
                <Text style={styles.titleMain}>Moment Passed 🌫️</Text>
                <Text style={styles.titleSub}>
                    {amISkipper ? "You skipped this moment." : "The other person skipped this moment."}
                </Text>



                <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                    <Text style={styles.closeBtnText}>Back to Home</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── COMBINED RENDER (Mystery & Revealed with Flip) ─────────────────────────
    return (
        <Animated.ScrollView
            style={styles.container}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
            </View>

            {/* Zone badge */}
            <View style={styles.zoneBadge}>
                <Ionicons name="location" size={12} color="#6366F1" />
                <Text style={styles.zoneBadgeText}>{matchData?.zone_name || 'Nearby Zone'}</Text>
            </View>

            <Text style={styles.titleMain}>
                {isFullyRevealed ? "It's a Match! 🎉" : "Someone waved at you 👋"}
            </Text>
            <Text style={styles.titleSub}>
                {isFullyRevealed ? "You both revealed yourself" : "Both must reveal to see each other"}
            </Text>

            <View style={styles.cardContainer}>
                {/* --- FRONT SIDE (Mystery) --- */}
                <Animated.View style={[
                    styles.card,
                    isFullyRevealed ? styles.cardAbsolute : styles.cardRelative,
                    frontAnimatedStyle
                ]}>
                    <Animated.View style={[styles.avatarRingMystery, { transform: [{ scale: pulseAnim }] }]}>
                        <View style={styles.avatarInnerMystery}>
                            <Text style={styles.qMark}>?</Text>
                        </View>
                    </Animated.View>

                    <Text style={styles.mysteryLabel}>Anonymous Person</Text>

                    <View style={styles.hintsWrap}>
                        <Text style={styles.hintsHeading}>HINTS</Text>
                        <View style={styles.hintPill}>
                            <Ionicons name="person-circle-outline" size={18} color="#6366F1" />
                            <Text style={styles.hintText} numberOfLines={2}>
                                {partnerProfile?.bio?.trim() || 'No bio available'}
                            </Text>
                        </View>
                        {partnerProfile?.city ? (
                            <View style={styles.hintPill}>
                                <Ionicons name="location-outline" size={18} color="#10B981" />
                                <Text style={styles.hintText}>{partnerProfile.city}</Text>
                            </View>
                        ) : null}
                    </View>

                    {!myRevealed ? (
                        <TouchableOpacity
                            style={[styles.revealBtn, actionLoading && { opacity: 0.6 }]}
                            onPress={handleReveal}
                            disabled={actionLoading}
                            activeOpacity={0.85}
                        >
                            {actionLoading
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <>
                                    <Ionicons name="eye" size={20} color="#FFF" />
                                    <Text style={styles.revealBtnText}>Reveal Myself</Text>
                                </>
                            }
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.revealedConfirmBox}>
                            <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                            <Text style={styles.revealedConfirmText}>
                                You revealed! Waiting for the other person…
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={actionLoading}>
                        <Text style={styles.skipBtnText}>Skip this moment</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* --- BACK SIDE (Revealed) --- */}
                <Animated.View style={[
                    styles.card,
                    !isFullyRevealed ? styles.cardAbsolute : styles.cardRelative,
                    backAnimatedStyle
                ]}>
                    {isFullyRevealed && (
                        <>
                            <View style={styles.revealBanner}>
                                <Text style={styles.revealBannerText}>🎉  It's a Match!</Text>
                            </View>

                            <View style={styles.avatarRingRevealed}>
                                <View style={styles.avatarInnerRevealed}>
                                    <Text style={styles.avatarInitial}>{(partnerProfile?.name || 'M').charAt(0).toUpperCase()}</Text>
                                </View>
                            </View>

                            <Text style={styles.revealName}>{partnerProfile?.name || 'Mystery Person'}</Text>
                            {partnerProfile?.username ? <Text style={styles.revealUsername}>@{partnerProfile.username}</Text> : null}
                            {partnerProfile?.bio ? <Text style={styles.revealBio}>{partnerProfile.bio}</Text> : null}
                            {partnerProfile?.city ? (
                                <View style={styles.locationRow}>
                                    <Ionicons name="location" size={14} color="#6366F1" />
                                    <Text style={styles.locationText}>{partnerProfile.city}</Text>
                                </View>
                            ) : null}

                            <Text style={styles.zoneMeta}>📍 Met in {matchData?.zone_name || 'a nearby zone'}</Text>

                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    style={styles.chatBtnHalf}
                                    onPress={() => router.push({ pathname: '/home/ChatConversationScreen', params: { friendId: partnerProfile?.id } })}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="chatbubbles" size={20} color="#FFF" />
                                    <Text style={styles.chatBtnText}>Chat</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.skipBtnHalf}
                                    onPress={handleSkip}
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? <ActivityIndicator size="small" color="#9CA3AF" /> : <Text style={styles.skipBtnHalfText}>Skip</Text>}
                                </TouchableOpacity>
                            </View>

                            <View style={styles.offerCard}>
                                <View style={styles.offerTopRow}>
                                    <View style={styles.offerIconWrap}>
                                        <MaterialCommunityIcons name="coffee" size={26} color="#D97706" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.offerTitle}>Café X  •  Nearby</Text>
                                        <Text style={styles.offerSubtitle}>Grab a coffee together.</Text>
                                    </View>
                                </View>
                                <View style={styles.discountBadge}>
                                    <Text style={styles.discountPct}>20% OFF</Text>
                                    <Text style={styles.discountDesc}>Show this to redeem reward 🎁</Text>
                                </View>
                            </View>
                        </>
                    )}
                </Animated.View>
            </View>

            {/* Reward Modal */}
            <Modal
                transparent={true}
                visible={showRewardModal}
                animationType="fade"
                onRequestClose={() => setShowRewardModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalIconRing}>
                            <Text style={{ fontSize: 44 }}>🪙</Text>
                        </View>
                        <Text style={styles.modalTitle}>+100 Connecti Coins!</Text>
                        <Text style={styles.modalBody}>
                            You earned 100 coins for revealing!{"\n"}
                            We'll let you know if it's a match.{"\n\n"}
                            #HappyReconnections 
                        </Text>
                        <TouchableOpacity style={styles.modalBtn} onPress={() => setShowRewardModal(false)}>
                            <Text style={styles.modalBtnText}>Awesome!</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </Animated.ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const INDIGO = '#6366F1';
const INDIGO_LIGHT = '#EEF2FF';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F3FF',
    },
    scrollContent: {
        paddingBottom: 60,
        alignItems: 'center',
    },
    cardContainer: {
        width: width - 36,
        // Removed fixed height; now it adapts to the relative child
        alignItems: 'center',
    },
    cardRelative: {
        position: 'relative',
        backfaceVisibility: 'hidden',
    },
    cardAbsolute: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backfaceVisibility: 'hidden',
    },

    // ── Full-screen center states (Skipped / Loading) ──
    centerFill: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    closeBtn: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        backgroundColor: '#FFF',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    closeBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
    loadingText: {
        fontSize: 15,
        color: INDIGO,
        fontWeight: '600',
    },
    endTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#374151',
        textAlign: 'center',
        marginTop: 8,
    },
    endSubtitle: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
        lineHeight: 21,
    },
    endButton: {
        marginTop: 8,
        backgroundColor: INDIGO,
        paddingVertical: 13,
        paddingHorizontal: 32,
        borderRadius: 14,
    },
    endButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

    // ── Shared Header ──
    header: {
        width: '100%',
        paddingTop: 58,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    backBtn: {
        alignSelf: 'flex-start',
        padding: 9,
        borderRadius: 18,
        backgroundColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
        elevation: 3,
    },

    // ── Mystery zone badge + title ──
    zoneBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: INDIGO_LIGHT,
        paddingHorizontal: 13,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 14,
    },
    zoneBadgeText: { fontSize: 12, color: INDIGO, fontWeight: '600' },

    titleMain: {
        fontSize: 25,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 5,
    },
    titleSub: {
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 28,
    },

    // ── Shared card ──
    card: {
        width: width - 36,
        backgroundColor: '#FFF',
        borderRadius: 26,
        padding: 26,
        alignItems: 'center',
        shadowColor: INDIGO,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.13,
        shadowRadius: 18,
        elevation: 7,
    },

    // ── Mystery avatar ──
    avatarRingMystery: {
        width: 124,
        height: 124,
        borderRadius: 62,
        backgroundColor: INDIGO_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 2.5,
        borderColor: INDIGO,
        borderStyle: 'dashed',
    },
    avatarInnerMystery: {
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: '#C7D2FE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    qMark: { fontSize: 54, fontWeight: '900', color: INDIGO },
    mysteryLabel: {
        fontSize: 17,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 18,
    },

    // ── Hints ──
    hintsWrap: { width: '100%', gap: 10, marginBottom: 18 },
    hintsHeading: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9CA3AF',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    hintPill: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        gap: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    hintText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },

    // ── Status row ──
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 22,
    },
    statusDot: { width: 9, height: 9, borderRadius: 5 },
    statusText: { fontSize: 13, color: '#6B7280', fontWeight: '500', flex: 1 },

    // ── Reveal button ──
    revealBtn: {
        width: '100%',
        backgroundColor: INDIGO,
        paddingVertical: 16,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 11,
        shadowColor: INDIGO,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 10,
        elevation: 6,
    },
    revealBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

    // ── Already revealed confirmation ──
    revealedConfirmBox: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#ECFDF5',
        borderRadius: 13,
        padding: 13,
        marginBottom: 11,
        borderWidth: 1,
        borderColor: '#6EE7B7',
    },
    revealedConfirmText: { flex: 1, fontSize: 13, color: '#065F46', fontWeight: '600' },

    // ── Skip (mystery state) ──
    skipBtn: { paddingVertical: 11, alignItems: 'center' },
    skipBtnText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },

    // ── REVEALED STATE ──────────────────────────────── ──
    revealBanner: {
        backgroundColor: INDIGO_LIGHT,
        paddingHorizontal: 22,
        paddingVertical: 9,
        borderRadius: 20,
        marginBottom: 22,
    },
    revealBannerText: {
        fontSize: 17,
        fontWeight: '800',
        color: INDIGO,
        textAlign: 'center',
    },
    avatarRingRevealed: {
        width: 124,
        height: 124,
        borderRadius: 62,
        backgroundColor: INDIGO_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 3,
        borderColor: INDIGO,
    },
    avatarInnerRevealed: {
        width: 106,
        height: 106,
        borderRadius: 53,
        backgroundColor: INDIGO,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: { fontSize: 52, fontWeight: '900', color: '#FFF' },
    revealName: {
        fontSize: 26,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 3,
        textAlign: 'center',
    },
    revealUsername: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 10,
    },
    revealBio: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 10,
        paddingHorizontal: 6,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
    },
    locationText: { fontSize: 14, color: INDIGO, fontWeight: '600' },
    // ── Zone info ──
    zoneMeta: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 16 },

    // ── Action Row (Chat / Skip) ──
    actionRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
        marginBottom: 16,
    },
    chatBtnHalf: {
        flex: 1,
        backgroundColor: INDIGO,
        paddingVertical: 14,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        elevation: 4,
        shadowColor: INDIGO,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    chatBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
    skipBtnHalf: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        paddingVertical: 14,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    skipBtnHalfText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },

    // ── Cafe offer card ──
    offerCard: {
        width: '100%',
        backgroundColor: '#FFFBEB',
        borderRadius: 18,
        padding: 16,
        marginTop: 6,
        borderWidth: 1.5,
        borderColor: '#FDE68A',
        gap: 12,
    },
    offerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    offerIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    offerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#92400E',
        marginBottom: 2,
    },
    offerSubtitle: {
        fontSize: 12,
        color: '#B45309',
        lineHeight: 17,
    },
    discountBadge: {
        backgroundColor: '#FEF08A',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    discountPct: {
        fontSize: 20,
        fontWeight: '900',
        color: '#92400E',
    },
    discountDesc: {
        flex: 1,
        fontSize: 12,
        color: '#78350F',
        lineHeight: 17,
        fontWeight: '600',
    },

    // Removed full-width chat and skip buttons in favor of halves

    // ── Reward Modal ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    modalIconRing: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#FDE68A',
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#D97706',
        marginBottom: 8,
    },
    modalBody: {
        fontSize: 15,
        color: '#4B5563',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    modalBtn: {
        width: '100%',
        backgroundColor: INDIGO,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    modalBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
});

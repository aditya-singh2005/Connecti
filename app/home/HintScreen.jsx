import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Animated, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthProvider';

const { width, height } = Dimensions.get('window');

export default function HintScreen() {
    const { matchId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [matchData, setMatchData] = useState(null);
    const [partnerProfile, setPartnerProfile] = useState(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.95)).current;
    const celebrationScale = useRef(new Animated.Value(0)).current;
    const celebrationOpacity = useRef(new Animated.Value(0)).current;
    const confettiAnim = useRef(new Animated.Value(0)).current;

    const amIUser1 = matchData?.user1_id === user.id;
    const myRevealed = amIUser1 ? matchData?.user1_revealed : matchData?.user2_revealed;
    const partnerRevealed = amIUser1 ? matchData?.user2_revealed : matchData?.user1_revealed;
    const skipped = matchData?.skipped_by || matchData?.deleted;
    const isFullyRevealed = myRevealed && partnerRevealed && !skipped;

    useEffect(() => {
        if (!matchId || !user) return;
        fetchMatchDetails();

        // 🚀 Realtime Sync - Instant Response
        const channel = supabase
            .channel(`hint_sync_${matchId}_${user.id.slice(0, 5)}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'wave_notification_logs',
                    filter: `id=eq.${matchId}`
                },
                (payload) => {
                    console.log('⚡ [SYNC] Realtime Update:', payload.eventType);

                    if (payload.eventType === 'DELETE') {
                        setMatchData(prev => ({ ...prev, deleted: true }));
                        return;
                    }

                    if (payload.new) {
                        syncDataWithCelebration(payload.new);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    console.warn('Realtime channel error, falling back to polling');
                }
            });

        // 🔄 Polling Fallback - Catch misses (Every 5s)
        const pollInterval = setInterval(() => {
            fetchMatchDetails(false);
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [matchId, user]);

    const syncDataWithCelebration = (newData) => {
        setMatchData(prev => {
            if (!prev) return newData;

            // Detect transition to fully revealed
            const wasFull = (prev.user1_revealed && prev.user2_revealed);
            const isNowFull = (newData.user1_revealed && newData.user2_revealed);

            if (!wasFull && isNowFull && !newData.skipped_by) {
                console.log('🎉 [VAR] MATCH ACTIVATED!');
                setTimeout(() => triggerCelebration(), 100);
            }
            return newData;
        });
    };

    const triggerCelebration = () => {
        console.log('🎊 Starting celebration animation');
        Animated.parallel([
            Animated.spring(celebrationScale, {
                toValue: 1,
                friction: 6,
                tension: 40,
                useNativeDriver: true,
            }),
            Animated.timing(celebrationOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.timing(confettiAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(confettiAnim, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    };

    const fetchMatchDetails = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data: log, error } = await supabase
                .from('wave_notification_logs')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Record missing/deleted
                    setMatchData(prev => ({ ...prev, deleted: true }));
                    return;
                }
                throw error;
            }

            syncDataWithCelebration(log);

            // Fetch Partner Profile if missing
            if (!partnerProfile) {
                const partnerId = log.user1_id === user.id ? log.user2_id : log.user1_id;
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, name, username, bio, city, avatar_url')
                    .eq('id', partnerId)
                    .single();

                if (!profileError) setPartnerProfile(profile);
            }

            if (showLoading) {
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                    Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
                ]).start();
            }
        } catch (err) {
            console.error('Error fetching match details:', err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleReveal = async () => {
        if (myRevealed || skipped) return;

        try {
            // Optimistic update
            setMatchData(prev => ({
                ...prev,
                [amIUser1 ? 'user1_revealed' : 'user2_revealed']: true
            }));

            const { error } = await supabase.rpc('reveal_match', {
                match_id: matchId,
                user_id: user.id
            });
            if (error) throw error;
        } catch (err) {
            console.error('Reveal failed:', err);
            fetchMatchDetails(false);
            Alert.alert('Error', 'Failed to reveal. Please try again.');
        }
    };

    const handleSkip = async () => {
        try {
            // Optimistic skip
            setMatchData(prev => ({ ...prev, skipped_by: user.id }));

            const { error } = await supabase.rpc('skip_match', {
                match_id_in: matchId,
                user_id_in: user.id
            });
            if (error) throw error;
            router.back();
        } catch (err) {
            console.error('Skip failed:', err);
            fetchMatchDetails(false);
            Alert.alert('Error', 'Failed to skip. Please try again.');
        }
    };

    const handleStartChat = () => {
        if (partnerProfile) {
            router.push({
                pathname: '/chat/conversation',
                params: {
                    friendId: partnerProfile.id,
                    friendName: partnerProfile.name || partnerProfile.username || 'Friend',
                    friendAvatar: partnerProfile.avatar_url
                }
            });
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                    <Ionicons name="heart-circle" size={64} color="#6366F1" />
                    <Text style={styles.loadingText}>Connecting...</Text>
                </Animated.View>
            </View>
        );
    }

    if (skipped) {
        const skippedByMe = matchData?.skipped_by === user.id;
        return (
            <View style={styles.container}>
                <View style={[styles.background, { backgroundColor: '#9CA3AF' }]} />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="close" size={28} color="#111827" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: '#111827' }]}>Moment Expired</Text>
                </View>
                <View style={styles.content}>
                    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#E5E7EB', borderColor: '#D1D5DB' }]}>
                            <Ionicons name="time-outline" size={48} color="#9CA3AF" />
                        </View>
                        <View style={styles.infoContainer}>
                            <Text style={styles.hintTitle}>Connection Dissolved</Text>
                            <Text style={styles.bioText}>
                                {skippedByMe ? "You skipped this moment." : "This connection moment has passed."}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.skipButton} onPress={() => router.back()}>
                            <Text style={styles.skipButtonText}>Back to Home</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.background, { backgroundColor: isFullyRevealed ? '#EEF2FF' : '#6366F1' }]} />

            {isFullyRevealed && (
                <Animated.View style={[styles.confettiContainer, { opacity: confettiAnim }]}>
                    <Text style={styles.confetti}>🎉</Text>
                    <Text style={styles.confetti}>✨</Text>
                    <Text style={styles.confetti}>💫</Text>
                    <Text style={styles.confetti}>🎊</Text>
                </Animated.View>
            )}

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="close" size={28} color={isFullyRevealed ? "#111827" : "#FFFFFF"} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: isFullyRevealed ? "#111827" : "#FFFFFF" }]}>
                    {isFullyRevealed ? "It's a Match! 🎉" : "Someone Nearby 🫣"}
                </Text>
            </View>

            <View style={styles.content}>
                <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                    <View style={styles.avatarContainer}>
                        {isFullyRevealed ? (
                            <Animated.View style={{ transform: [{ scale: celebrationScale }], opacity: celebrationOpacity }}>
                                <Image
                                    source={{ uri: partnerProfile?.avatar_url || 'https://via.placeholder.com/150' }}
                                    style={styles.avatar}
                                />
                                <View style={styles.matchBadge}>
                                    <Ionicons name="heart" size={20} color="#FFFFFF" />
                                </View>
                            </Animated.View>
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons name="person" size={48} color="#FFFFFF" />
                                <View style={styles.questionMark}>
                                    <Text style={styles.questionText}>?</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.infoContainer}>
                        {isFullyRevealed ? (
                            <>
                                <Text style={styles.revealedName}>{partnerProfile?.name || "Unknown"}</Text>
                                <View style={styles.locationRow}>
                                    <Ionicons name="location" size={16} color="#6366F1" />
                                    <Text style={styles.locationText}>{partnerProfile?.city || "Nearby"}</Text>
                                </View>
                                <Text style={styles.bioText} numberOfLines={3}>{partnerProfile?.bio || "No bio available"}</Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.hintTitle}>Anonymous Hints</Text>
                                <View style={styles.hintCard}>
                                    <View style={styles.hintIconContainer}>
                                        <Ionicons name="location-outline" size={20} color="#6366F1" />
                                    </View>
                                    <View style={styles.hintTextContainer}>
                                        <Text style={styles.hintLabel}>Location</Text>
                                        <Text style={styles.hintValue}>{partnerProfile?.city || "Unknown"}</Text>
                                    </View>
                                </View>
                                <View style={styles.hintCard}>
                                    <View style={styles.hintIconContainer}>
                                        <Ionicons name="chatbubble-outline" size={20} color="#6366F1" />
                                    </View>
                                    <View style={styles.hintTextContainer}>
                                        <Text style={styles.hintLabel}>About</Text>
                                        <Text style={styles.hintValue} numberOfLines={2}>
                                            {partnerProfile?.bio ? `"${partnerProfile.bio.slice(0, 50)}..."` : "Mysterious vibe..."}
                                        </Text>
                                    </View>
                                </View>
                            </>
                        )}
                    </View>

                    <View style={styles.actionContainer}>
                        {isFullyRevealed ? (
                            <>
                                <TouchableOpacity style={styles.chatButton} onPress={handleStartChat}>
                                    <Ionicons name="chatbubbles" size={22} color="#FFFFFF" />
                                    <Text style={styles.buttonText}>Start Chat 💬</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.skipButton, { marginTop: 12 }]} onPress={handleSkip}>
                                    <Text style={styles.skipButtonText}>Dismiss Moment</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {myRevealed ? (
                                    <View style={styles.waitingContainer}>
                                        <Ionicons name="hourglass-outline" size={28} color="#6366F1" />
                                        <Text style={styles.waitingTitle}>Waiting for connection...</Text>
                                        <Text style={styles.waitingSubtitle}>
                                            {partnerRevealed ? "They revealed! Reveal incoming... confetti ready! 🎊" : "They've been notified. Stay tuned!"}
                                        </Text>
                                    </View>
                                ) : (
                                    <>
                                        <TouchableOpacity style={styles.revealButton} onPress={handleReveal}>
                                            <Ionicons name="eye-outline" size={24} color="#FFFFFF" />
                                            <Text style={styles.buttonText}>Reveal My Interest</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                                            <Text style={styles.skipButtonText}>Maybe Later</Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.helperText, { marginTop: 12 }]}>
                                            {partnerRevealed ? "🎯 They revealed! Match is 1 tap away!" : "💡 Mutual interest reveals actual profiles"}
                                        </Text>
                                    </>
                                )}
                            </>
                        )}
                    </View>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
    loadingText: { marginTop: 16, fontSize: 16, color: '#6366F1', fontWeight: '600' },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.35 },
    confettiContainer: { position: 'absolute', top: 100, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', zIndex: 100 },
    confetti: { fontSize: 40 },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    backButton: { position: 'absolute', left: 20, top: 60, padding: 8, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    content: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', marginTop: -40 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
    avatarContainer: { marginBottom: 20 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#FFFFFF' },
    matchBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#10B981', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FFFFFF' },
    questionMark: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6366F1', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    questionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
    infoContainer: { alignItems: 'center', marginBottom: 24, width: '100%' },
    revealedName: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    locationText: { fontSize: 14, color: '#6366F1', fontWeight: '600' },
    bioText: { fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
    hintTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16 },
    hintCard: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 14, borderRadius: 14, width: '100%', marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    hintIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    hintTextContainer: { flex: 1, justifyContent: 'center' },
    hintLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    hintValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
    actionContainer: { width: '100%' },
    revealButton: { width: '100%', backgroundColor: '#6366F1', paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
    chatButton: { width: '100%', backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    skipButton: { width: '100%', paddingVertical: 12, alignItems: 'center' },
    skipButtonText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
    helperText: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16 },
    waitingContainer: { paddingVertical: 16, alignItems: 'center' },
    waitingTitle: { fontSize: 16, color: '#6366F1', fontWeight: '700', marginTop: 12, marginBottom: 6 },
    waitingSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});

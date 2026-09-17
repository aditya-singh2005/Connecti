// app/home/HintScreen.jsx — Updated for new DB schema
// Handles incoming Wave/Hint interactions from the `interactions` table.
// Accept → marks interaction as accepted + triggers connection creation.

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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthProvider';

const { width } = Dimensions.get('window');
const INDIGO = '#6366F1';
const PURPLE = '#7C3AED';

export default function HintScreen() {
    const { matchId } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [interactionData, setInteractionData] = useState(null);
    const [senderProfile, setSenderProfile] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionDone, setActionDone] = useState(null); // 'accepted' | 'declined'

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(0.92)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const isHint = interactionData?.interaction_type === 'hint';
    const isMyInteraction = interactionData?.receiver_id === user?.id;

    const playEntrance = useCallback(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
            Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }),
        ]).start();

        // Pulse animation
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    // ── Data fetch ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!matchId || !user?.id) return;
        fetchInteractionDetails(true);

        // Realtime updates
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
    }, [matchId, user?.id]);

    const fetchInteractionDetails = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);

            const { data: interaction, error } = await supabase
                .from('interactions')
                .select('*')
                .eq('id', matchId)
                .maybeSingle();

            if (error) throw error;
            if (!interaction) {
                // Interaction doesn't exist or was deleted
                setLoading(false);
                return;
            }

            setInteractionData(interaction);

            // Fetch sender profile
            const senderId = interaction.sender_id;
            if (!senderProfile || senderProfile.id !== senderId) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, name, username, bio, city, country')
                    .eq('id', senderId)
                    .maybeSingle();
                setSenderProfile(profile);
            }

            playEntrance();
        } catch (err) {
            console.error('[HintScreen] fetch error:', err.message);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    // ── Accept handler ────────────────────────────────────────────────────────
    const handleAccept = async () => {
        if (actionLoading || actionDone) return;
        setActionLoading(true);
        try {
            // 1. Update interaction status to accepted
            const { error: updateError } = await supabase
                .from('interactions')
                .update({ status: 'accepted' })
                .eq('id', matchId);

            if (updateError) throw updateError;

            // 2. Create a connection record (mutual match)
            // This may also be done by a Supabase trigger, but we do it here as a fallback
            const receiverId = interactionData.receiver_id;
            const senderId = interactionData.sender_id;

            const { error: connError } = await supabase
                .from('connections')
                .insert({
                    user1_id: senderId,
                    user2_id: receiverId,
                    zone_id: interactionData.zone_id,
                })
                .select()
                .maybeSingle();

            // If connection insert fails due to duplicate (trigger already created it), it's fine
            if (connError && !connError.message.includes('duplicate')) {
                console.warn('[HintScreen] connection insert warning:', connError.message);
            }

            setActionDone('accepted');
            setInteractionData(prev => ({ ...prev, status: 'accepted' }));

        } catch (err) {
            Alert.alert('Error', 'Could not accept. Please try again.');
            console.error('[HintScreen] accept error:', err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // ── Decline handler ───────────────────────────────────────────────────────
    const handleDecline = () => {
        Alert.alert(
            'Decline wave?',
            'This person won\'t know you declined.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Decline', style: 'destructive', onPress: confirmDecline },
            ]
        );
    };

    const confirmDecline = async () => {
        if (actionLoading || actionDone) return;
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('interactions')
                .update({ status: 'ignored' })
                .eq('id', matchId);

            if (error) throw error;
            setActionDone('declined');
            setInteractionData(prev => ({ ...prev, status: 'ignored' }));
        } catch (err) {
            Alert.alert('Error', 'Could not decline. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    // ── Render States ──────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={styles.centerFill}>
                <ActivityIndicator size="large" color={INDIGO} />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (!interactionData) {
        return (
            <View style={styles.centerFill}>
                <Ionicons name="alert-circle-outline" size={60} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>Interaction not found</Text>
                <Text style={styles.emptySubtitle}>This wave may have expired or been removed.</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Already responded
    if (actionDone === 'accepted' || interactionData.status === 'accepted') {
        return (
            <View style={styles.centerFill}>
                <Animated.View style={[styles.successRing, { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name="heart" size={52} color={INDIGO} />
                </Animated.View>
                <Text style={styles.successTitle}>It's a Connection! 🎉</Text>
                <Text style={styles.successSubtitle}>
                    You and {senderProfile?.name || 'this person'} are now connected.
                </Text>
                <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => router.push({
                        pathname: '/home/ChatConversationScreen',
                        params: {
                            friendId: interactionData.sender_id,
                            friendName: senderProfile?.name || 'Connection',
                        }
                    })}
                >
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
                <Text style={styles.emptyTitle}>Wave Declined</Text>
                <Text style={styles.emptySubtitle}>
                    {senderProfile?.name || 'The other person'} won't know you declined.
                </Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home/HomeScreen')}>
                    <Text style={styles.backBtnText}>Back to Home</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {isHint ? 'New Hint 🔍' : 'Someone Waved 🌊'}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* Icon / Mystery Card */}
                <Animated.View style={[styles.mysteryCard, { transform: [{ scale: cardScale }, { scale: pulseAnim }] }]}>
                    <View style={[styles.mysteryRing, isHint ? styles.hintRing : styles.waveRing]}>
                        <Ionicons
                            name={isHint ? 'eye-off' : 'hand-right'}
                            size={56}
                            color={isHint ? PURPLE : INDIGO}
                        />
                    </View>
                </Animated.View>

                {/* Info */}
                <Text style={styles.titleMain}>
                    {isHint
                        ? `${senderProfile?.name || 'Someone'} sent you a hint`
                        : `${senderProfile?.name || 'Someone'} waved at you!`}
                </Text>
                <Text style={styles.titleSub}>
                    {isHint
                        ? 'They want to connect but are keeping it subtle. Accept to reveal!'
                        : 'They want to connect with you right now. Do you wave back?'}
                </Text>

                {/* Sender Info Card */}
                <View style={styles.senderCard}>
                    <View style={[styles.senderAvatar, isHint ? styles.hintAvatar : styles.waveAvatar]}>
                        <Text style={styles.senderAvatarText}>
                            {senderProfile?.name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                    </View>
                    <View style={styles.senderInfo}>
                        {isHint ? (
                            <>
                                <Text style={styles.senderName}>🔍 Anonymous Hint</Text>
                                <Text style={styles.senderUsername}>Accept to see who it is</Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.senderName}>{senderProfile?.name || 'Unknown'}</Text>
                                {senderProfile?.username && (
                                    <Text style={styles.senderUsername}>@{senderProfile.username}</Text>
                                )}
                                {senderProfile?.city && (
                                    <Text style={styles.senderCity}>📍 {senderProfile.city}</Text>
                                )}
                            </>
                        )}
                    </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={[styles.acceptBtn, actionLoading && styles.btnDisabled]}
                        onPress={handleAccept}
                        disabled={actionLoading}
                        activeOpacity={0.85}
                    >
                        {actionLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                                <Text style={styles.acceptBtnText}>
                                    {isHint ? 'Accept & Reveal' : 'Wave Back! 🌊'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.declineBtn, actionLoading && styles.btnDisabled]}
                        onPress={handleDecline}
                        disabled={actionLoading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.declineBtnText}>Not now</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    centerFill: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#F9FAFB',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: '#6B7280',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 56,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 48,
    },
    mysteryCard: {
        marginBottom: 28,
    },
    mysteryRing: {
        width: 140,
        height: 140,
        borderRadius: 70,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
    },
    waveRing: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    hintRing: {
        backgroundColor: '#F5F3FF',
        borderColor: '#7C3AED',
    },
    titleMain: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 10,
        letterSpacing: -0.5,
    },
    titleSub: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    senderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        marginBottom: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        gap: 16,
    },
    senderAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveAvatar: {
        backgroundColor: '#EEF2FF',
    },
    hintAvatar: {
        backgroundColor: '#F5F3FF',
    },
    senderAvatarText: {
        fontSize: 26,
        fontWeight: '700',
        color: INDIGO,
    },
    senderInfo: {
        flex: 1,
    },
    senderName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 3,
    },
    senderUsername: {
        fontSize: 14,
        color: '#6366F1',
        marginBottom: 2,
    },
    senderCity: {
        fontSize: 13,
        color: '#9CA3AF',
    },
    actionsContainer: {
        width: '100%',
        gap: 12,
    },
    acceptBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: INDIGO,
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: INDIGO,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    acceptBtnText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    declineBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
    },
    declineBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    btnDisabled: {
        opacity: 0.6,
    },
    // Success state
    successRing: {
        width: 130,
        height: 130,
        borderRadius: 65,
        backgroundColor: '#EEF2FF',
        borderWidth: 3,
        borderColor: INDIGO,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    successTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 10,
    },
    successSubtitle: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    chatBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: INDIGO,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: INDIGO,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    chatBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    homeBtn: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    homeBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    // Declined state
    declinedRing: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#F9FAFB',
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 28,
        lineHeight: 20,
    },
    backBtn: {
        backgroundColor: '#F3F4F6',
        paddingVertical: 13,
        paddingHorizontal: 32,
        borderRadius: 14,
    },
    backBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
});

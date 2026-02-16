import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Animated, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthProvider';
import { DebugLogger } from '../../components/DebugLogger';
import { DebugService } from '../../services/DebugService';

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

    const amIUser1 = matchData?.user1_id === user.id;
    const myRevealed = amIUser1 ? matchData?.user1_revealed : matchData?.user2_revealed;
    const partnerRevealed = amIUser1 ? matchData?.user2_revealed : matchData?.user1_revealed;
    const skipped = matchData?.skipped_by || matchData?.deleted;
    const isFullyRevealed = myRevealed && partnerRevealed && !skipped;

    useEffect(() => {
        if (!matchId || !user) {
            DebugService.warn('HintScreen', 'Missing matchId or user', { matchId, userId: user?.id });
            return;
        }

        DebugService.info('HintScreen', 'Initializing HintScreen', { matchId, userId: user.id });
        fetchMatchDetails();

        // Realtime Sync
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
                    DebugService.wave('HintScreen', `Realtime update: ${payload.eventType}`, {
                        event: payload.eventType,
                        matchId,
                        data: payload.new
                    });

                    if (payload.eventType === 'DELETE') {
                        DebugService.warn('HintScreen', 'Match deleted via realtime');
                        setMatchData(prev => ({ ...prev, deleted: true }));
                        return;
                    }

                    if (payload.new) {
                        setMatchData(payload.new);
                    }
                }
            )
            .subscribe();

        // Polling Fallback
        const pollInterval = setInterval(() => {
            fetchMatchDetails(false);
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [matchId, user]);

    const fetchMatchDetails = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data: log, error } = await supabase
                .from('wave_notification_logs')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error) throw error;

            setMatchData(log);

            // Fetch partner profile
            const partnerId = log.user1_id === user.id ? log.user2_id : log.user1_id;
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', partnerId)
                .single();

            setPartnerProfile(profile);

            // Trigger fade-in animation
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]).start();

            setLoading(false);
        } catch (error) {
            DebugService.error('HintScreen', 'Failed to fetch match details', { error: error.message });
            setLoading(false);
        }
    };

    const handleStartChat = async () => {
        try {
            const partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id;
            router.push({
                pathname: '/home/ChatConversationScreen',
                params: { friendId: partnerId }
            });
        } catch (error) {
            Alert.alert('Error', 'Failed to start chat');
        }
    };

    const handleSkip = async () => {
        try {
            await supabase
                .from('wave_notification_logs')
                .update({ skipped_by: user.id })
                .eq('id', matchId);

            router.back();
        } catch (error) {
            Alert.alert('Error', 'Failed to skip');
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
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="close" size={28} color="#111827" />
                    </TouchableOpacity>
                </View>
                <View style={styles.content}>
                    <Text style={styles.skippedText}>This moment has passed</Text>
                    <TouchableOpacity style={styles.backHomeButton} onPress={() => router.back()}>
                        <Text style={styles.backHomeText}>Back to Home</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="close" size={28} color="#111827" />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                    {/* Profile Picture */}
                    <Image
                        source={require('../../assets/images/demo_user.png')}
                        style={styles.profileImage}
                    />

                    {/* User Details */}
                    <Text style={styles.userName}>{partnerProfile?.name || 'Mystery User'}</Text>
                    <Text style={styles.userBio}>{partnerProfile?.bio || 'No bio available'}</Text>
                    <View style={styles.locationRow}>
                        <Ionicons name="location" size={16} color="#6366F1" />
                        <Text style={styles.locationText}>{partnerProfile?.city || 'Nearby'}</Text>
                    </View>

                    {/* Discount Offer */}
                    <View style={styles.offerCard}>
                        <View style={styles.offerHeader}>
                            <Ionicons name="gift" size={24} color="#10B981" />
                            <Text style={styles.offerTitle}>🎉 You got 10% discount!</Text>
                        </View>
                        <Text style={styles.offerSubtitle}>at G2 Cafe nearby - go grab the deal</Text>
                    </View>

                    {/* BLE Reward Doubling */}
                    <View style={styles.bleCard}>
                        <Ionicons name="bluetooth" size={24} color="#6366F1" />
                        <Text style={styles.bleText}>
                            Double your rewards by enabling BLE and meeting your friend in real life!
                        </Text>
                    </View>

                    {/* Action Buttons */}
                    <TouchableOpacity style={styles.chatButton} onPress={handleStartChat}>
                        <Ionicons name="chatbubbles" size={22} color="#FFFFFF" />
                        <Text style={styles.chatButtonText}>Chat Now</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                        <Text style={styles.skipButtonText}>Skip this moment</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            {/* Debug Logger */}
            <DebugLogger screenName="HintScreen" maxLogs={150} initiallyExpanded={false} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F9FAFB',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#6366F1',
        fontWeight: '600',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    backButton: {
        padding: 8,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'center',
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
    },
    profileImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        marginBottom: 20,
        borderWidth: 4,
        borderColor: '#6366F1',
    },
    userName: {
        fontSize: 28,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 8,
    },
    userBio: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 12,
        lineHeight: 22,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 24,
    },
    locationText: {
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '600',
    },
    offerCard: {
        width: '100%',
        backgroundColor: '#D1FAE5',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#10B981',
    },
    offerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    offerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#065F46',
    },
    offerSubtitle: {
        fontSize: 14,
        color: '#047857',
        marginLeft: 36,
    },
    bleCard: {
        width: '100%',
        backgroundColor: '#EEF2FF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 2,
        borderColor: '#6366F1',
    },
    bleText: {
        flex: 1,
        fontSize: 14,
        color: '#4338CA',
        fontWeight: '600',
        lineHeight: 20,
    },
    chatButton: {
        width: '100%',
        backgroundColor: '#10B981',
        paddingVertical: 18,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 12,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    chatButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
    },
    skipButton: {
        width: '100%',
        paddingVertical: 14,
        alignItems: 'center',
    },
    skipButtonText: {
        color: '#9CA3AF',
        fontSize: 15,
        fontWeight: '600',
    },
    skippedText: {
        fontSize: 20,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
    },
    backHomeButton: {
        backgroundColor: '#6366F1',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 14,
        alignSelf: 'center',
    },
    backHomeText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { continueReconnection, fetchMyReconnections } from '../../services/ReconnectionService';

export default function RevealScreen() {
  const router = useRouter(); const { sessionId } = useLocalSearchParams(); const [session, setSession] = useState(null); const [working, setWorking] = useState(false);
  useEffect(() => {
    let channel;
    const load = async () => {
      try {
        const item = (await fetchMyReconnections()).find(reconnection => reconnection.id === sessionId);
        setSession(item);
        if (item?.phase === 'RECONNECTED') router.replace({ pathname: '/home/RevealedScreen', params: { sessionId } });
      } catch (_) { }
    };
    load();
    if (sessionId) {
      channel = supabase.channel(`discovery-${sessionId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'interactions', filter: `id=eq.${sessionId}` }, payload => {
        setSession(current => current ? { ...current, ...payload.new } : current);
        if (payload.new?.phase === 'RECONNECTED') router.replace({ pathname: '/home/RevealedScreen', params: { sessionId } });
      }).subscribe();
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router, sessionId]);
  if (!session) return <View style={styles.center}><ActivityIndicator size="large" color="#C2410C" /></View>;
  const isWaiting = session.phase === 'BOTH_REVEALS_PENDING'; const reveal = async () => { setWorking(true); try { const next = await continueReconnection(session.id); setSession({ ...session, ...next }); if (next.phase === 'RECONNECTED') router.replace({ pathname: '/home/RevealedScreen', params: { sessionId } }); } catch (error) { Alert.alert('Reveal unavailable', error.message); } finally { setWorking(false); } };
  return <View style={styles.container}><TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#512B18" /></TouchableOpacity><View style={styles.avatar}><Ionicons name="person" size={44} color="#C2410C" /></View><Text style={styles.eyebrow}>MUTUAL REVEAL</Text><Text style={styles.title}>{isWaiting ? 'Waiting for the other person' : 'Ready to reveal?'}</Text><Text style={styles.body}>{isWaiting ? 'Your identity stays protected until they complete their reveal too.' : 'Both of you must choose reveal before either identity is shown.'}</Text>{!isWaiting && <TouchableOpacity style={styles.primary} onPress={reveal} disabled={working}><Text style={styles.primaryText}>{working ? 'Confirming...' : 'Reveal when we both agree'}</Text></TouchableOpacity>}<TouchableOpacity style={styles.secondary} onPress={() => router.replace('/home/HomeScreen')}><Text style={styles.secondaryText}>Back to nearby activity</Text></TouchableOpacity></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF8F2', padding: 24, paddingTop: 60 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, avatar: { alignSelf: 'center', width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center', marginTop: 80, marginBottom: 28 }, eyebrow: { textAlign: 'center', color: '#C2410C', fontWeight: '800', letterSpacing: 2, fontSize: 12 }, title: { color: '#512B18', fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 14 }, body: { color: '#805A45', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16 }, primary: { backgroundColor: '#C2410C', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 34 }, primaryText: { color: '#FFF', fontWeight: '800', fontSize: 16 }, secondary: { alignItems: 'center', padding: 18 }, secondaryText: { color: '#805A45', fontWeight: '700' } });

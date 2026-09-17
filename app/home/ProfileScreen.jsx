import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthProvider';
import { useFriendships } from '../../hooks/useFriendships';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { friendCount } = useFriendships();

  const [profile, setProfile] = useState(null);
  const [smartReconnect, setSmartReconnect] = useState(true);
  const [incognito, setIncognito] = useState(false);

  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { if (data) setProfile(data); });
    }
  }, [user]);

  const name = profile?.name || user?.user_metadata?.first_name || 'Aditya';
  const bio = profile?.bio || 'Exploring the intersection of tech and nature. Product Designer & Coffee enthusiast. ☕';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/home/SettingsScreen')}>
            <Ionicons name="settings-outline" size={20} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            <Image 
              source={{ uri: profile?.avatar_url || 'https://i.pravatar.cc/150?img=11' }} 
              style={styles.avatar} 
            />
            <TouchableOpacity style={styles.editBadge}>
              <Ionicons name="pencil" size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.nameText}>{name}</Text>
          <Text style={styles.bioText}>{bio}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editBtn}>
            <Ionicons name="person-outline" size={16} color="#FFF" />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn}>
            <Ionicons name="share-social-outline" size={16} color="#374151" />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#5C7CFA' }]}>14</Text>
            <Text style={styles.statLabel}>MUTUAL</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{friendCount || 0}</Text>
            <Text style={styles.statLabel}>CONNECTIONS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>89</Text>
            <Text style={styles.statLabel}>RECONNECTED</Text>
          </View>
        </View>

        {/* Smart Reconnect Toggle */}
        <View style={styles.smartCard}>
          <View style={styles.smartIconWrap}>
            <Ionicons name="flash" size={20} color="#FFF" />
          </View>
          <View style={styles.smartTextWrap}>
            <Text style={styles.smartTitle}>Smart Reconnect</Text>
            <Text style={styles.smartDesc}>AI will suggest optimal times to reach out.</Text>
          </View>
          <Switch 
            value={smartReconnect} 
            onValueChange={setSmartReconnect}
            trackColor={{ false: '#E5E7EB', true: '#5C7CFA' }}
            thumbColor="#FFF"
          />
        </View>

        {/* Interests */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <TouchableOpacity><Text style={styles.addText}>Add New</Text></TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            <View style={[styles.tag, { borderColor: '#DBEAFE' }]}>
              <Ionicons name="laptop-outline" size={14} color="#3B82F6" />
              <Text style={styles.tagText}>Tech</Text>
            </View>
            <View style={[styles.tag, { borderColor: '#FEE2E2' }]}>
              <Ionicons name="cafe-outline" size={14} color="#EF4444" />
              <Text style={styles.tagText}>Coffee</Text>
            </View>
            <View style={[styles.tag, { borderColor: '#D1FAE5' }]}>
              <Ionicons name="airplane-outline" size={14} color="#10B981" />
              <Text style={styles.tagText}>Travel</Text>
            </View>
            <View style={[styles.tag, { borderColor: '#F3F4F6' }]}>
              <Ionicons name="color-palette-outline" size={14} color="#6366F1" />
              <Text style={styles.tagText}>Design</Text>
            </View>
          </View>
        </View>

        {/* Privacy & Security */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Privacy & Security</Text>
          <View style={styles.listCard}>
            <TouchableOpacity style={styles.listItem}>
              <View style={styles.listLeft}>
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />
                <Text style={styles.listText}>Privacy Shortcut</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            
            <View style={styles.listDivider} />
            
            <View style={styles.listItem}>
              <View style={styles.listLeft}>
                <Ionicons name="eye-off-outline" size={20} color="#9CA3AF" />
                <Text style={styles.listText}>Incognito Mode</Text>
              </View>
              <Switch 
                value={incognito} 
                onValueChange={setIncognito}
                trackColor={{ false: '#E5E7EB', true: '#5C7CFA' }}
                thumbColor="#FFF"
                style={{ transform: [{ scale: 0.9 }] }}
              />
            </View>

            <View style={styles.listDivider} />

            <TouchableOpacity style={styles.listItem}>
              <View style={styles.listLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#9CA3AF" />
                <Text style={styles.listText}>Account Security</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { paddingHorizontal: 20 },
  profileSection: { alignItems: 'center', marginTop: 10, marginBottom: 24 },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#5C7CFA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  nameText: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  bioText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5C7CFA',
    paddingVertical: 14,
    borderRadius: 20,
  },
  editBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 20,
  },
  shareBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, paddingHorizontal: 10 },
  statBox: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 30, backgroundColor: '#F3F4F6' },
  smartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F6FF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 32,
  },
  smartIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#5C7CFA', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  smartTextWrap: { flex: 1 },
  smartTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  smartDesc: { fontSize: 12, color: '#6B7280' },
  sectionContainer: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  addText: { fontSize: 13, fontWeight: '600', color: '#5C7CFA' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  tagText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  listCard: { backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  listLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  listDivider: { height: 1, backgroundColor: '#F3F4F6' },
});
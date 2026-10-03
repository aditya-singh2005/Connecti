import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthProvider';
import { useFriendships } from '../../hooks/useFriendships';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { friendCount, refresh } = useFriendships();

  const [profile, setProfile] = useState(null);
  const [smartReconnect, setSmartReconnect] = useState(true);
  const [incognito, setIncognito] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarActionsVisible, setAvatarActionsVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoadingProfile(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) setProfile(data);
    setLoadingProfile(false);
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user?.id) {
      await Promise.all([loadProfile(), refresh(false)]);
    }
    setRefreshing(false);
  }, [loadProfile, refresh, user?.id]);

  const name = profile?.name || user?.user_metadata?.first_name || 'New User';
  const username = profile?.username ? `@${profile.username}` : '';
  const bio = profile?.bio || 'Welcome to your profile! Tap Edit to add a bio.';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;

  const pickImage = async () => {
    if (!user?.id) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled) return;
      const image = result.assets?.[0];
      if (!image?.base64) throw new Error('The selected photo could not be opened. Please try another image.');

      setUploading(true);
      const filePath = `${user.id}/avatar.jpg`;

      const { error } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(image.base64), {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const updatedAvatarUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: updatedAvatarUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile(prev => ({ ...(prev || {}), avatar_url: updatedAvatarUrl }));
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Curved Background Header */}
      <View style={[styles.headerBackground, { height: 180 + insets.top }]}>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#5C7CFA" />}
      >
        {/* Profile Info Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity onPress={() => setAvatarActionsVisible(true)} activeOpacity={0.8} disabled={uploading} accessibilityLabel="Profile photo options">
              <View>
                {loadingProfile ? (
                  <View style={[styles.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator color="#5C7CFA" />
                  </View>
                ) : avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5E7EB' }]}>
                    <Ionicons name="person" size={40} color="#9CA3AF" />
                  </View>
                )}
                {uploading ? (
                  <View style={[styles.avatar, { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator color="#FFF" />
                  </View>
                ) : null}
                <View style={styles.editAvatarBtn}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.nameText}>{name}</Text>
          {username ? <Text style={styles.usernameText}>{username}</Text> : null}
          <Text style={styles.bioText}>{bio}</Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/home/EditProfileScreen')} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8}>
              <Ionicons name="share-social" size={18} color="#5C7CFA" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Ionicons name="people" size={24} color="#5C7CFA" style={styles.statIcon} />
            <Text style={styles.statNum}>{friendCount || 0}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="sync" size={24} color="#10B981" style={styles.statIcon} />
            <Text style={styles.statNum}>0</Text>
            <Text style={styles.statLabel}>Reconnections</Text>
          </View>
        </View>

        {/* Smart Reconnect Card */}
        <View style={styles.smartCard}>
          <View style={styles.smartIconWrap}>
            <Ionicons name="sparkles" size={20} color="#F59E0B" />
          </View>
          <View style={styles.smartTextWrap}>
            <Text style={styles.smartTitle}>Smart Reconnect</Text>
            <Text style={styles.smartDesc}>Let AI suggest the perfect times to reach out to old friends.</Text>
          </View>
          <Switch 
            value={smartReconnect} 
            onValueChange={setSmartReconnect}
            trackColor={{ false: '#E5E7EB', true: '#5C7CFA' }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F3F4F6'}
          />
        </View>

        {/* Settings List */}
        <Text style={styles.sectionTitle}>Privacy & Settings</Text>
        <View style={styles.listCard}>
          <View style={styles.listItem}>
            <View style={styles.listLeft}>
              <View style={[styles.listIconBg, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="eye-off" size={18} color="#5C7CFA" />
              </View>
              <Text style={styles.listText}>Incognito Mode</Text>
            </View>
            <Switch 
              value={incognito} 
              onValueChange={setIncognito}
              trackColor={{ false: '#E5E7EB', true: '#5C7CFA' }}
              thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F3F4F6'}
            />
          </View>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listItem} activeOpacity={0.7}>
            <View style={styles.listLeft}>
              <View style={[styles.listIconBg, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              </View>
              <Text style={styles.listText}>Account Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.headerNav, styles.headerNavOverlay, { top: insets.top }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push('/home/SettingsScreen')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={avatarActionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarActionsVisible(false)}
      >
        <View style={styles.modalScrim}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setAvatarActionsVisible(false)}
            accessibilityLabel="Close photo options"
          />
          <View style={[styles.photoSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.photoSheetTitle}>Profile photo</Text>
            <Text style={styles.photoSheetDescription}>View your current photo or choose a new one.</Text>

            <TouchableOpacity
              style={styles.photoOption}
              onPress={() => {
                setAvatarActionsVisible(false);
                setAvatarViewerVisible(true);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.photoOptionIcon, styles.viewPhotoIcon]}>
                <Ionicons name="eye-outline" size={21} color="#256C67" />
              </View>
              <View style={styles.photoOptionCopy}>
                <Text style={styles.photoOptionTitle}>View profile photo</Text>
                <Text style={styles.photoOptionSubtitle}>See it at full size</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoOption}
              onPress={pickImage}
              activeOpacity={0.75}
              disabled={uploading}
            >
              <View style={[styles.photoOptionIcon, styles.changePhotoIcon]}>
                <Ionicons name="camera-outline" size={21} color="#B45C35" />
              </View>
              <View style={styles.photoOptionCopy}>
                <Text style={styles.photoOptionTitle}>Change profile photo</Text>
                <Text style={styles.photoOptionSubtitle}>Choose, crop and save a photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoCancelButton}
              onPress={() => setAvatarActionsVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.photoCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={avatarViewerVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setAvatarViewerVisible(false)}
      >
        <View style={styles.photoViewer}>
          <TouchableOpacity
            style={[styles.viewerCloseButton, { top: insets.top + 12 }]}
            onPress={() => setAvatarViewerVisible(false)}
            accessibilityLabel="Close profile photo"
          >
            <Ionicons name="close" size={25} color="#FFF" />
          </TouchableOpacity>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.fullSizeAvatar} resizeMode="contain" />
          ) : (
            <View style={[styles.fullSizeAvatar, { justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={150} color="#4B5563" />
              <Text style={{ color: '#9CA3AF', marginTop: 20 }}>No profile photo</Text>
            </View>
          )}
          <Text style={[styles.viewerName, { bottom: Math.max(insets.bottom, 24) }]}>{name}</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' // Soft light background
  },
  headerBackground: {
    backgroundColor: '#5C7CFA',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
  },
  headerNavOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
  },
  navBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 100, // Push content down to overlap the header
  },
  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  avatarContainer: {
    marginTop: -50, // Pull avatar up to break the card edge
    marginBottom: 16,
    position: 'relative',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: '#FFF',
    backgroundColor: '#F3F4F6',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#5C7CFA',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(14, 21, 29, 0.48)',
  },
  photoSheet: {
    paddingTop: 12,
    paddingHorizontal: 22,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DFE3',
    alignSelf: 'center',
    marginBottom: 20,
  },
  photoSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#182B2B',
  },
  photoSheetDescription: {
    marginTop: 5,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: '#687777',
  },
  photoOption: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECEB',
  },
  photoOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  viewPhotoIcon: {
    backgroundColor: '#EAF4F1',
  },
  changePhotoIcon: {
    backgroundColor: '#FAEEE8',
  },
  photoOptionCopy: {
    flex: 1,
  },
  photoOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#182B2B',
  },
  photoOptionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#788583',
  },
  photoCancelButton: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: '#F2F5F4',
  },
  photoCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#405251',
  },
  photoViewer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101716',
  },
  viewerCloseButton: {
    position: 'absolute',
    left: 18,
    zIndex: 1,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fullSizeAvatar: {
    width: '100%',
    height: '78%',
  },
  viewerName: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  nameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  usernameText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
    marginBottom: 12,
  },
  bioText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#5C7CFA',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 8,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 10,
  },
  smartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  smartIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  smartTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  smartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  smartDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  listDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
});
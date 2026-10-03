import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 'on' = fg + bg granted | 'partial' = fg only | 'off' = neither
  const [locationStatus, setLocationStatus] = useState('off');
  const [notifStatus, setNotifStatus] = useState('denied');

  const checkPermissions = useCallback(async () => {
    try {
      const [fgResult, bgResult, notifResult] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]);

      const fg = fgResult.status === 'granted';
      const bg = bgResult.status === 'granted';
      if (fg && bg) setLocationStatus('on');
      else if (fg) setLocationStatus('partial');
      else setLocationStatus('off');

      setNotifStatus(notifResult.status === 'granted' ? 'granted' : 'denied');
    } catch (err) {
      console.warn('[Settings] Permission check error:', err.message);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);

  // Open app Location permission page in system Settings
  async function openLocationSettings() {
    Alert.alert(
      'Location Access',
      'Please ensure Location is set to "Allow all the time".\n\nWithout background access, Connecti cannot detect zones or provide reconnection opportunities while the app is closed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: async () => {
            if (Platform.OS === 'android') {
              try {
                const pkg = Application.applicationId;
                await IntentLauncher.startActivityAsync(
                  IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
                  { data: `package:${pkg}` }
                );
              } catch {
                Linking.openSettings();
              }
            } else {
              Linking.openSettings();
            }
          }
        }
      ]
    );
  }

  // Open app Notification settings in system Settings
  async function openNotificationSettings() {
    if (Platform.OS === 'android') {
      try {
        const pkg = Application.applicationId;
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
          { extra: { 'android.provider.extra.APP_PACKAGE': pkg } }
        );
      } catch {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  }

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  // ── Derived label / color values ─────────────────────────────────────────────
  const locationLabel = locationStatus === 'on' ? 'Enabled' : locationStatus === 'partial' ? 'Partial' : 'Disabled';
  const locationColor = locationStatus === 'on' ? '#10B981' : locationStatus === 'partial' ? '#F59E0B' : '#EF4444';
  const locationSubtitle =
    locationStatus === 'on'
      ? 'Foreground & background access granted'
      : locationStatus === 'partial'
      ? 'Requires "Allow all the time" for background reconnects'
      : 'Requires "Allow all the time" for background reconnects';

  const notifLabel = notifStatus === 'granted' ? 'Enabled' : 'Disabled';
  const notifColor = notifStatus === 'granted' ? '#10B981' : '#EF4444';

  // ── Sub-components ───────────────────────────────────────────────────────────
  const SectionHeader = ({ title }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const PermissionRow = ({ icon, iconBg, iconColor, title, subtitle, statusLabel: pill, statusColor, onPress, isLast }) => (
    <View style={styles.itemWrapper}>
      <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.itemTextWrap}>
          <Text style={styles.itemTitle}>{title}</Text>
          {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rightContent}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '1A' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{pill}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </View>
  );

  const ListItem = ({ icon, title, subtitle, rightText, onPress, isLast, iconBg = '#F3F6FF', iconColor = '#5C7CFA', statusColor = '#9CA3AF' }) => (
    <View style={styles.itemWrapper}>
      <TouchableOpacity style={styles.item} disabled={!onPress} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.itemTextWrap}>
          <Text style={styles.itemTitle}>{title}</Text>
          {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rightContent}>
          {rightText ? <Text style={[styles.rightText, { color: statusColor }]}>{rightText}</Text> : null}
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings &amp; Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── PERMISSIONS ───────────────────────────────────────────────────── */}
        <SectionHeader title="PERMISSIONS" />
        <View style={styles.card}>
          {/* Single Location row — opens app location settings on device */}
          <PermissionRow
            icon="location-outline"
            iconBg="#F3F6FF"
            iconColor="#5C7CFA"
            title="Location"
            subtitle={locationSubtitle}
            statusLabel={locationLabel}
            statusColor={locationColor}
            onPress={openLocationSettings}
          />
          {/* Notifications row — opens app notification settings on device */}
          <PermissionRow
            icon="notifications-outline"
            iconBg="#FFF7ED"
            iconColor="#F97316"
            title="Notifications"
            subtitle="Zone entry alerts and reconnection pings"
            statusLabel={notifLabel}
            statusColor={notifColor}
            onPress={openNotificationSettings}
            isLast
          />
        </View>

        {/* ── PRIVACY ──────────────────────────────────────────────────────── */}
        <SectionHeader title="PRIVACY" />
        <View style={styles.card}>
          <ListItem icon="ban-outline" title="Blocked users" iconColor="#4B5563" iconBg="#F3F4F6" onPress={() => {}} />
          <ListItem icon="eye-off-outline" title="Visibility preferences" iconColor="#4B5563" iconBg="#F3F4F6" onPress={() => {}} />
          <ListItem icon="shield-checkmark-outline" title="Data &amp; security info" iconColor="#4B5563" iconBg="#F3F4F6" isLast onPress={() => {}} />
        </View>

        {/* ── SUPPORT ──────────────────────────────────────────────────────── */}
        <SectionHeader title="SUPPORT" />
        <View style={styles.card}>
          <ListItem icon="help-circle-outline" title="Help Center" iconColor="#4B5563" iconBg="#F3F4F6" onPress={() => {}} />
          <ListItem icon="flag-outline" title="Report an issue" iconColor="#4B5563" iconBg="#F3F4F6" onPress={() => {}} />
          <ListItem icon="information-circle-outline" title="About Connecti" rightText="v2.1.0" iconColor="#4B5563" iconBg="#F3F4F6" isLast onPress={() => {}} />
        </View>

        <View style={styles.privacyFooter}>
          <View style={styles.shieldWrap}>
            <Ionicons name="shield-half-outline" size={24} color="#5C7CFA" />
          </View>
          <Text style={styles.footerBold}>Connecti never stores your location history.</Text>
          <Text style={styles.footerText}>
            Your privacy is our priority. All connection data is end-to-end encrypted.
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#F3F6FF',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginVertical: 12, marginLeft: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 16, marginBottom: 16 },
  itemWrapper: { width: '100%' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  itemTextWrap: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 15 },
  rightContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  rightText: { fontSize: 12, fontWeight: '600', color: '#5C7CFA' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 50 },
  privacyFooter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginVertical: 24,
  },
  shieldWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerBold: { fontSize: 13, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 6 },
  footerText: { fontSize: 11, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  logoutBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
});

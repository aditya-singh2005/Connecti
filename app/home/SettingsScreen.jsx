import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [notifications, setNotifications] = useState(true);
  const [smartReconnect, setSmartReconnect] = useState(true);

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Log out', 
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        }
      }
    ]);
  };

  const SectionHeader = ({ title }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const ListItem = ({ icon, title, subtitle, rightText, isToggle, toggleValue, onToggle, isLast, iconBg = '#F3F6FF', iconColor = '#5C7CFA' }) => (
    <View style={styles.itemWrapper}>
      <TouchableOpacity style={styles.item} disabled={isToggle} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.itemTextWrap}>
          <Text style={styles.itemTitle}>{title}</Text>
          {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
        </View>
        
        {isToggle ? (
          <Switch 
            value={toggleValue} 
            onValueChange={onToggle}
            trackColor={{ false: '#E5E7EB', true: '#5C7CFA' }}
            thumbColor="#FFF"
            style={{ transform: [{ scale: 0.9 }] }}
          />
        ) : (
          <View style={styles.rightContent}>
            {rightText && <Text style={styles.rightText}>{rightText}</Text>}
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        )}
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
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <SectionHeader title="PERMISSIONS" />
        <View style={styles.card}>
          <ListItem 
            icon="location-outline" 
            title="Location" 
            subtitle="Used for finding nearby devices" 
            rightText="Always Allow" 
            rightTextColor="#5C7CFA"
          />
          <ListItem 
            icon="notifications-outline" 
            title="Notifications" 
            subtitle="Alerts for connections & news" 
            isToggle 
            toggleValue={notifications}
            onToggle={setNotifications}
          />
          <ListItem 
            icon="flash-outline" 
            title="Smart Reconnect" 
            subtitle="Auto-pair with frequent devices" 
            isToggle 
            toggleValue={smartReconnect}
            onToggle={setSmartReconnect}
            isLast
          />
        </View>

        <SectionHeader title="PRIVACY" />
        <View style={styles.card}>
          <ListItem icon="ban-outline" title="Blocked users" iconColor="#4B5563" iconBg="#F3F4F6" />
          <ListItem icon="eye-off-outline" title="Visibility preferences" iconColor="#4B5563" iconBg="#F3F4F6" />
          <ListItem icon="shield-checkmark-outline" title="Data & security info" iconColor="#4B5563" iconBg="#F3F4F6" isLast />
        </View>

        <SectionHeader title="SUPPORT" />
        <View style={styles.card}>
          <ListItem icon="help-circle-outline" title="Help Center" iconColor="#4B5563" iconBg="#F3F4F6" />
          <ListItem icon="flag-outline" title="Report an issue" iconColor="#4B5563" iconBg="#F3F4F6" />
          <ListItem icon="information-circle-outline" title="About Connecti" rightText="v2.1.0" iconColor="#4B5563" iconBg="#F3F4F6" isLast />
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
  itemSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rightContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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

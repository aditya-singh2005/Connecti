import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthProvider';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [contact, setContact] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        
        if (data) {
          setName(data.name || '');
          setUsername(data.username || '');
          setContact(data.contact || '');
          setBio(data.bio || '');
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user?.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }
    
    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        username: username.trim().toLowerCase() || null,
        contact: contact.trim() || null,
        bio: bio.trim() || null,
      };

      if (username.trim()) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username.trim().toLowerCase())
          .neq("id", user.id)
          .maybeSingle();

        if (existing) {
          Alert.alert("Error", "Username is already taken.");
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      router.back();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#5C7CFA" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={[styles.headerBackground, { height: 180 + insets.top }]}>
        <View style={[styles.headerNav, { marginTop: insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <View style={[styles.inputWrapper, styles.bioWrapper]}>
                <TextInput
                  style={styles.bioInput}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={contact}
                  onChangeText={setContact}
                  placeholder="+1 555 000 0000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
              onPress={handleSave} 
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
            
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' // Soft light background to match ProfileScreen
  },
  center: { 
    justifyContent: 'center', 
    alignItems: 'center' 
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
    paddingTop: 100, // Overlap the curved header
  },
  formCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  bioWrapper: {
    height: 120,
    alignItems: 'flex-start',
    paddingTop: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  atSign: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  bioInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    width: '100%',
    height: '100%',
  },
  saveBtn: {
    backgroundColor: '#5C7CFA',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnDisabled: {
    backgroundColor: '#A5B4FC',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

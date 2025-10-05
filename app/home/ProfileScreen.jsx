import { useEffect, useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useFriendships } from "../../hooks/useFriendships";
import * as Location from 'expo-location';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    contact: '',
    username: '',
    date_of_birth: '',
    bio: '',
    city: '',
    country: '',
  });

  // Use friendships hook
  const {
    friends,
    pendingRequests,
    friendCount,
    pendingCount
  } = useFriendships();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "No logged-in user found");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setProfile({ 
        ...data, 
        email: user.email,
        userId: user.id 
      });
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  };

  const getCurrentLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to update your location');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  };

  const canChangeUsername = () => {
    if (!profile.username_last_changed) return true;
    
    const lastChanged = new Date(profile.username_last_changed);
    const daysSinceChange = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceChange >= 30;
  };

  const getDaysUntilUsernameChange = () => {
    if (!profile.username_last_changed) return 0;
    
    const lastChanged = new Date(profile.username_last_changed);
    const daysSinceChange = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
    
    return Math.ceil(30 - daysSinceChange);
  };

  const openEditModal = () => {
    setEditForm({
      name: profile.name || '',
      contact: profile.contact || '',
      username: profile.username || '',
      date_of_birth: profile.date_of_birth || '',
      bio: profile.bio || '',
      city: profile.city || '',
      country: profile.country || '',
    });
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);

      // Check username change eligibility
      if (editForm.username && editForm.username !== profile.username) {
        if (!canChangeUsername()) {
          const daysLeft = getDaysUntilUsernameChange();
          Alert.alert(
            "Username Change Restricted", 
            `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
          );
          setSaving(false);
          return;
        }

        // Check if username is already taken
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", editForm.username)
          .neq("id", profile.userId)
          .single();

        if (existingUser) {
          Alert.alert("Error", "Username already taken");
          setSaving(false);
          return;
        }
      }

      // Get current location automatically
      const locationData = await getCurrentLocation();

      // Prepare update data
      const updateData = {
        name: editForm.name || null,
        contact: editForm.contact || null,
        username: editForm.username || null,
        date_of_birth: editForm.date_of_birth || null,
        bio: editForm.bio || null,
        city: editForm.city || null,
        country: editForm.country || null,
        updated_at: new Date().toISOString(),
      };

      // Update username_last_changed if username was changed
      if (editForm.username && editForm.username !== profile.username) {
        updateData.username_last_changed = new Date().toISOString();
      }

      // Add location data if available
      if (locationData) {
        updateData.latitude = locationData.latitude;
        updateData.longitude = locationData.longitude;
        updateData.location_updated_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", profile.userId);

      if (error) throw error;

      Alert.alert("Success", "Profile updated successfully");
      setEditModalVisible(false);
      await fetchProfile();
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const getJoinDate = () => {
    if (!profile?.created_at) return "Recently";
    const date = new Date(profile.created_at);
    const options = { month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066FF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No profile data found.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          {/* Avatar and Basic Info */}
          <View style={styles.profileTop}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {profile.name ? profile.name.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
              <View style={styles.statusIndicator} />
            </View>

            <View style={styles.profileBasicInfo}>
              <Text style={styles.profileName}>{profile.name || 'Anonymous User'}</Text>
              {profile.username && (
                <Text style={styles.profileUsername}>@{profile.username}</Text>
              )}
              <View style={styles.badgeContainer}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Member since {getJoinDate()}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Bio Section */}
          {profile.bio && (
            <View style={styles.bioSection}>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>

            <View style={styles.statDivider} />

            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => router.push('/home/FriendsListScreen')}
            >
              <Text style={styles.statNumber}>{friendCount}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </TouchableOpacity>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Nearby</Text>
            </View>
          </View>

          {/* Contact Info */}
          <View style={styles.contactSection}>
            {profile.email && (
              <View style={styles.contactItem}>
                <Text style={styles.contactIcon}>📧</Text>
                <Text style={styles.contactText}>{profile.email}</Text>
              </View>
            )}
            {profile.contact && (
              <View style={styles.contactItem}>
                <Text style={styles.contactIcon}>📱</Text>
                <Text style={styles.contactText}>{profile.contact}</Text>
              </View>
            )}
            {profile.city && profile.country && (
              <View style={styles.contactItem}>
                <Text style={styles.contactIcon}>📍</Text>
                <Text style={styles.contactText}>{profile.city}, {profile.country}</Text>
              </View>
            )}
            {profile.date_of_birth && (
              <View style={styles.contactItem}>
                <Text style={styles.contactIcon}>🎂</Text>
                <Text style={styles.contactText}>{new Date(profile.date_of_birth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={openEditModal}
            >
              <Text style={styles.primaryButtonText}>✏️  Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.secondaryButton, pendingCount > 0 && styles.secondaryButtonHighlight]}
              onPress={() => router.push('/home/FriendRequestsScreen')}
            >
              <Text style={[styles.secondaryButtonText, pendingCount > 0 && styles.secondaryButtonTextHighlight]}>
                {pendingCount > 0 ? `📬 ${pendingCount} Requests` : '📭 Requests'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard}>
              <View style={styles.actionIconContainer}>
                <Text style={styles.actionIcon}>📍</Text>
              </View>
              <Text style={styles.actionLabel}>Location</Text>
              <Text style={styles.actionSubtext}>History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard}>
              <View style={styles.actionIconContainer}>
                <Text style={styles.actionIcon}>🔔</Text>
              </View>
              <Text style={styles.actionLabel}>Alerts</Text>
              <Text style={styles.actionSubtext}>Manage</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard}>
              <View style={styles.actionIconContainer}>
                <Text style={styles.actionIcon}>⚙️</Text>
              </View>
              <Text style={styles.actionLabel}>Settings</Text>
              <Text style={styles.actionSubtext}>Configure</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard}>
              <View style={styles.actionIconContainer}>
                <Text style={styles.actionIcon}>🛡️</Text>
              </View>
              <Text style={styles.actionLabel}>Privacy</Text>
              <Text style={styles.actionSubtext}>Security</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Friends Section */}
        {friendCount > 0 && (
          <View style={styles.friendsSection}>
            <View style={styles.friendsHeader}>
              <Text style={styles.sectionTitle}>Friends</Text>
              <TouchableOpacity onPress={() => router.push('/home/FriendsListScreen')}>
                <Text style={styles.viewAllButton}>View All →</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.friendsScrollContent}
            >
              {friends.slice(0, 8).map((friend) => (
                <View key={friend.id} style={styles.friendCard}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {friend.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.friendName} numberOfLines={1}>
                    {friend.name.split(' ')[0]}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => setEditModalVisible(false)}
              style={styles.modalHeaderButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity 
              onPress={handleSaveProfile}
              disabled={saving}
              style={styles.modalHeaderButton}
            >
              <Text style={[styles.saveButtonText, saving && styles.saveButtonDisabled]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Basic Information</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.name}
                  onChangeText={(text) => setEditForm({...editForm, name: text})}
                  placeholder="Enter your full name"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Username</Text>
                {!canChangeUsername() && (
                  <Text style={styles.warningText}>
                    ⚠️ Username can be changed in {getDaysUntilUsernameChange()} days
                  </Text>
                )}
                <TextInput
                  style={[styles.input, !canChangeUsername() && styles.inputDisabled]}
                  value={editForm.username}
                  onChangeText={(text) => setEditForm({...editForm, username: text.toLowerCase()})}
                  placeholder="Choose a unique username"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  editable={canChangeUsername()}
                />
                <Text style={styles.helperText}>Username can only be changed once every 30 days</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.bio}
                  onChangeText={(text) => setEditForm({...editForm, bio: text})}
                  placeholder="Tell others about yourself..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                  maxLength={200}
                />
                <Text style={styles.helperText}>{editForm.bio.length}/200 characters</Text>
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Contact Details</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.contact}
                  onChangeText={(text) => setEditForm({...editForm, contact: text})}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Date of Birth</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.date_of_birth}
                  onChangeText={(text) => setEditForm({...editForm, date_of_birth: text})}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Location</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.city}
                  onChangeText={(text) => setEditForm({...editForm, city: text})}
                  placeholder="Your city"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Country</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.country}
                  onChangeText={(text) => setEditForm({...editForm, country: text})}
                  placeholder="Your country"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>📍</Text>
                <Text style={styles.infoText}>
                  Your precise location will be automatically updated when you save
                </Text>
              </View>
            </View>

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  container: { 
    flexGrow: 1,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  
  // Profile Card
  profileCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#fff',
  },
  profileBasicInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  profileUsername: {
    fontSize: 15,
    color: '#0066FF',
    fontWeight: '500',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
  },
  badge: {
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: '600',
  },
  bioSection: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  bioText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4A4A4A',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E5EA',
  },
  contactSection: {
    marginBottom: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contactIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
  },
  contactText: {
    fontSize: 15,
    color: '#4A4A4A',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonHighlight: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  secondaryButtonTextHighlight: {
    color: '#FF9500',
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 28,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  actionSubtext: {
    fontSize: 12,
    color: '#8E8E93',
  },

  // Friends Section
  friendsSection: {
    paddingHorizontal: 16,
  },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllButton: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066FF',
  },
  friendsScrollContent: {
    paddingRight: 16,
  },
  friendCard: {
    alignItems: 'center',
    marginRight: 16,
    width: 80,
  },
  friendAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  friendAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  friendName: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '500',
    textAlign: 'center',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalHeaderButton: {
    minWidth: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066FF',
  },
  saveButtonDisabled: {
    color: '#C7C7CC',
  },
  modalContent: {
    flex: 1,
  },
  formSection: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#F8F9FA',
  },
  inputDisabled: {
    backgroundColor: '#F0F0F0',
    color: '#8E8E93',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  helperText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
  },
  warningText: {
    fontSize: 12,
    color: '#FF9500',
    marginBottom: 6,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F4FF',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#0066FF',
    lineHeight: 18,
  },
});
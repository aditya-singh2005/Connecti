// app/create-profile.jsx — Profile setup after signup (premium redesign)
// Fixed: broken route /home/Homescreen → /home/HomeScreen
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function CreateProfile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [contactFocused, setContactFocused] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (username && username.length < 3) e.username = "Username must be at least 3 characters.";
    if (username && !/^[a-z0-9_]+$/.test(username)) e.username = "Only lowercase letters, numbers, and underscores.";
    return e;
  };

  const handleSaveProfile = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "No logged-in user found. Please sign in again.");
        return;
      }

      // Check username uniqueness if provided
      if (username.trim()) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username.trim())
          .neq("id", user.id)
          .maybeSingle();

        if (existing) {
          setErrors({ username: "This username is already taken." });
          setSaving(false);
          return;
        }
      }

      const { error: insertError } = await supabase.from("profiles").insert([
        {
          id: user.id,
          name: name.trim(),
          username: username.trim().toLowerCase() || null,
          contact: contact.trim() || null,
          email: user.email,
        },
      ]);

      if (insertError) {
        // If already exists, try to update instead
        if (insertError.code === '23505') {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ name: name.trim(), username: username.trim().toLowerCase() || null, contact: contact.trim() || null })
            .eq("id", user.id);
          if (updateError) throw updateError;
        } else {
          throw insertError;
        }
      }

      // Navigate to home — FIXED route (was /home/Homescreen)
      router.replace("/home/HomeScreen");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Ionicons name="person-add" size={36} color="#6366F1" />
          </View>
          <Text style={styles.title}>Set Up Your Profile</Text>
          <Text style={styles.subtitle}>
            This is how others in your zone will see you.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name *</Text>
            <View style={[styles.inputWrapper, nameFocused && styles.inputFocused, errors.name && styles.inputError]}>
              <Ionicons
                name="person-outline"
                size={20}
                color={nameFocused ? "#6366F1" : "#9CA3AF"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Your full name"
                placeholderTextColor="#C4C4D4"
                value={name}
                onChangeText={t => { setName(t); setErrors(e => ({ ...e, name: null })); }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                autoCapitalize="words"
              />
            </View>
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}
          </View>

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Username (optional)</Text>
            <View style={[styles.inputWrapper, usernameFocused && styles.inputFocused, errors.username && styles.inputError]}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="your_handle"
                placeholderTextColor="#C4C4D4"
                value={username}
                onChangeText={t => { setUsername(t.toLowerCase()); setErrors(e => ({ ...e, username: null })); }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.username ? <Text style={styles.fieldError}>{errors.username}</Text> : null}
          </View>

          {/* Contact */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone Number (optional)</Text>
            <Text style={styles.fieldHint}>Only shared with mutual connections</Text>
            <View style={[styles.inputWrapper, contactFocused && styles.inputFocused]}>
              <Ionicons
                name="call-outline"
                size={20}
                color={contactFocused ? "#6366F1" : "#9CA3AF"}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="+1 555 000 0000"
                placeholderTextColor="#C4C4D4"
                value={contact}
                onChangeText={setContact}
                onFocus={() => setContactFocused(true)}
                onBlur={() => setContactFocused(false)}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Privacy notice */}
          <View style={styles.privacyNotice}>
            <Ionicons name="shield-checkmark" size={16} color="#10B981" />
            <Text style={styles.privacyText}>
              Your contact is private by default and only revealed to mutual connections.
            </Text>
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnLoading]}
          onPress={handleSaveProfile}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.saveBtnText}>Complete Setup</Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          You can update your profile at any time from the Profile tab.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconBadge: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 14,
    height: 52,
    gap: 8,
  },
  inputFocused: {
    borderColor: "#6366F1",
    backgroundColor: "#FEFEFF",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  inputIcon: {},
  atSign: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6366F1",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  fieldError: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  privacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: "#065F46",
    lineHeight: 18,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366F1",
    paddingVertical: 17,
    borderRadius: 18,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 16,
  },
  saveBtnLoading: { backgroundColor: "#818CF8" },
  saveBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  footnote: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
  },
});

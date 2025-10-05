import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../../connecti-app/lib/supabase";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function CreateProfile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  const handleSaveProfile = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert("Error", "No logged-in user found");
      return;
    }

    const { error } = await supabase.from("profiles").insert([
      {
        id: user.id, // link with auth.users
        name,
        contact,
      },
    ]);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Profile created!");
      router.replace("/home/Homescreen");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#f9f9f9" }}>
      <Text style={{ fontSize: 26, fontWeight: "600", marginBottom: 30, textAlign: "center", color: "#1E88E5" }}>
        Create Your Profile
      </Text>

      {/* Name Field */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: "#1E88E5",
          borderRadius: 10,
          marginBottom: 15,
          paddingHorizontal: 10,
          backgroundColor: "#fff",
        }}
      >
        <Ionicons name="person-outline" size={20} color="#1E88E5" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          style={{ flex: 1, height: 45 }}
        />
      </View>

      {/* Contact Field */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: "#1E88E5",
          borderRadius: 10,
          marginBottom: 20,
          paddingHorizontal: 10,
          backgroundColor: "#ffffffff",
        }}
      >
        <Ionicons name="call-outline" size={20} color="#1E88E5" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Contact Number"
          keyboardType="phone-pad"
          value={contact}
          onChangeText={setContact}
          style={{ flex: 1, height: 45 }}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        onPress={handleSaveProfile}
        style={{
          backgroundColor: "#1E88E5",
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 3,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Save Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

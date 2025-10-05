import { useContext, useEffect } from "react";
import { useRouter } from "expo-router";
import { Text, View, ActivityIndicator } from "react-native";
import { AuthContext } from "../context/AuthProvider";
import { supabase } from "../lib/supabase";

export default function Index() {
  const { session, loading } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    const checkProfile = async () => {
      if (!loading) {
        if (session) {
          const { data } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", session.user.id)
            .single();

          if (data) {
            // ✅ Navigate to home tabs - HomeScreen will be the default tab
            router.replace("/home/HomeScreen");
          } else {
            // ✅ Profile missing - go to create profile
            router.replace("/create-profile");
          }
        } else {
          // ✅ Not logged in - go to login
          router.replace("/login");
        }
      }
    };

    checkProfile();
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" }}>
        <ActivityIndicator size="large" color="#1E88E5" />
        <Text style={{ marginTop: 10, fontSize: 16, color: "#666" }}>Loading...</Text>
      </View>
    );
  }

  return null;
}
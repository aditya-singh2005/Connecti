import { useContext, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Text, View, ActivityIndicator } from "react-native";
import { AuthContext } from "../context/AuthProvider";
import { supabase } from "../lib/supabase";

// ✅ Make sure this is a proper React component with default export
function Index() {
  const { session, loading } = useContext(AuthContext);
  const router = useRouter();
  const [checkingProfile, setCheckingProfile] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      if (checkingProfile) return;
      if (loading) return;

      setCheckingProfile(true);

      try {
        if (session) {
          console.log("User is logged in, checking profile...");
          const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", session.user.id)
            .single();

          if (error) {
            console.log("Profile check error:", error);
            router.replace("/create-profile");
          } else if (data) {
            console.log("Profile exists, going to home");
            router.replace("/home/HomeScreen");
          } else {
            console.log("No profile found, going to create profile");
            router.replace("/create-profile");
          }
        } else {
          console.log("No session, going to login");
          router.replace("/login");
        }
      } catch (error) {
        console.error("Error in checkProfile:", error);
        router.replace("/login");
      } finally {
        setCheckingProfile(false);
      }
    };

    checkProfile();
  }, [session, loading]);

  // Show loading while checking auth state
  if (loading || checkingProfile) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" }}>
        <ActivityIndicator size="large" color="#1E88E5" />
        <Text style={{ marginTop: 10, fontSize: 16, color: "#666" }}>
          {loading ? "Checking authentication..." : "Checking profile..."}
        </Text>
      </View>
    );
  }

  // Return empty view while navigating
  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }} />
  );
}

// ✅ CRITICAL: Make sure you have this default export
export default Index;



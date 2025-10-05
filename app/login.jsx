import { useState } from "react";
import { View, Text, TextInput, Button, Alert, StyleSheet } from "react-native";
import { supabase } from "../../connecti-app/lib/supabase";
import { useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Login error", error.message);
    } else {
      router.replace("/home/HomeScreen");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log In</Text>
      
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />
      
      <Button 
        title={loading ? "Signing In..." : "Log In"} 
        onPress={handleLogin} 
        disabled={loading}
        color="#1E88E5"
      />

      <View style={styles.signupRedirect}>
        <Text style={styles.signupText}>
          Don't have an account?
        </Text>
        <Button 
          title="Sign Up" 
          onPress={() => router.push("/signup")} 
          color="#666"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    padding: 20,
    backgroundColor: "#f5f5f5"
  },
  title: { 
    fontSize: 28, 
    fontWeight: "bold", 
    marginBottom: 30, 
    textAlign: "center",
    color: "#1E88E5"
  },
  input: { 
    borderWidth: 1, 
    borderColor: "#ddd",
    padding: 15, 
    marginBottom: 15, 
    borderRadius: 8,
    backgroundColor: "white",
    fontSize: 16
  },
  signupRedirect: { 
    marginTop: 20, 
    alignItems: "center" 
  },
  signupText: { 
    textAlign: "center", 
    marginBottom: 10,
    color: "#666"
  }
});
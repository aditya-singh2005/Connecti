import { Stack } from "expo-router";
import { AuthProvider } from "../context/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="create-profile" />
        <Stack.Screen name="location-test" />
        {/* Add the home folder/group */}
        <Stack.Screen name="home" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
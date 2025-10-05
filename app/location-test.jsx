import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert, StyleSheet } from "react-native";
import * as Location from "expo-location";

export default function LocationTest() {
  const [location, setLocation] = useState(null);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Allow location access to test this feature");
      return;
    }

    const loc = await Location.getCurrentPositionAsync({});
    setLocation(loc);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📍 Location Test</Text>
      <Button title="Get Current Location" onPress={getLocation} color="#1E88E5" />
      {location && (
        <Text style={styles.text}>
          Latitude: {location.coords.latitude.toFixed(6)}
          {"\n"}
          Longitude: {location.coords.longitude.toFixed(6)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, marginBottom: 20, color: "#1E88E5" },
  text: { marginTop: 15, fontSize: 18, textAlign: "center" },
});

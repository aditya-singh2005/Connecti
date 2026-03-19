import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Animated
} from "react-native";
import { supabase } from "../lib/supabase";
import { useRouter } from "expo-router";

// Country codes data
const COUNTRY_CODES = [
  { code: "+1", country: "USA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+971", country: "UAE", flag: "🇦🇪" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
];

export default function Signup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    countryCode: "+91",
    contact: "",
    dateOfBirth: "",
    username: "",
    day: "",
    month: "",
    year: ""
  });
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState({
    checking: false,
    available: null,
    message: ""
  });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerType, setDatePickerType] = useState(null);

  const usernameCheckTimeout = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [step]);

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Real-time username validation with debounce
  useEffect(() => {
    if (formData.username.length === 0) {
      setUsernameStatus({ checking: false, available: null, message: "" });
      return;
    }

    if (formData.username.length < 3) {
      setUsernameStatus({
        checking: false,
        available: false,
        message: "Username must be at least 3 characters"
      });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      setUsernameStatus({
        checking: false,
        available: false,
        message: "Only letters, numbers, and underscores allowed"
      });
      return;
    }

    // Clear previous timeout
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Set checking state
    setUsernameStatus({ checking: true, available: null, message: "Checking..." });

    // Debounce username check
    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("username", formData.username.toLowerCase())
          .maybeSingle();

        if (data) {
          setUsernameStatus({
            checking: false,
            available: false,
            message: "Username already taken"
          });
        } else {
          setUsernameStatus({
            checking: false,
            available: true,
            message: "Username available!"
          });
        }
      } catch (err) {
        setUsernameStatus({
          checking: false,
          available: true,
          message: "Username available!"
        });
      }
    }, 500); // 500ms debounce

    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [formData.username]);

  const validateStep1 = () => {
    if (!formData.fullName || !formData.email || !formData.password || !formData.confirmPassword) {
      Alert.alert("Missing Information", "Please fill all required fields");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert("Password Mismatch", "Passwords don't match");
      return false;
    }

    if (formData.password.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters");
      return false;
    }

    return true;
  };

  const validateStep2 = () => {
    if (!formData.contact) {
      Alert.alert("Missing Phone", "Please enter your phone number");
      return false;
    }

    if (formData.contact.length !== 10) {
      Alert.alert("Invalid Phone", "Phone number must be exactly 10 digits");
      return false;
    }

    if (!/^\d+$/.test(formData.contact)) {
      Alert.alert("Invalid Phone", "Phone number must contain only digits");
      return false;
    }

    return true;
  };

  const validateStep3 = () => {
    if (!formData.day || !formData.month || !formData.year) {
      Alert.alert("Incomplete Date", "Please select your complete date of birth");
      return false;
    }

    const dateString = `${formData.year}-${String(formData.month).padStart(2, '0')}-${String(formData.day).padStart(2, '0')}`;
    const birthDate = new Date(dateString);

    if (isNaN(birthDate.getTime())) {
      Alert.alert("Invalid Date", "Please enter a valid date");
      return false;
    }

    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (age < 13 || (age === 13 && monthDiff < 0) || (age === 13 && monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      Alert.alert("Age Restriction", "You must be at least 13 years old to sign up");
      return false;
    }

    setFormData(prev => ({ ...prev, dateOfBirth: dateString }));
    return true;
  };

  const validateStep4 = () => {
    if (!formData.username) {
      Alert.alert("Missing Username", "Please choose a username");
      return false;
    }

    if (!usernameStatus.available) {
      Alert.alert("Invalid Username", usernameStatus.message || "Please choose a different username");
      return false;
    }

    return true;
  };

  const handleNext = async () => {
    switch (step) {
      case 1:
        if (validateStep1()) {
          setStep(2);
          fadeAnim.setValue(0);
        }
        break;
      case 2:
        if (validateStep2()) {
          setStep(3);
          fadeAnim.setValue(0);
        }
        break;
      case 3:
        if (validateStep3()) {
          setStep(4);
          fadeAnim.setValue(0);
        }
        break;
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      fadeAnim.setValue(0);
    }
  };

  const handleFinalSignup = async () => {
    if (!validateStep4()) return;

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          Alert.alert("Account Exists", "This email is already registered. Please log in instead.", [
            { text: "Go to Login", onPress: () => router.push("/login") }
          ]);
          return;
        }
        Alert.alert("Signup Error", authError.message);
        return;
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert([{
            id: authData.user.id,
            name: formData.fullName,
            contact: `${formData.countryCode}${formData.contact}`,
            username: formData.username.toLowerCase(),
            date_of_birth: formData.dateOfBirth,
          }]);

        if (profileError) {
          Alert.alert("Error", profileError.message);
          await supabase.auth.signOut();
        } else {
          Alert.alert("Success! 🎉", "Your account has been created successfully!", [
            { text: "Get Started", onPress: () => router.replace("/home/HomeScreen") }
          ]);
        }
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const openDatePicker = (type) => {
    setDatePickerType(type);
    setShowDatePicker(true);
  };

  const renderDatePickerContent = () => {
    const currentYear = new Date().getFullYear();
    let items = [];

    if (datePickerType === 'day') {
      items = Array.from({ length: 31 }, (_, i) => i + 1);
    } else if (datePickerType === 'month') {
      items = [
        { value: 1, label: 'January' },
        { value: 2, label: 'February' },
        { value: 3, label: 'March' },
        { value: 4, label: 'April' },
        { value: 5, label: 'May' },
        { value: 6, label: 'June' },
        { value: 7, label: 'July' },
        { value: 8, label: 'August' },
        { value: 9, label: 'September' },
        { value: 10, label: 'October' },
        { value: 11, label: 'November' },
        { value: 12, label: 'December' },
      ];
    } else if (datePickerType === 'year') {
      items = Array.from({ length: 100 }, (_, i) => currentYear - i);
    }

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => typeof item === 'object' ? item.value.toString() : item.toString()}
        renderItem={({ item }) => {
          const value = typeof item === 'object' ? item.value : item;
          const label = typeof item === 'object' ? item.label : item;

          return (
            <TouchableOpacity
              style={styles.pickerItem}
              onPress={() => {
                if (datePickerType === 'day') updateFormData('day', value.toString());
                if (datePickerType === 'month') updateFormData('month', value.toString());
                if (datePickerType === 'year') updateFormData('year', value.toString());
                setShowDatePicker(false);
              }}
            >
              <Text style={styles.pickerItemText}>{label}</Text>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1/4</Text>
              </View>
              <Text style={styles.stepTitle}>Basic Information</Text>
              <Text style={styles.stepDescription}>Let's get to know you</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                placeholder="Enter your full name"
                value={formData.fullName}
                onChangeText={(text) => updateFormData('fullName', text)}
                style={styles.input}
                autoCapitalize="words"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                placeholder="your.email@example.com"
                value={formData.email}
                onChangeText={(text) => updateFormData('email', text)}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                placeholder="Create a strong password"
                secureTextEntry
                value={formData.password}
                onChangeText={(text) => updateFormData('password', text)}
                style={styles.input}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                placeholder="Re-enter your password"
                secureTextEntry
                value={formData.confirmPassword}
                onChangeText={(text) => updateFormData('confirmPassword', text)}
                style={styles.input}
                placeholderTextColor="#999"
              />
            </View>
          </Animated.View>
        );

      case 2:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2/4</Text>
              </View>
              <Text style={styles.stepTitle}>Contact Information</Text>
              <Text style={styles.stepDescription}>How can we reach you?</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.phoneContainer}>
                <TouchableOpacity
                  style={styles.countryCodeButton}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.countryFlag}>
                    {COUNTRY_CODES.find(c => c.code === formData.countryCode)?.flag}
                  </Text>
                  <Text style={styles.countryCode}>{formData.countryCode}</Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>

                <TextInput
                  placeholder="10 digit number"
                  value={formData.contact}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/\D/g, '');
                    if (cleaned.length <= 10) {
                      updateFormData('contact', cleaned);
                    }
                  }}
                  style={[styles.input, styles.phoneInput]}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholderTextColor="#999"
                />
              </View>
              <Text style={styles.helperText}>
                This will be visible to your connections
              </Text>
            </View>

            <Modal
              visible={showCountryPicker}
              animationType="slide"
              transparent={true}
              onRequestClose={() => setShowCountryPicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Country Code</Text>
                    <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                      <Text style={styles.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={COUNTRY_CODES}
                    keyExtractor={(item) => item.code}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.countryItem}
                        onPress={() => {
                          updateFormData('countryCode', item.code);
                          setShowCountryPicker(false);
                        }}
                      >
                        <Text style={styles.countryItemFlag}>{item.flag}</Text>
                        <Text style={styles.countryItemName}>{item.country}</Text>
                        <Text style={styles.countryItemCode}>{item.code}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Modal>
          </Animated.View>
        );

      case 3:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3/4</Text>
              </View>
              <Text style={styles.stepTitle}>Date of Birth</Text>
              <Text style={styles.stepDescription}>When were you born?</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Select Your Birthday</Text>
              <View style={styles.dateSelectContainer}>
                <TouchableOpacity
                  style={styles.dateSelectButton}
                  onPress={() => openDatePicker('day')}
                >
                  <Text style={styles.dateSelectLabel}>Day</Text>
                  <Text style={styles.dateSelectValue}>
                    {formData.day || 'DD'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dateSelectButton}
                  onPress={() => openDatePicker('month')}
                >
                  <Text style={styles.dateSelectLabel}>Month</Text>
                  <Text style={styles.dateSelectValue}>
                    {formData.month ? new Date(2000, formData.month - 1).toLocaleString('default', { month: 'short' }) : 'MM'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dateSelectButton, styles.yearButton]}
                  onPress={() => openDatePicker('year')}
                >
                  <Text style={styles.dateSelectLabel}>Year</Text>
                  <Text style={styles.dateSelectValue}>
                    {formData.year || 'YYYY'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>
                You must be at least 13 years old
              </Text>
            </View>

            <Modal
              visible={showDatePicker}
              animationType="slide"
              transparent={true}
              onRequestClose={() => setShowDatePicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      Select {datePickerType === 'day' ? 'Day' : datePickerType === 'month' ? 'Month' : 'Year'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {renderDatePickerContent()}
                </View>
              </View>
            </Modal>
          </Animated.View>
        );

      case 4:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>4/4</Text>
              </View>
              <Text style={styles.stepTitle}>Choose Username</Text>
              <Text style={styles.stepDescription}>Pick your unique identifier</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                placeholder="username"
                value={formData.username}
                onChangeText={(text) => updateFormData('username', text.toLowerCase())}
                style={[
                  styles.input,
                  usernameStatus.available === false && styles.inputError,
                  usernameStatus.available === true && styles.inputSuccess
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#999"
              />

              {usernameStatus.checking && (
                <View style={styles.statusContainer}>
                  <View style={styles.loadingDot} />
                  <Text style={styles.statusTextChecking}>{usernameStatus.message}</Text>
                </View>
              )}

              {!usernameStatus.checking && usernameStatus.available === false && (
                <View style={[styles.statusContainer, styles.errorContainer]}>
                  <Text style={styles.statusIcon}>⚠️</Text>
                  <Text style={styles.statusTextError}>{usernameStatus.message}</Text>
                </View>
              )}

              {!usernameStatus.checking && usernameStatus.available === true && (
                <View style={[styles.statusContainer, styles.successContainer]}>
                  <Text style={styles.statusIcon}>✓</Text>
                  <Text style={styles.statusTextSuccess}>{usernameStatus.message}</Text>
                </View>
              )}

              <Text style={styles.helperText}>
                Use letters, numbers, and underscores (min. 3 characters)
              </Text>
            </View>
          </Animated.View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Connecti</Text>
          <Text style={styles.headerTitle}>Create Your Account</Text>

          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              {[1, 2, 3, 4].map((s) => (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    s <= step && styles.progressDotActive
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {renderStep()}

        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={styles.secondaryButtonText}>← Back</Text>
            </TouchableOpacity>
          )}

          {step < 4 ? (
            <TouchableOpacity
              onPress={handleNext}
              style={[styles.button, styles.primaryButton]}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleFinalSignup}
              disabled={loading || usernameStatus.checking || !usernameStatus.available}
              style={[
                styles.button,
                styles.primaryButton,
                (loading || usernameStatus.checking || !usernameStatus.available) && styles.disabledButton
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? "Creating..." : "Complete Signup"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.footerLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 16,
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1E88E5",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    color: "#666",
    marginBottom: 30,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 12,
  },
  progressDot: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: '#1E88E5',
  },
  stepContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  stepHeader: {
    marginBottom: 20,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  stepBadgeText: {
    color: '#1E88E5',
    fontSize: 12,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    color: '#666',
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#fafafa",
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputError: {
    borderColor: '#ff4444',
    backgroundColor: '#fff5f5',
  },
  inputSuccess: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f4',
  },
  helperText: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
  },
  phoneContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    gap: 8,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  dropdownArrow: {
    fontSize: 10,
    color: '#666',
  },
  phoneInput: {
    flex: 1,
    marginBottom: 0,
  },
  dateSelectContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dateSelectButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 13,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  yearButton: {
    flex: 1.5,
  },
  dateSelectLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    fontWeight: '500',
  },
  dateSelectValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorContainer: {
    backgroundColor: '#fff5f5',
  },
  successContainer: {
    backgroundColor: '#f1f8f4',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1E88E5',
  },
  statusIcon: {
    fontSize: 16,
  },
  statusTextChecking: {
    fontSize: 14,
    color: '#1E88E5',
    fontWeight: '500',
  },
  statusTextError: {
    fontSize: 14,
    color: '#d32f2f',
    fontWeight: '500',
  },
  statusTextSuccess: {
    fontSize: 14,
    color: '#2e7d32',
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#1E88E5',
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  footerText: {
    fontSize: 15,
    color: '#666',
  },
  footerLink: {
    fontSize: 15,
    color: '#1E88E5',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  countryItemFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  countryItemName: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  countryItemCode: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  pickerItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  pickerItemText: {
    fontSize: 18,
    color: '#1a1a1a',
    textAlign: 'center',
    fontWeight: '500',
  },
});
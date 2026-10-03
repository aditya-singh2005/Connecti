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
  Animated,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W } = Dimensions.get("window");
const IS_TABLET = SCREEN_W >= 768;

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

const DEFAULT_INTERESTS = [
  "Music", "Art", "Trekking", "Studying", "Playing", "Football", "Cricket", 
  "Chess", "Movies", "Photography", "Travel", "Coding", "Cooking", "Dancing",
  "Reading", "Gaming", "Yoga", "Fitness", "Fashion", "Technology"
];

const DEFAULT_SCHOOLS = [
  "DTU Rohini Delhi",
  "Greenfields Public School Dilshad Garden",
  "IIT Delhi",
  "NSUT Delhi",
  "Amity University Noida",
  "Delhi University",
  "JNU Delhi",
  "Jamia Millia Islamia Delhi",
  "Guru Gobind Singh Indraprastha University",
  "Other"
];

export default function Signup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    username: "",
    day: "",
    month: "",
    year: "",
    dateOfBirth: "",
    gender: "",
    interests: [],
    customInterests: [],
    education: "",
    customEducation: "",
    countryCode: "+91",
    contact: "",
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

  const [showEducationModal, setShowEducationModal] = useState(false);
  const [educationSearch, setEducationSearch] = useState("");

  const [interestSearch, setInterestSearch] = useState("");

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

  const toggleInterest = (interest) => {
    setFormData(prev => {
      const current = prev.interests;
      if (current.includes(interest)) {
        return { ...prev, interests: current.filter(i => i !== interest) };
      } else {
        return { ...prev, interests: [...current, interest] };
      }
    });
  };

  const addCustomInterest = () => {
    const trimmed = interestSearch.trim();
    if (!trimmed) return;
    const already = formData.interests.includes(trimmed) || formData.customInterests.includes(trimmed);
    if (already) { setInterestSearch(""); return; }
    setFormData(prev => ({ ...prev, customInterests: [...prev.customInterests, trimmed] }));
    setInterestSearch("");
  };

  const removeCustomInterest = (interest) => {
    setFormData(prev => ({ ...prev, customInterests: prev.customInterests.filter(i => i !== interest) }));
  };

  useEffect(() => {
    if (formData.username.length === 0) {
      setUsernameStatus({ checking: false, available: null, message: "" });
      return;
    }
    if (formData.username.length < 3) {
      setUsernameStatus({ checking: false, available: false, message: "Username must be at least 3 characters" });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      setUsernameStatus({ checking: false, available: false, message: "Only letters, numbers, and underscores allowed" });
      return;
    }
    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);
    setUsernameStatus({ checking: true, available: null, message: "Checking..." });
    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const { data } = await supabase.from("profiles").select("username").eq("username", formData.username.toLowerCase()).maybeSingle();
        if (data) {
          setUsernameStatus({ checking: false, available: false, message: "Username already taken" });
        } else {
          setUsernameStatus({ checking: false, available: true, message: "Username available!" });
        }
      } catch (err) {
        setUsernameStatus({ checking: false, available: true, message: "Username available!" });
      }
    }, 500);
    return () => clearTimeout(usernameCheckTimeout.current);
  }, [formData.username]);

  const validateStep1 = () => {
    if (!formData.email || !formData.password || !formData.confirmPassword || !formData.username) {
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
    if (!usernameStatus.available) {
      Alert.alert("Invalid Username", usernameStatus.message || "Please choose a valid username");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.day || !formData.month || !formData.year || !formData.gender) {
      Alert.alert("Incomplete Details", "Please select your complete date of birth and gender");
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

  const validateStep3 = () => {
    if (!formData.education) {
      Alert.alert("Missing Education", "Please select your school or college.");
      return false;
    }
    if (formData.education === "Other" && !formData.customEducation.trim()) {
      Alert.alert("Missing Education", "Please specify your school or college.");
      return false;
    }
    const totalInterests = formData.interests.length + formData.customInterests.length;
    if (totalInterests < 3) {
      Alert.alert("More Interests Needed", "Please select or add at least 3 interests.");
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    switch (step) {
      case 1: if (validateStep1()) { setStep(2); fadeAnim.setValue(0); } break;
      case 2: if (validateStep2()) { setStep(3); fadeAnim.setValue(0); } break;
      case 3: if (validateStep3()) { setStep(4); fadeAnim.setValue(0); } break;
    }
  };

  const handleBack = () => {
    if (step > 1) { setStep(step - 1); fadeAnim.setValue(0); }
  };

  const handleFinalSignup = async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          Alert.alert("Account Exists", "This email is already registered.", [{ text: "Go to Login", onPress: () => router.push("/login") }]);
          return;
        }
        Alert.alert("Signup Error", authError.message);
        return;
      }

      if (authData.user) {
        const contactVal = formData.contact ? `${formData.countryCode}${formData.contact}` : null;
        
        let finalEducation = formData.education;
        if (finalEducation === "Other") finalEducation = formData.customEducation.trim();
        
        const finalInterests = [...formData.interests, ...formData.customInterests];

        const { error: profileError } = await supabase.from("profiles").insert([{
          id: authData.user.id,
          name: formData.username,
          username: formData.username.toLowerCase(),
          date_of_birth: formData.dateOfBirth,
          gender: formData.gender,
          education: finalEducation,
          interests: finalInterests,
          hints: [],
          contact: contactVal,
        }]);

        if (profileError) {
          Alert.alert("Error", profileError.message);
          await supabase.auth.signOut();
        } else {
          Alert.alert("Success! 🎉", "Your account has been created successfully!", [{ text: "Get Started", onPress: () => router.replace("/home/HomeScreen") }]);
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
    if (datePickerType === 'day') items = Array.from({ length: 31 }, (_, i) => i + 1);
    else if (datePickerType === 'month') items = [{ value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' }, { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' }, { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' }, { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }];
    else if (datePickerType === 'year') items = Array.from({ length: 100 }, (_, i) => currentYear - i);

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => typeof item === 'object' ? item.value.toString() : item.toString()}
        renderItem={({ item }) => {
          const value = typeof item === 'object' ? item.value : item;
          const label = typeof item === 'object' ? item.label : item;
          return (
            <TouchableOpacity style={styles.pickerItem} onPress={() => {
              if (datePickerType === 'day') updateFormData('day', value.toString());
              if (datePickerType === 'month') updateFormData('month', value.toString());
              if (datePickerType === 'year') updateFormData('year', value.toString());
              setShowDatePicker(false);
            }}>
              <Text style={styles.pickerItemText}>{label}</Text>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  // Only show matching interests from the default list (not a custom entry appended)
  const filteredInterests = DEFAULT_INTERESTS.filter(i =>
    i.toLowerCase().includes(interestSearch.toLowerCase())
  );
  // Whether the user's search text is a new custom interest (not already in defaults or selected)
  const canAddCustomInterest =
    interestSearch.trim().length > 0 &&
    !DEFAULT_INTERESTS.some(i => i.toLowerCase() === interestSearch.trim().toLowerCase()) &&
    !formData.customInterests.includes(interestSearch.trim());

  // For schools: filter list; when no match AND there's a query, show "Other"
  const baseSchools = DEFAULT_SCHOOLS.filter(s => s !== "Other");
  const filteredSchools = educationSearch.length > 0
    ? baseSchools.filter(s => s.toLowerCase().includes(educationSearch.toLowerCase()))
    : baseSchools;
  // Append "Other" when the typed search has no exact match in list
  const showOtherSchool = educationSearch.length > 0
    ? filteredSchools.length === 0 || !filteredSchools.some(s => s.toLowerCase() === educationSearch.toLowerCase())
    : true; // always show Other at bottom when no search

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <Text style={styles.stepTitle}>Account Details</Text>
            <Text style={styles.stepDescription}>Set up your login info</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput placeholder="your.email@example.com" value={formData.email} onChangeText={t => updateFormData('email', t)} style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholderTextColor="#9CA3AF" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput placeholder="username" value={formData.username} onChangeText={t => updateFormData('username', t.toLowerCase())} style={styles.input} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#9CA3AF" />
              {usernameStatus.checking && <Text style={{color: '#9CA3AF', marginTop: 4}}>{usernameStatus.message}</Text>}
              {!usernameStatus.checking && usernameStatus.available === false && <Text style={{color: '#EF4444', marginTop: 4}}>{usernameStatus.message}</Text>}
              {!usernameStatus.checking && usernameStatus.available === true && <Text style={{color: '#10B981', marginTop: 4}}>{usernameStatus.message}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput placeholder="Create a strong password" secureTextEntry value={formData.password} onChangeText={t => updateFormData('password', t)} style={styles.input} placeholderTextColor="#9CA3AF" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput placeholder="Re-enter your password" secureTextEntry value={formData.confirmPassword} onChangeText={t => updateFormData('confirmPassword', t)} style={styles.input} placeholderTextColor="#9CA3AF" />
            </View>
          </Animated.View>
        );

      case 2:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <Text style={styles.stepTitle}>Personal Info</Text>
            <Text style={styles.stepDescription}>Tell us about yourself</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date of Birth</Text>
              <View style={styles.dateSelectContainer}>
                <TouchableOpacity style={styles.dateSelectButton} onPress={() => openDatePicker('day')}><Text style={styles.dateSelectValue}>{formData.day || 'DD'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.dateSelectButton} onPress={() => openDatePicker('month')}><Text style={styles.dateSelectValue}>{formData.month ? new Date(2000, formData.month - 1).toLocaleString('default', { month: 'short' }) : 'MM'}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.dateSelectButton, styles.yearButton]} onPress={() => openDatePicker('year')}><Text style={styles.dateSelectValue}>{formData.year || 'YYYY'}</Text></TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.genderContainer}>
                {['Male', 'Female', 'Other'].map(g => (
                  <TouchableOpacity key={g} style={[styles.genderBtn, formData.gender === g && styles.genderBtnActive]} onPress={() => updateFormData('gender', g)}>
                    <Text style={[styles.genderText, formData.gender === g && styles.genderTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Modal visible={showDatePicker} animationType="slide" transparent={true} onRequestClose={() => setShowDatePicker(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select {datePickerType}</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
                  </View>
                  {renderDatePickerContent()}
                </View>
              </View>
            </Modal>
          </Animated.View>
        );

      case 3:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <Text style={styles.stepTitle}>Interests & Education</Text>
            <Text style={styles.stepDescription}>Help us personalise your experience</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Education / College / School</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => setShowEducationModal(true)}>
                <Text style={formData.education ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
                  {formData.education === "Other" ? "Other — type below" : (formData.education || "Select your education...")}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              {formData.education === "Other" && (
                <TextInput 
                  placeholder="Type your school / college name" 
                  value={formData.customEducation} 
                  onChangeText={t => updateFormData('customEducation', t)} 
                  style={[styles.input, { marginTop: 10 }]} 
                  placeholderTextColor="#9CA3AF"
                  autoFocus
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Interests</Text>
                {(formData.interests.length > 0 || formData.customInterests.length > 0) && (
                  <Text style={styles.selectedCountInline}>
                    {formData.interests.length + formData.customInterests.length} / 3+ selected
                  </Text>
                )}
              </View>

              {/* Search bar + Add button in a row */}
              <View style={styles.interestSearchRow}>
                <TextInput 
                  placeholder="Search or type an interest..." 
                  value={interestSearch} 
                  onChangeText={setInterestSearch}
                  onSubmitEditing={canAddCustomInterest ? addCustomInterest : undefined}
                  returnKeyType={canAddCustomInterest ? "done" : "search"}
                  style={styles.interestSearchInput} 
                  placeholderTextColor="#9CA3AF" 
                />
                {canAddCustomInterest && (
                  <TouchableOpacity style={styles.addBtn} onPress={addCustomInterest}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Default interest pills filtered by search */}
              <View style={styles.pillsContainer}>
                {filteredInterests.map(interest => (
                  <TouchableOpacity 
                    key={interest} 
                    style={[styles.pill, formData.interests.includes(interest) && styles.pillActive]}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text style={[styles.pillText, formData.interests.includes(interest) && styles.pillTextActive]}>
                      {interest}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Custom-added interests — removable pills */}
                {formData.customInterests.map(interest => (
                  <TouchableOpacity 
                    key={`custom-${interest}`} 
                    style={styles.pillCustom}
                    onPress={() => removeCustomInterest(interest)}
                  >
                    <Text style={styles.pillCustomText}>{interest}</Text>
                    <Ionicons name="close-circle" size={14} color="#4F46E5" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Count removed from here — shown in label row instead */}
            </View>

            {/* Education Modal */}
            <Modal visible={showEducationModal} animationType="slide" transparent={true} onRequestClose={() => { setShowEducationModal(false); setEducationSearch(""); }}>
              <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { height: '80%' }]}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Education</Text>
                    <TouchableOpacity onPress={() => { setShowEducationModal(false); setEducationSearch(""); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
                  </View>
                  <View style={styles.modalSearchContainer}>
                    <TextInput 
                      placeholder="Search schools & colleges..." 
                      value={educationSearch} 
                      onChangeText={setEducationSearch} 
                      style={styles.modalSearchInput} 
                      placeholderTextColor="#9CA3AF"
                      autoFocus
                    />
                  </View>
                  <FlatList
                    data={[...filteredSchools, ...(showOtherSchool ? ["Other"] : [])]}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                      <TouchableOpacity 
                        style={[styles.pickerItem, item === "Other" && styles.pickerItemOther]} 
                        onPress={() => {
                          updateFormData('education', item);
                          updateFormData('customEducation', '');
                          setShowEducationModal(false);
                          setEducationSearch("");
                        }}
                      >
                        <Text style={[styles.pickerItemText, item === "Other" && styles.pickerItemTextOther]}>
                          {item === "Other" ? "Others" : item}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Modal>
          </Animated.View>
        );

      case 4:
        return (
          <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
            <Text style={styles.stepTitle}>Contact Info</Text>
            <Text style={styles.stepDescription}>Optional details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
              <View style={styles.phoneContainer}>
                <TouchableOpacity style={styles.countryCodeButton} onPress={() => setShowCountryPicker(true)}>
                  <Text style={styles.countryFlag}>{COUNTRY_CODES.find(c => c.code === formData.countryCode)?.flag}</Text>
                  <Text style={styles.countryCode}>{formData.countryCode}</Text>
                </TouchableOpacity>

                <TextInput placeholder="10 digit number" value={formData.contact} onChangeText={t => { const cleaned = t.replace(/\D/g, ''); if (cleaned.length <= 10) updateFormData('contact', cleaned); }} style={[styles.input, styles.phoneInput]} keyboardType="phone-pad" maxLength={10} placeholderTextColor="#9CA3AF" />
              </View>
            </View>

            <Modal visible={showCountryPicker} animationType="slide" transparent={true} onRequestClose={() => setShowCountryPicker(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Country Code</Text>
                    <TouchableOpacity onPress={() => setShowCountryPicker(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
                  </View>
                  <FlatList data={COUNTRY_CODES} keyExtractor={(item) => item.code} renderItem={({ item }) => (
                    <TouchableOpacity style={styles.countryItem} onPress={() => { updateFormData('countryCode', item.code); setShowCountryPicker(false); }}>
                      <Text style={styles.countryItemFlag}>{item.flag}</Text>
                      <Text style={styles.countryItemName}>{item.country}</Text>
                      <Text style={styles.countryItemCode}>{item.code}</Text>
                    </TouchableOpacity>
                  )} />
                </View>
              </View>
            </Modal>
          </Animated.View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>Connecti</Text>
          <Text style={styles.headerTitle}>Create Account</Text>

          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              {[1, 2, 3, 4].map((s) => (
                <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive]} />
              ))}
            </View>
          </View>
        </View>

        {renderStep()}

        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity onPress={handleBack} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {step < 4 ? (
            <TouchableOpacity onPress={handleNext} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleFinalSignup} disabled={loading} style={[styles.button, styles.primaryButton, loading && styles.disabledButton]}>
              <Text style={styles.primaryButtonText}>{loading ? "Creating..." : "Complete Signup"}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.footerLink}> Log In</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContent: { paddingBottom: 60, flexGrow: 1 },
  header: { paddingHorizontal: IS_TABLET ? 60 : 24, paddingTop: 24, paddingBottom: 16 },
  logo: { fontSize: IS_TABLET ? 40 : 32, fontWeight: "800", color: "#111827", marginBottom: 8 },
  headerTitle: { fontSize: 20, color: "#6B7280", marginBottom: 30 },
  progressContainer: { alignItems: 'center' },
  progressTrack: { flexDirection: 'row', gap: 12 },
  progressDot: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2 },
  progressDotActive: { backgroundColor: '#6366F1' },
  stepContainer: { paddingHorizontal: IS_TABLET ? 60 : 24, paddingVertical: 12 },
  stepTitle: { fontSize: IS_TABLET ? 34 : 28, fontWeight: '700', color: '#111827', marginBottom: 8 },
  stepDescription: { fontSize: IS_TABLET ? 18 : 16, color: '#6B7280', marginBottom: 20 },
  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  selectedCountInline: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  input: { borderWidth: 1.5, borderColor: "#E5E7EB", padding: IS_TABLET ? 16 : 13, borderRadius: 12, backgroundColor: "#FFFFFF", fontSize: IS_TABLET ? 18 : 16, color: '#111827' },
  searchInput: { borderWidth: 1.5, borderColor: "#E5E7EB", padding: 10, borderRadius: 12, backgroundColor: "#FFFFFF", fontSize: 15, color: '#111827', marginBottom: 10 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pillActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  pillText: { fontSize: 14, color: '#4B5563' },
  pillTextActive: { color: '#4F46E5', fontWeight: '600' },
  dropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: "#E5E7EB", padding: 13, borderRadius: 12, backgroundColor: "#FFFFFF" },
  dropdownButtonText: { fontSize: 16, color: '#111827' },
  dropdownButtonPlaceholder: { fontSize: 16, color: '#9CA3AF' },
  buttonContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 12, marginTop: 20 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#6366F1' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#E5E7EB' },
  secondaryButtonText: { color: '#374151', fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.7 },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 24 },
  footerText: { fontSize: 14, color: "#6B7280" },
  footerLink: { fontSize: 14, fontWeight: "700", color: "#6366F1" },
  dateSelectContainer: { flexDirection: 'row', gap: 10 },
  dateSelectButton: { flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 13, borderRadius: 12, alignItems: 'center' },
  dateSelectValue: { color: '#111827', fontSize: 16 },
  genderContainer: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 13, borderRadius: 12, alignItems: 'center' },
  genderBtnActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  genderText: { color: '#374151', fontSize: 14 },
  genderTextActive: { fontWeight: 'bold', color: '#4F46E5' },
  phoneContainer: { flexDirection: 'row', gap: 10 },
  countryCodeButton: { borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryFlag: { fontSize: 18 },
  countryCode: { color: '#111827', fontSize: 16 },
  phoneInput: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { color: '#111827', fontSize: 18, fontWeight: 'bold' },
  modalClose: { color: '#111827', fontSize: 18 },
  modalSearchContainer: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalSearchInput: { backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, fontSize: 16, color: '#111827' },
  pickerItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  pickerItemText: { color: '#111827', fontSize: 16 },
  countryItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', alignItems: 'center' },
  countryItemFlag: { fontSize: 24, marginRight: 12 },
  countryItemName: { color: '#111827', fontSize: 16, flex: 1 },
  countryItemCode: { color: '#6B7280', fontSize: 16 },
  // Interests
  interestSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  interestSearchInput: { flex: 1, borderWidth: 1.5, borderColor: "#E5E7EB", padding: 11, borderRadius: 12, backgroundColor: "#FFFFFF", fontSize: 15, color: '#111827' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, gap: 4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  pillCustom: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#6366F1' },
  pillCustomText: { color: '#4F46E5', fontWeight: '600', fontSize: 14 },
  selectedCount: { marginTop: 10, fontSize: 13, color: '#6B7280' },
  // Education "Other" row
  pickerItemOther: { backgroundColor: '#F5F3FF' },
  pickerItemTextOther: { color: '#6366F1', fontWeight: '600' },
});


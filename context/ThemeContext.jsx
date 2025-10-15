import React, { createContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const lightTheme = {
  primary: '#007ffc', // Deep blue
  primaryLight: '#0139c4',
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardSecondary: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  inputBackground: '#F8FAFC',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444'
};

const darkTheme = {
  primary: '#3B82F6', // Bright blue for dark mode
  primaryLight: '#60A5FA',
  background: '#0F172A',
  card: '#1E293B',
  cardSecondary: '#334155',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#334155',
  inputBackground: '#1E293B',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444'
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const [theme, setTheme] = useState(lightTheme);

  useEffect(() => {
    setTheme(isDark ? darkTheme : lightTheme);
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export { ThemeContext };
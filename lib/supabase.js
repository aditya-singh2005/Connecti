import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = "https://qczxsjfkjpcvjbqvcqbc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjenhzamZranBjdmpicXZjcWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4OTE1ODIsImV4cCI6MjA3MjQ2NzU4Mn0.B4LAlYkS4U1dYjph6QdexQmKFhIyBG69Dg6C3VmGeeY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

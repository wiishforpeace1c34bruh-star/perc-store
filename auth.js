import { createClient } from '@supabase/supabase-js';

// TODO: Replace 'YOUR_SUPABASE_ANON_KEY' with your actual Anon key from your Supabase Dashboard -> Project Settings -> API
const supabaseUrl = 'https://knlydfmovffoxtnynevy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubHlkZm1vdmZmb3h0bnluZXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjQ1NDMsImV4cCI6MjA5NTk0MDU0M30.Z24Xmcs0aEQD6l_jNJfpOWAixZ0L7oOoDvgGZlUfEHc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Auth Guard for Protected Pages ---
export async function requireAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

// --- Redirect if already logged in ---
export async function requireGuest() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = '/dashboard.html';
    return null;
  }
}

/**
 * auth.js — Authentication & session management for perc.store
 */
import { createClient } from '@supabase/supabase-js';
import { initDashboard } from './dashboard.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('[perc] Supabase credentials missing. Auth disabled.');
}

export function initAuth() {
  const modal    = document.getElementById('auth-modal');
  const overlay  = document.getElementById('auth-overlay');
  const btnLogin = document.getElementById('btn-nav-login');
  const btnMob   = document.getElementById('btn-mobile-login');
  const btnClose = document.getElementById('btn-close-auth');
  const form     = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('btn-auth-toggle');
  const title    = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleTxt = document.getElementById('auth-toggle-text');
  const errorBox = document.getElementById('auth-error');

  let isSignUp = false;
  let dashInit = false;

  // ─── Open / Close modal ───
  function openModal() {
    if (!modal || !overlay) return;
    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetForm();
    setTimeout(() => document.getElementById('auth-email')?.focus(), 80);
  }

  function closeModal() {
    modal?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  btnLogin?.addEventListener('click', openModal);
  btnMob?.addEventListener('click', () => { document.getElementById('nav-mobile-menu')?.classList.remove('open'); openModal(); });
  btnClose?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ─── Toggle sign-in / sign-up ───
  function setMode(signup) {
    isSignUp = signup;
    const ug = document.getElementById('auth-username-group');
    const ui = document.getElementById('auth-username');
    if (signup) {
      if (title) title.textContent = 'Create account';
      if (subtitle) subtitle.textContent = 'Join the perc community';
      if (submitBtn) submitBtn.textContent = 'Sign Up';
      if (toggleTxt) toggleTxt.textContent = 'Already have an account?';
      if (toggleBtn) toggleBtn.textContent = 'Sign in';
      if (ug) ug.style.display = 'block';
      if (ui) ui.required = true;
    } else {
      if (title) title.textContent = 'Welcome back';
      if (subtitle) subtitle.textContent = 'Sign in to access your dashboard';
      if (submitBtn) submitBtn.textContent = 'Sign In';
      if (toggleTxt) toggleTxt.textContent = "Don't have an account?";
      if (toggleBtn) toggleBtn.textContent = 'Sign up';
      if (ug) ug.style.display = 'none';
      if (ui) ui.required = false;
    }
  }

  toggleBtn?.addEventListener('click', () => { resetForm(); setMode(!isSignUp); });

  function showError(msg) { if (errorBox) { errorBox.textContent = msg; errorBox.classList.add('show'); } }
  function clearError() { if (errorBox) { errorBox.textContent = ''; errorBox.classList.remove('show'); } }

  function resetForm() {
    form?.reset();
    clearError();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In'; }
  }

  // ─── Form submit ───
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const honey = document.getElementById('bot-field');
    if (honey && honey.value) return;
    if (!supabase) { showError('Authentication service unavailable.'); return; }

    const email    = document.getElementById('auth-email')?.value.trim() || '';
    const password = document.getElementById('auth-password')?.value || '';
    const username = document.getElementById('auth-username')?.value.trim() || '';

    clearError();
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }

    try {
      let session;
      if (isSignUp) {
        if (!username) throw new Error('Username is required.');
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        if (data.user?.identities?.length === 0) throw new Error('Email already registered. Sign in instead.');
        if (!data.session) {
          const r2 = await supabase.auth.signInWithPassword({ email, password });
          if (r2.error) throw r2.error;
          session = r2.data.session;
        } else { session = data.session; }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        session = data.session;
      }

      closeModal();
      updateNavForAuth(session);
      window.showDashboard?.();
      if (!dashInit) { await initDashboard(supabase, session); dashInit = true; }
      window.showToast?.('Signed in', 'success');

    } catch (err) {
      showError(err.message || 'Authentication failed.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In'; }
    }
  });

  // ─── Session restore on load ───
  async function checkExistingSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      updateNavForAuth(session);
      if (!dashInit) { await initDashboard(supabase, session); dashInit = true; }
    }
  }

  function updateNavForAuth(session) {
    // Replace "Log in" with "Dashboard" button
    const loginEl = document.getElementById('btn-nav-login');
    if (loginEl) {
      const clone = loginEl.cloneNode(true);
      clone.textContent = 'Dashboard';
      clone.addEventListener('click', async () => {
        window.showDashboard?.();
        if (!dashInit && session) { await initDashboard(supabase, session); dashInit = true; }
      });
      loginEl.parentNode.replaceChild(clone, loginEl);
    }

    // Show logout button
    const logEl = document.getElementById('btn-nav-logout');
    if (logEl) {
      logEl.style.display = 'inline-flex';
      const clone = logEl.cloneNode(true);
      clone.addEventListener('click', async () => { await supabase?.auth.signOut(); window.location.reload(); });
      logEl.parentNode.replaceChild(clone, logEl);
    }

    // Dashboard logout
    const dashLogEl = document.getElementById('btn-dashboard-logout');
    if (dashLogEl) {
      const clone = dashLogEl.cloneNode(true);
      clone.addEventListener('click', async () => { await supabase?.auth.signOut(); window.location.reload(); });
      dashLogEl.parentNode.replaceChild(clone, dashLogEl);
    }
  }

  checkExistingSession();
}

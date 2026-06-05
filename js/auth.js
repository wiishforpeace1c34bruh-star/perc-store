/**
 * auth.js — Authentication module for perc.store
 */
import { createClient } from '@supabase/supabase-js';
import { initDashboard } from './dashboard.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase credentials missing.');
}

export function initAuth() {
  const modal     = document.getElementById('auth-modal');
  const overlay   = document.getElementById('auth-overlay');
  const btnLogin  = document.getElementById('btn-nav-login');
  const btnMobile = document.getElementById('btn-mobile-login');
  const btnClose  = document.getElementById('btn-close-auth');
  const form      = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('btn-auth-toggle');
  const title     = document.getElementById('auth-title');
  const subtitle  = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleTxt = document.getElementById('auth-toggle-text');
  const errorBox  = document.getElementById('auth-error');

  let isSignUp = false;
  let dashboardInitialized = false;

  // ─── Dashboard show/hide ───
  function showDashboard() {
    document.getElementById('main-landing').style.display = 'none';
    document.getElementById('main-landing').classList.add('hidden');
    document.getElementById('main-dashboard').style.display = 'block';
    document.getElementById('main-dashboard').classList.remove('hidden');
  }

  function hideDashboard() {
    document.getElementById('main-landing').style.display = '';
    document.getElementById('main-landing').classList.remove('hidden');
    document.getElementById('main-dashboard').style.display = 'none';
    document.getElementById('main-dashboard').classList.add('hidden');
  }

  // ─── Modal open/close ───
  function openModal() {
    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetForm();
    setTimeout(() => document.getElementById('auth-email')?.focus(), 50);
  }

  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (btnLogin)  btnLogin.addEventListener('click', openModal);
  if (btnMobile) btnMobile.addEventListener('click', () => { document.getElementById('nav-mobile-menu')?.classList.remove('open'); openModal(); });
  if (btnClose)  btnClose.addEventListener('click', closeModal);
  if (overlay)   overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ─── Sign up / Sign in toggle ───
  function toggleMode() {
    isSignUp = !isSignUp;
    resetForm();
    const ug = document.getElementById('auth-username-group');
    const ui = document.getElementById('auth-username');
    if (isSignUp) {
      title.textContent     = 'Create account';
      subtitle.textContent  = 'Join the perc community';
      submitBtn.textContent = 'Sign Up';
      toggleTxt.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in';
      if (ug) ug.style.display = 'block';
      if (ui) ui.required = true;
    } else {
      title.textContent     = 'Welcome back';
      subtitle.textContent  = 'Sign in to access your dashboard';
      submitBtn.textContent = 'Sign In';
      toggleTxt.textContent = "Don't have an account?";
      toggleBtn.textContent = 'Sign up';
      if (ug) ug.style.display = 'none';
      if (ui) ui.required = false;
    }
  }
  if (toggleBtn) toggleBtn.addEventListener('click', toggleMode);

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.remove('show');
  }

  function resetForm() {
    if (form) form.reset();
    clearError();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In'; }
  }

  // ─── Form submit ───
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const honeypot = document.getElementById('bot-field');
      if (honeypot && honeypot.value !== '') return;
      if (!supabase) { showError('Authentication service is not configured.'); return; }

      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const username = (document.getElementById('auth-username')?.value || '').trim();

      clearError();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        let session;
        if (isSignUp) {
          if (!username) throw new Error('Username is required.');
          const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
          if (error) throw error;
          if (data.user?.identities?.length === 0) throw new Error('This email is already registered.');
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
        updateUILoggedIn(session);
        showDashboard();
        if (!dashboardInitialized) {
          await initDashboard(supabase, session);
          dashboardInitialized = true;
        }
        window.showToast?.('Signed in successfully', 'success');
      } catch (err) {
        showError(err.message || 'Authentication failed.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
      }
    });
  }

  // ─── Session restore ───
  async function checkSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      updateUILoggedIn(session);
      showDashboard();
      if (!dashboardInitialized) {
        await initDashboard(supabase, session);
        dashboardInitialized = true;
      }
    }
  }

  function updateUILoggedIn(session) {
    // Swap "Log in" → "Dashboard" 
    const loginBtn = document.getElementById('btn-nav-login');
    if (loginBtn) {
      const clone = loginBtn.cloneNode(true);
      clone.textContent = 'Dashboard';
      clone.addEventListener('click', async () => {
        showDashboard();
        if (!dashboardInitialized && session) {
          await initDashboard(supabase, session);
          dashboardInitialized = true;
        }
      });
      loginBtn.parentNode.replaceChild(clone, loginBtn);
    }

    // Show logout button
    const logoutBtn = document.getElementById('btn-nav-logout');
    if (logoutBtn) {
      logoutBtn.style.display = 'inline-flex';
      const clone = logoutBtn.cloneNode(true);
      clone.addEventListener('click', async () => { await supabase.auth.signOut(); window.location.reload(); });
      logoutBtn.parentNode.replaceChild(clone, logoutBtn);
    }

    // Dashboard logout button
    const dashLogout = document.getElementById('btn-dashboard-logout');
    if (dashLogout) {
      dashLogout.addEventListener('click', async () => { await supabase.auth.signOut(); window.location.reload(); });
    }
  }

  checkSession();
}

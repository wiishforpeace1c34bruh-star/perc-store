/**
 * auth.js — Authentication module for perc.store
 * Handles the Supabase auth flow and modal UI
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase credentials missing. Auth will not work until .env is configured.');
}

export function initAuth() {
  const modal = document.getElementById('auth-modal');
  const overlay = document.getElementById('auth-overlay');
  
  const btnNavLogin = document.getElementById('btn-nav-login');
  const btnMobileLogin = document.getElementById('btn-mobile-login');
  const btnClose = document.getElementById('btn-close-auth');
  
  const form = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('btn-auth-toggle');
  
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleText = document.getElementById('auth-toggle-text');
  const errorBox = document.getElementById('auth-error');

  let isSignUpMode = false;

  // --- Modal Visibility ---

  function openModal() {
    modal.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    resetForm();
  }

  function closeModal() {
    modal.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnNavLogin) btnNavLogin.addEventListener('click', openModal);
  if (btnMobileLogin) btnMobileLogin.addEventListener('click', () => {
    // Also close mobile menu if it's open
    const mobileMenu = document.getElementById('nav-mobile-menu');
    const mobileToggle = document.getElementById('nav-mobile-toggle');
    if (mobileMenu) mobileMenu.classList.remove('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    openModal();
  });
  
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // --- Toggle Mode (Login <-> Signup) ---

  function toggleMode() {
    isSignUpMode = !isSignUpMode;
    resetForm();

    const usernameGroup = document.getElementById('auth-username-group');
    const usernameInput = document.getElementById('auth-username');

    if (isSignUpMode) {
      title.textContent = 'Create Account';
      subtitle.textContent = 'Join the intelligence network';
      submitBtn.textContent = 'Sign Up';
      toggleText.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in';
      if (usernameGroup) usernameGroup.style.display = 'block';
      if (usernameInput) usernameInput.required = true;
    } else {
      title.textContent = 'Welcome back';
      subtitle.textContent = 'Sign in to access your dashboard';
      submitBtn.textContent = 'Sign In';
      toggleText.textContent = "Don't have an account?";
      toggleBtn.textContent = 'Sign up';
      if (usernameGroup) usernameGroup.style.display = 'none';
      if (usernameInput) usernameInput.required = false;
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggleMode);

  function resetForm() {
    form.reset();
    errorBox.textContent = '';
    submitBtn.disabled = false;
  }

  // --- Form Submission ---

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Honeypot check for bots
      const honeypot = document.getElementById('bot-field');
      if (honeypot && honeypot.value !== '') {
        console.warn('Bot detected.');
        return; // silently fail
      }

      if (!supabase) {
        errorBox.textContent = 'Authentication service is not configured yet.';
        return;
      }

      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const username = document.getElementById('auth-username') ? document.getElementById('auth-username').value : '';

      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        let result;
        if (isSignUpMode) {
          result = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: username
              }
            }
          });
          
          if (result.error) throw result.error;
          
          if (result.data.user && result.data.user.identities && result.data.user.identities.length === 0) {
            errorBox.textContent = 'This email is already registered. Please sign in.';
          } else {
            // Success
            alert('Account created successfully! Welcome to PERC.');
            closeModal();
            updateUIForLoggedInUser();
          }

        } else {
          result = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (result.error) throw result.error;

          // Success
          closeModal();
          updateUIForLoggedInUser();
        }
      } catch (err) {
        errorBox.textContent = err.message || 'An error occurred during authentication.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
      }
    });
  }

  // --- Session Management ---

  async function checkSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      updateUIForLoggedInUser();
    }
  }

  function updateUIForLoggedInUser() {
    if (btnNavLogin) {
      btnNavLogin.textContent = 'Dashboard';
      // Here you would redirect to the actual dashboard app
      btnNavLogin.removeEventListener('click', openModal);
      btnNavLogin.addEventListener('click', () => {
        alert('Dashboard redirect goes here!');
      });
    }
    if (btnMobileLogin) {
      btnMobileLogin.textContent = 'Dashboard';
    }
  }

  checkSession();
}

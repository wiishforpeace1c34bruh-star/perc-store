/**
 * auth.js — Authentication module for perc.store
 * Handles the Supabase auth flow, including mandatory TOTP MFA.
 */

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

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
  
  // States
  const stateLogin = document.getElementById('auth-state-login');
  const stateSetup2fa = document.getElementById('auth-state-setup-2fa');
  const stateChallenge2fa = document.getElementById('auth-state-challenge-2fa');

  // Forms
  const form = document.getElementById('auth-form');
  const formSetup2fa = document.getElementById('setup-2fa-form');
  const formChallenge2fa = document.getElementById('challenge-2fa-form');

  const toggleBtn = document.getElementById('btn-auth-toggle');
  
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleText = document.getElementById('auth-toggle-text');
  const errorBox = document.getElementById('auth-error');

  let isSignUpMode = false;
  let currentFactorId = null;

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
    const mobileMenu = document.getElementById('nav-mobile-menu');
    const mobileToggle = document.getElementById('nav-mobile-toggle');
    if (mobileMenu) mobileMenu.classList.remove('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    openModal();
  });
  
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);
  
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
    stateLogin.style.display = 'block';
    stateSetup2fa.style.display = 'none';
    stateChallenge2fa.style.display = 'none';

    form.reset();
    if(formSetup2fa) formSetup2fa.reset();
    if(formChallenge2fa) formChallenge2fa.reset();

    errorBox.textContent = '';
    submitBtn.disabled = false;
  }

  // --- 2FA Flows ---

  async function init2FASetup() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      currentFactorId = data.id;

      stateLogin.style.display = 'none';
      stateSetup2fa.style.display = 'block';
      title.textContent = 'Secure Account';
      subtitle.textContent = 'Mandatory 2FA Setup';

      const qrContainer = document.getElementById('qrcode-render');
      try {
        const qrDataUrl = await QRCode.toDataURL(data.totp.uri, {
          width: 180,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="2FA QR Code" style="border-radius: 8px;">`;
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }

      document.getElementById('auth-secret-code').textContent = data.totp.secret;
    } catch (err) {
      errorBox.textContent = "Failed to initialize 2FA setup: " + err.message;
      stateLogin.style.display = 'block';
      stateSetup2fa.style.display = 'none';
    }
  }

  async function init2FAChallenge() {
    try {
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactor = factors.totp.find(factor => factor.status === 'verified');
      
      if (!totpFactor) {
        // User created account but didn't finish 2FA setup. Force setup.
        init2FASetup();
        return;
      }

      currentFactorId = totpFactor.id;

      stateLogin.style.display = 'none';
      stateChallenge2fa.style.display = 'block';
      title.textContent = 'Authentication Required';
      subtitle.textContent = 'Your account is protected by 2FA';

    } catch (err) {
      errorBox.textContent = "Failed to load 2FA factors: " + err.message;
    }
  }

  if (formSetup2fa) {
    formSetup2fa.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('setup-2fa-code').value;
      const errorEl = document.getElementById('setup-2fa-error');
      const btn = document.getElementById('btn-setup-2fa-submit');
      
      errorEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        const challenge = await supabase.auth.mfa.challenge({ factorId: currentFactorId });
        if (challenge.error) throw challenge.error;

        const verify = await supabase.auth.mfa.verify({
          factorId: currentFactorId,
          challengeId: challenge.data.id,
          code
        });

        if (verify.error) throw verify.error;

        alert('2FA Setup Complete! Welcome to PERC.');
        closeModal();
        updateUIForLoggedInUser();
      } catch (err) {
        errorEl.textContent = err.message || 'Invalid code.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Complete';
      }
    });
  }

  if (formChallenge2fa) {
    formChallenge2fa.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('challenge-2fa-code').value;
      const errorEl = document.getElementById('challenge-2fa-error');
      const btn = document.getElementById('btn-challenge-2fa-submit');
      
      errorEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Authenticating...';

      try {
        const challenge = await supabase.auth.mfa.challenge({ factorId: currentFactorId });
        if (challenge.error) throw challenge.error;

        const verify = await supabase.auth.mfa.verify({
          factorId: currentFactorId,
          challengeId: challenge.data.id,
          code
        });

        if (verify.error) throw verify.error;

        closeModal();
        updateUIForLoggedInUser();
      } catch (err) {
        errorEl.textContent = err.message || 'Invalid authenticator code.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authenticate';
      }
    });
  }

  // --- Form Submission (Login/Signup) ---

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const honeypot = document.getElementById('bot-field');
      if (honeypot && honeypot.value !== '') return;

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
        if (isSignUpMode) {
          const result = await supabase.auth.signUp({
            email, password, options: { data: { username: username } }
          });
          
          if (result.error) throw result.error;
          if (result.data.user && result.data.user.identities && result.data.user.identities.length === 0) {
            throw new Error('This email is already registered. Please sign in.');
          }
          
          if (!result.data.session) {
             const loginResult = await supabase.auth.signInWithPassword({ email, password });
             if (loginResult.error) throw loginResult.error;
          }

          // Successful signup, force 2FA setup
          await init2FASetup();

        } else {
          const result = await supabase.auth.signInWithPassword({ email, password });
          if (result.error) throw result.error;

          // Check if MFA is required
          const { data: aalInfo, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aalError) throw aalError;

          if (aalInfo.nextLevel === 'aal2') {
            await init2FAChallenge();
          } else {
            // No 2FA required (or not enrolled, force enrollment)
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const hasVerified = factors && factors.totp && factors.totp.some(f => f.status === 'verified');
            
            if (!hasVerified) {
               await init2FASetup();
            } else {
               closeModal();
               updateUIForLoggedInUser();
            }
          }
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
      // If they have an active session, ensure AAL is met
      const { data: aalInfo } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalInfo && aalInfo.nextLevel === 'aal2' && aalInfo.currentLevel !== 'aal2') {
        // They need to complete 2FA to be fully logged in
        openModal();
        await init2FAChallenge();
      } else {
        updateUIForLoggedInUser();
      }
    }
  }

  function updateUIForLoggedInUser() {
    if (btnNavLogin) {
      btnNavLogin.textContent = 'Dashboard';
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

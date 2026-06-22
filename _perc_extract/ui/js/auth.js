/**
 * auth.js — Authentication module for perc.store
 * Handles the Supabase auth flow, including mandatory TOTP MFA.
 */import { createClient } from '@supabase/supabase-js';
import { initDashboard } from './dashboard.js';

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

  // Forms
  const form = document.getElementById('auth-form');

  const toggleBtn = document.getElementById('btn-auth-toggle');
  
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleText = document.getElementById('auth-toggle-text');
  const errorBox = document.getElementById('auth-error');

  let isSignUpMode = false;
  let dashboardInitialized = false;

  function showDashboard() {
    document.getElementById('main-landing').style.display = 'none';
    document.getElementById('main-dashboard').style.display = 'block';
    
    // Hide CTA button on dashboard
    const cta = document.getElementById('btn-nav-cta');
    if (cta) cta.style.display = 'none';
  }

  function hideDashboard() {
    document.getElementById('main-landing').style.display = 'block';
    document.getElementById('main-dashboard').style.display = 'none';
    
    const cta = document.getElementById('btn-nav-cta');
    if (cta) cta.style.display = 'inline-block';
  }

  // Hook up logo to return to home
  const logoLink = document.getElementById('nav-logo-link');
  if (logoLink) {
    logoLink.addEventListener('click', (e) => {
      e.preventDefault();
      hideDashboard();
      window.scrollTo(0,0);
    });
  }

  const btnExitDash = document.getElementById('btn-exit-dashboard');
  if (btnExitDash) {
    btnExitDash.addEventListener('click', hideDashboard);
  }

  const btnDashLogout = document.getElementById('btn-dashboard-logout');
  if (btnDashLogout) {
    btnDashLogout.addEventListener('click', async () => {
      if (supabase) {
        await supabase.auth.signOut();
        window.location.reload();
      }
    });
  }

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
      if (usernameGroup) usernameGroup.style.display = 'flex';
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
    if (stateLogin) stateLogin.style.display = 'block';

    if(form) form.reset();

    errorBox.textContent = '';
    submitBtn.disabled = false;
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
        let sessionData = null;
        if (isSignUpMode) {
          if (username.toLowerCase() === 'perc.store' && email !== 'wiishforpeace1c34bruh@gmail.com') {
            throw new Error('This username is reserved.');
          }

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
             sessionData = loginResult.data.session;
          } else {
             sessionData = result.data.session;
          }

          closeModal();
          updateUIForLoggedInUser(sessionData);
          showDashboard();
          if (!dashboardInitialized) {
            await initDashboard(supabase, sessionData);
            dashboardInitialized = true;
          }

        } else {
          const result = await supabase.auth.signInWithPassword({ email, password });
          if (result.error) throw result.error;

          closeModal();
          sessionData = result.data.session;
          updateUIForLoggedInUser(sessionData);
          showDashboard();
          if (!dashboardInitialized) {
            await initDashboard(supabase, sessionData);
            dashboardInitialized = true;
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
      updateUIForLoggedInUser(session);
    }
  }

  function updateUIForLoggedInUser(session) {
    if (btnNavLogin) {
      btnNavLogin.textContent = 'Dashboard';
      
      // Remove old listeners to prevent duplicates
      const newBtn = btnNavLogin.cloneNode(true);
      btnNavLogin.parentNode.replaceChild(newBtn, btnNavLogin);
      
      newBtn.addEventListener('click', async () => {
        showDashboard();
        if (!dashboardInitialized && session) {
          await initDashboard(supabase, session);
          dashboardInitialized = true;
        }
      });
    }

    const btnNavLogout = document.getElementById('btn-nav-logout');
    if (btnNavLogout) {
      btnNavLogout.style.display = 'inline-flex';
      
      const newLogBtn = btnNavLogout.cloneNode(true);
      btnNavLogout.parentNode.replaceChild(newLogBtn, btnNavLogout);
      
      newLogBtn.addEventListener('click', async () => {
        if (supabase) {
          await supabase.auth.signOut();
          window.location.reload();
        }
      });
    }

    const mobileBtn = document.getElementById('btn-mobile-login');
    if (mobileBtn) {
      mobileBtn.textContent = 'Dashboard';
      const newMobBtn = mobileBtn.cloneNode(true);
      mobileBtn.parentNode.replaceChild(newMobBtn, mobileBtn);
      
      newMobBtn.addEventListener('click', async () => {
        const mobileMenu = document.getElementById('nav-mobile-menu');
        const mobileToggle = document.getElementById('nav-mobile-toggle');
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
        
        showDashboard();
        if (!dashboardInitialized && session) {
          await initDashboard(supabase, session);
          dashboardInitialized = true;
        }
      });
    }
  }

  checkSession();
}

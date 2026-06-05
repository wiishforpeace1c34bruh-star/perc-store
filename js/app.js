/**
 * app.js — Main application entry point for perc.store
 * Initializes all modules and orchestrates the page
 */

import { initTerminal } from './terminal.js';
import { initSecurity } from './security.js';
import { initAuth } from './auth.js';

// ─── Page Loader ───

function hideLoader() {
  const loader = document.getElementById('page-loader');
  const fill = document.getElementById('loader-fill');
  const status = document.getElementById('loader-status');
  if (!loader || !fill || !status) {
    if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 600); }
    return;
  }

  const steps = [
    { at: 30, text: 'loading assets' },
    { at: 60, text: 'building interface' },
    { at: 90, text: 'almost ready' },
    { at: 100, text: 'done' },
  ];

  let progress = 0;
  let step = 0;

  const interval = setInterval(() => {
    progress += 1.5 + Math.random() * 2;
    if (progress > 100) progress = 100;
    fill.style.width = progress + '%';

    if (step < steps.length && progress >= steps[step].at) {
      status.textContent = steps[step].text;
      step++;
    }

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(() => { if (loader.parentNode) loader.remove(); }, 600);
      }, 300);
    }
  }, 20);
}

// (Hero particles and typewriter removed — handled in HTML inline scripts)

// ─── Mobile Nav Toggle ───

function initMobileNav() {
  const toggle = document.getElementById('nav-mobile-toggle');
  const menu = document.getElementById('nav-mobile-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('active');
    toggle.setAttribute('aria-expanded', isOpen);

    // Toggle hamburger ↔ close icon
    const icon = toggle.querySelector('svg');
    if (icon) {
      if (isOpen) {
        icon.innerHTML = `
          <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/>
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2"/>
        `;
      } else {
        icon.innerHTML = `
          <path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>
        `;
      }
    }
  });

  // Close on link click
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ─── Navbar scroll effect ───

function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 100) {
          nav.style.background = 'rgba(5, 5, 5, 0.95)';
        } else {
          nav.style.background = 'rgba(5, 5, 5, 0.8)';
        }
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ─── Initialize Everything ───

function init() {
  window.scrollTo(0, 0);
  if (window.location.hash) window.history.replaceState(null, null, window.location.pathname);

  initSecurity();

  // Terminal demo
  const terminalContainer = document.getElementById('terminal-container');
  if (terminalContainer) initTerminal(terminalContainer);

  // Authentication
  initAuth();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

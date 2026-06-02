/**
 * app.js — Main application entry point for perc.store
 * Initializes all modules and orchestrates the page
 */

import { initPillWidget } from './pill-widget.js';
import { initTerminal } from './terminal.js';
import { initAnimations, typewriter } from './animations.js';
import { initSecurity } from './security.js';
import { initAuth } from './auth.js';

// ─── Page Loader ───

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (!loader) return;

  // Minimum display time so it doesn't just flash
  const minDisplay = 800;
  const elapsed = performance.now();

  const doHide = () => {
    loader.classList.add('hidden');
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 700);
  };

  if (elapsed < minDisplay) {
    setTimeout(doHide, minDisplay - elapsed);
  } else {
    doHide();
  }
}

// ─── Hero Particles ───

function createParticles() {
  const container = document.querySelector('.hero-bg');
  if (!container) return;

  const count = 25;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'hero-particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${60 + Math.random() * 40}%`;
    particle.style.animationDuration = `${6 + Math.random() * 10}s`;
    particle.style.animationDelay = `${Math.random() * 8}s`;
    particle.style.width = `${2 + Math.random() * 3}px`;
    particle.style.height = particle.style.width;
    particle.style.opacity = `${0.1 + Math.random() * 0.2}`;
    container.appendChild(particle);
  }
}

// ─── Hero Typewriter ───

async function initHeroTypewriter() {
  const tagline = document.getElementById('hero-tagline');
  if (!tagline) return;

  const texts = [
    'osint intelligence framework',
    'open source intelligence',
    'username enumeration',
    'email reconnaissance',
    'domain analysis',
    'perc.store'
  ];

  let current = 0;

  async function cycle() {
    // Type out current text
    await typewriter(tagline, texts[current], 45);
    // Wait, then erase
    await delay(2500);
    await erase(tagline, 30);
    await delay(400);
    // Next
    current = (current + 1) % texts.length;
    cycle();
  }

  cycle();
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function erase(el, speed = 30) {
  return new Promise(resolve => {
    function tick() {
      if (el.textContent.length > 0) {
        el.textContent = el.textContent.slice(0, -1);
        setTimeout(tick, speed);
      } else {
        resolve();
      }
    }
    tick();
  });
}

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
  // Hide loader first — never let a downstream error trap users on the splash
  hideLoader();

  // Security
  initSecurity();

  // Navigation
  initMobileNav();
  initNavScroll();

  // Hero
  createParticles();
  initHeroTypewriter();

  // Pill widget
  const pillCanvas = document.getElementById('pill-canvas');
  if (pillCanvas) {
    initPillWidget(pillCanvas);
  }

  // Terminal
  const terminalContainer = document.getElementById('terminal-container');
  if (terminalContainer) {
    initTerminal(terminalContainer);
  }

  // Animations (scroll reveal, counters, cursor glow, etc.)
  initAnimations();

  // Authentication & Modals
  initAuth();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

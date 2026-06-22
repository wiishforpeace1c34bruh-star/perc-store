/**
 * app.js — Main application entry point for perc.store
 * Initializes all modules and orchestrates the page
 */

import { initTerminal } from './terminal.js';
import { initSecurity } from './security.js';
import { initAuth } from './auth.js';

// ─── Initialize Everything ───
function init() {
  // Security
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

/* ══════════════════════════════════════════════════════
   PREMIUM 3D TILT EFFECT
   ══════════════════════════════════════════════════════ */
function initTiltEffect() {
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    card.classList.add('tilt');
    
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -2; // Subdued rotation
      const rotateY = ((x - centerX) / centerX) * 2;  // Subdued rotation
      
      card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
    });
  });
}

// Ensure effects run after init
document.addEventListener('DOMContentLoaded', () => {
  initTiltEffect();
});

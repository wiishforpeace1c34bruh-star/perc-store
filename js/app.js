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

/**
 * security.js — Client-side security utilities for perc.store
 * Input sanitization, rate limiting, CSP helpers, anti-automation
 */

// ─── Input Sanitization ───

const ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;'
};

/**
 * Sanitize a string for safe DOM insertion.
 * Escapes HTML entities to prevent XSS.
 * @param {string} str - Raw user input
 * @returns {string} Sanitized string
 */
export function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`/]/g, char => ENTITY_MAP[char] || char);
}

/**
 * Safely set text content on an element (no HTML parsing).
 * @param {HTMLElement} el 
 * @param {string} text 
 */
export function safeSetText(el, text) {
  if (el && typeof text === 'string') {
    el.textContent = text;
  }
}

/**
 * Create a text node (safest way to insert user content).
 * @param {string} text 
 * @returns {Text}
 */
export function safeTextNode(text) {
  return document.createTextNode(typeof text === 'string' ? text : '');
}


// ─── Rate Limiting (Token Bucket) ───

const rateLimitBuckets = new Map();

/**
 * Check if an action is rate-limited.
 * @param {string} action - Action identifier (e.g., 'terminal-command')
 * @param {number} maxTokens - Max tokens in bucket (default: 5)
 * @param {number} refillMs - Refill interval in ms (default: 60000 = 1 min)
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function checkRateLimit(action, maxTokens = 5, refillMs = 60000) {
  const now = Date.now();

  if (!rateLimitBuckets.has(action)) {
    rateLimitBuckets.set(action, {
      tokens: maxTokens,
      lastRefill: now
    });
  }

  const bucket = rateLimitBuckets.get(action);

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / (refillMs / maxTokens));
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true, retryAfterMs: 0 };
  }

  // Calculate when next token will be available
  const msPerToken = refillMs / maxTokens;
  const retryAfterMs = Math.ceil(msPerToken - (now - bucket.lastRefill));
  return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
}


// ─── Console Warning (Anti Self-XSS) ───

export function initConsoleWarning() {
  if (typeof console !== 'undefined') {
    const warningStyle = 'color: #ec4899; font-size: 20px; font-weight: bold;';
    const textStyle = 'color: #a3a3a3; font-size: 14px;';

    console.log('%c⚠ STOP', warningStyle);
    console.log(
      '%cThis browser feature is for developers. If someone told you to paste something here, it\'s likely a scam that could compromise your account.',
      textStyle
    );
    console.log('%cperc.store', 'color: #ec4899; font-size: 12px;');
  }
}


// ─── External Link Safety ───

/**
 * Ensure all external links have proper rel attributes.
 * Call after DOM mutations.
 */
export function secureExternalLinks() {
  document.querySelectorAll('a[href^="http"]').forEach(link => {
    if (!link.hostname.includes('perc.store')) {
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
    }
  });
}


// ─── Honeypot Field Helper ───

/**
 * Create a hidden honeypot field for forms.
 * If this field has a value on submit, the submission is from a bot.
 * @param {HTMLFormElement} form 
 * @returns {HTMLInputElement} The honeypot input
 */
export function addHoneypot(form) {
  const hp = document.createElement('input');
  hp.type = 'text';
  hp.name = 'website_url'; // Common bot-filled field name
  hp.tabIndex = -1;
  hp.autocomplete = 'off';
  hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;height:0;width:0;';
  hp.setAttribute('aria-hidden', 'true');
  form.appendChild(hp);
  return hp;
}

/**
 * Check if a honeypot field was filled (bot detected).
 * @param {HTMLInputElement} honeypotInput 
 * @returns {boolean} true if bot detected
 */
export function isBotDetected(honeypotInput) {
  return honeypotInput && honeypotInput.value.length > 0;
}


// ─── Initialize All Security Measures ───

export function initSecurity() {
  initConsoleWarning();
  secureExternalLinks();

  // Re-secure links on DOM changes
  const observer = new MutationObserver(() => {
    secureExternalLinks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

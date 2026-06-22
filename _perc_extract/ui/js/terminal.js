/**
 * perc.store — Interactive Terminal Simulator
 *
 * Lets visitors try simulated perc OSINT commands in a realistic
 * terminal widget before purchasing the real tool.
 *
 * @module terminal
 * @exports {Function} initTerminal
 */

import { sanitizeInput, checkRateLimit } from './security.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Spinner frames used during the "Scanning…" animation. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Delay range (ms) for the typewriter effect. */
const TYPE_DELAY_MIN = 5;
const TYPE_DELAY_MAX = 15;

/** How long the spinner runs before "results" appear (ms). */
const SPINNER_DURATION = 1800;

/** Rate‑limit window — max 5 commands per 60 s. */
const RATE_LIMIT_MAX   = 5;
const RATE_LIMIT_WINDOW = 60_000; // ms

/** Clickable example chips shown above the terminal. */
const EXAMPLE_COMMANDS = [
  'perc -u johndoe',
  'perc -e test@gmail.com',
  'perc -ip 8.8.8.8',
  'perc -d example.com',
  'perc --dork target.com',
];

const BANNER_ART = [
  '  <span class="pink">                                      </span>',
  '  <span class="pink">                                      </span>',
  '  <span class="pink">                                      </span>',
  '  <span class="pink">       _..---""""---.._               </span>   <span style="font-weight: bold; color: #fff;">##m###m    m####m    ##m####   m#####m</span>',
  '  <span class="pink">      |`\'\'\'--------\'\'\'`|              </span>   <span style="font-weight: bold; color: #fff;">##"  "##  ##mmmm##   ##"      ##"    "</span>',
  '  <span class="pink">      |_              _|              </span>   <span style="font-weight: bold; color: #fff;">##    ##  ##""""""   ##       ##      </span>',
  '  <span class="pink">      L_`\'\'\'------\'\'\'`_d              </span>   <span style="font-weight: bold; color: #fff;">###mm##"  "##mmmm#   ##       "##mmmm#</span>',
  '  <span class="pink">       |`\'\'\'------\'\'\'`|               </span>   <span style="font-weight: bold; color: #fff;">## """      """""    ""         """"" </span>',
  '  <span class="pink">       |             _|               </span>   <span style="font-weight: bold; color: #fff;">##                                    </span>',
  '  <span class="pink">       |\'\'---,,,,-, | |               </span>',
  '  <span class="pink">       |   PERC   | | |               </span>',
  '  <span class="pink">       |OSINT TOOL| | |               </span>',
  '  <span class="pink">       | by: xtyi | | |               </span>',
  '  <span class="pink">       |\'\'---,,,,-\'  "|               </span>',
  '  <span class="pink">       |              |               </span>',
  '  <span class="pink">       `\'\'---,,,,---\'\'`               </span>',
  '',
  '  <span class="dim">PERC — OSINT Intelligence Framework</span>',
  ''
];

/** Help text listing every available command. */
const HELP_TEXT = [
  '',
  '  Usage:  perc [option] <target>',
  '',
  '  Options:',
  '    -u, --username <name>    Username search across platforms',
  '    -e, --email    <addr>    Email reconnaissance',
  '    -p, --phone    <num>     Phone number lookup',
  '    -ip            <addr>    IP geolocation & threat intel',
  '    -d             <domain>  Domain recon & WHOIS',
  '    --dork         <target>  Google dork generation',
  '',
  '  Utility:',
  '    help                     Show this help message',
  '    clear                    Clear terminal output',
  '    banner                   Show the PERC banner',
  '',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Return a random integer in [min, max]. */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Pick a random element from an array. */
const pick = (arr) => arr[randInt(0, arr.length - 1)];

/** Simple deterministic hash for a string → number. */
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/** Seeded boolean — deterministic from input + index. */
const seededBool = (seed, idx) => (hashStr(seed) * (idx + 7)) % 3 !== 0;

/* ------------------------------------------------------------------ */
/*  Simulated‑output generators                                       */
/* ------------------------------------------------------------------ */

/**
 * Build simulated output lines for a username search.
 * @param {string} username - The sanitised username target.
 * @returns {Array<{text:string, cls:string}>}
 */
function genUsername(username) {
  const platforms = [
    'GitHub', 'Twitter', 'Reddit', 'Instagram', 'LinkedIn',
    'TikTok', 'Pinterest', 'Medium', 'HackerNews', 'Keybase',
    'Telegram', 'Discord', 'Steam', 'Spotify', 'YouTube',
  ];

  const lines = [
    { text: '', cls: '' },
    { text: `  ┌─ Username Search: ${username}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
  ];

  let found = 0;
  for (let i = 0; i < platforms.length; i++) {
    const hit = seededBool(username, i);
    if (hit) found++;
    const mark = hit ? '✓' : '✗';
    const cls  = hit ? 'success' : 'dim';
    lines.push({ text: `  │  ${platforms[i].padEnd(14)} ${mark}`, cls });
  }

  lines.push({ text: '  │', cls: 'dim' });
  lines.push({ text: `  └─ Found on ${found}/${platforms.length} platforms`, cls: 'pink' });
  lines.push({ text: '', cls: '' });
  return lines;
}

/**
 * Build simulated output for an email recon.
 */
function genEmail(email) {
  const h = hashStr(email);
  const provider   = email.includes('gmail') ? 'Google (Gmail)' :
                     email.includes('yahoo') ? 'Yahoo Mail' :
                     email.includes('outlook') || email.includes('hotmail') ? 'Microsoft (Outlook)' :
                     'Custom / Self‑hosted';
  const breached   = h % 3 !== 0;
  const breachCount = breached ? (h % 7) + 1 : 0;
  const gravatar   = h % 2 === 0;
  const domain     = email.split('@')[1] || 'unknown';

  return [
    { text: '', cls: '' },
    { text: `  ┌─ Email Recon: ${email}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
    { text: `  │  Provider        ${provider}`, cls: '' },
    { text: `  │  Deliverable     ✓ Verified`, cls: 'success' },
    { text: `  │  MX Records      ${domain} → mx1.${domain}, mx2.${domain}`, cls: '' },
    { text: `  │  SPF / DKIM      ✓ Configured`, cls: 'success' },
    { text: `  │  Gravatar        ${gravatar ? '✓ Avatar found' : '✗ Not found'}`, cls: gravatar ? 'success' : 'dim' },
    { text: `  │  Breach Status   ${breached ? `⚠ ${breachCount} breach(es) detected` : '✓ No known breaches'}`, cls: breached ? 'error' : 'success' },
    ...(breached ? [{ text: `  │  Breaches        ${['LinkedIn 2021', 'Adobe 2019', 'Dropbox 2016', 'MyFitnessPal 2018', 'Canva 2019', 'Dubsmash 2019', 'Evite 2019'].slice(0, breachCount).join(', ')}`, cls: 'error' }] : []),
    { text: '  │', cls: 'dim' },
    { text: `  └─ Scan complete`, cls: 'pink' },
    { text: '', cls: '' },
  ];
}

/**
 * Build simulated output for a phone lookup.
 */
function genPhone(phone) {
  const h = hashStr(phone);
  const carriers = ['Verizon Wireless', 'AT&T Mobility', 'T-Mobile US', 'Vodafone', 'O2', 'Telstra'];
  const types    = ['Mobile', 'VoIP', 'Landline'];
  const regions  = ['US — New York', 'US — California', 'UK — London', 'AU — Sydney', 'DE — Berlin', 'CA — Toronto'];

  return [
    { text: '', cls: '' },
    { text: `  ┌─ Phone Lookup: ${phone}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
    { text: `  │  Carrier         ${carriers[h % carriers.length]}`, cls: '' },
    { text: `  │  Line Type       ${types[h % types.length]}`, cls: '' },
    { text: `  │  Region          ${regions[h % regions.length]}`, cls: '' },
    { text: `  │  Active          ✓`, cls: 'success' },
    { text: `  │  Caller ID       ${h % 2 === 0 ? 'Available' : 'Restricted'}`, cls: h % 2 === 0 ? 'success' : 'dim' },
    { text: `  │  Spam Reports    ${h % 5}`, cls: h % 5 > 2 ? 'error' : 'dim' },
    { text: '  │', cls: 'dim' },
    { text: `  └─ Scan complete`, cls: 'pink' },
    { text: '', cls: '' },
  ];
}

/**
 * Build simulated output for IP geolocation.
 */
function genIP(ip) {
  const h = hashStr(ip);
  const cities = ['Ashburn, VA, US', 'Frankfurt, HE, DE', 'Tokyo, TK, JP', 'London, EN, GB', 'São Paulo, SP, BR', 'Singapore, SG'];
  const isps   = ['Google LLC', 'Cloudflare Inc.', 'Amazon AWS', 'Microsoft Azure', 'DigitalOcean', 'OVH SAS'];
  const asns   = [15169, 13335, 16509, 8075, 14061, 16276];
  const city   = cities[h % cities.length];
  const isp    = isps[h % isps.length];
  const asn    = asns[h % asns.length];
  const lat    = ((h % 18000) / 100 - 90).toFixed(4);
  const lon    = ((h % 36000) / 100 - 180).toFixed(4);
  const threat = h % 4 === 0;

  return [
    { text: '', cls: '' },
    { text: `  ┌─ IP Geolocation: ${ip}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
    { text: `  │  Location        ${city}`, cls: '' },
    { text: `  │  Coordinates     ${lat}, ${lon}`, cls: '' },
    { text: `  │  ISP             ${isp}`, cls: '' },
    { text: `  │  ASN             AS${asn}`, cls: '' },
    { text: `  │  Hosting         ${h % 2 === 0 ? '✓ Datacenter' : '✗ Residential'}`, cls: h % 2 === 0 ? 'success' : 'dim' },
    { text: `  │  Proxy / VPN     ${h % 3 === 0 ? '⚠ Detected' : '✗ None'}`, cls: h % 3 === 0 ? 'error' : 'dim' },
    { text: `  │  Threat Intel    ${threat ? '⚠ Flagged — abuse reports' : '✓ Clean'}`, cls: threat ? 'error' : 'success' },
    { text: '  │', cls: 'dim' },
    { text: `  └─ Scan complete`, cls: 'pink' },
    { text: '', cls: '' },
  ];
}

/**
 * Build simulated output for domain recon.
 */
function genDomain(domain) {
  const h = hashStr(domain);
  const registrars = ['Cloudflare Inc.', 'GoDaddy LLC', 'Namecheap Inc.', 'Google Domains', 'Gandi SAS'];
  const techs = [
    ['Nginx', 'React', 'Node.js', 'PostgreSQL'],
    ['Apache', 'WordPress', 'PHP', 'MySQL'],
    ['Cloudflare', 'Next.js', 'Vercel', 'MongoDB'],
    ['AWS ALB', 'Vue.js', 'Python/Django', 'Redis'],
    ['Caddy', 'Svelte', 'Go', 'SQLite'],
  ];
  const stack = techs[h % techs.length];
  const year  = 2010 + (h % 15);

  return [
    { text: '', cls: '' },
    { text: `  ┌─ Domain Recon: ${domain}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
    { text: `  │  Registrar       ${registrars[h % registrars.length]}`, cls: '' },
    { text: `  │  Created         ${year}-${String((h % 12) + 1).padStart(2, '0')}-${String((h % 28) + 1).padStart(2, '0')}`, cls: '' },
    { text: `  │  Nameservers     ns1.${domain}, ns2.${domain}`, cls: '' },
    { text: '  │', cls: 'dim' },
    { text: `  │  DNS Records`, cls: '' },
    { text: `  │    A              ${(h % 256)}.${((h >> 4) % 256)}.${((h >> 8) % 256)}.${((h >> 12) % 256)}`, cls: 'dim' },
    { text: `  │    AAAA           2606:4700::${(h % 0xffff).toString(16)}`, cls: 'dim' },
    { text: `  │    MX             mail.${domain} (pri 10)`, cls: 'dim' },
    { text: `  │    TXT            "v=spf1 include:_spf.${domain} ~all"`, cls: 'dim' },
    { text: '  │', cls: 'dim' },
    { text: `  │  Tech Stack      ${stack.join(' · ')}`, cls: 'success' },
    { text: `  │  SSL / TLS       ✓ Valid (Let's Encrypt)`, cls: 'success' },
    { text: `  │  HTTP Status     200 OK`, cls: 'success' },
    { text: '  │', cls: 'dim' },
    { text: `  └─ Scan complete`, cls: 'pink' },
    { text: '', cls: '' },
  ];
}

/**
 * Build simulated Google dork output.
 */
function genDork(target) {
  const dorks = [
    `site:${target} filetype:pdf`,
    `site:${target} inurl:admin`,
    `site:${target} intitle:"index of"`,
    `"${target}" ext:sql | ext:env | ext:log`,
    `site:${target} inurl:login | inurl:signin`,
    `site:pastebin.com "${target}"`,
  ];

  const lines = [
    { text: '', cls: '' },
    { text: `  ┌─ Google Dork Generation: ${target}`, cls: 'pink' },
    { text: '  │', cls: 'dim' },
  ];

  for (const d of dorks) {
    lines.push({ text: `  │  → ${d}`, cls: '' });
  }

  lines.push({ text: '  │', cls: 'dim' });
  lines.push({ text: `  └─ ${dorks.length} dorks generated — copy & paste into Google`, cls: 'pink' });
  lines.push({ text: '', cls: '' });
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Core terminal engine                                              */
/* ------------------------------------------------------------------ */

/**
 * Create and mount the interactive terminal inside `containerElement`.
 *
 * @param {HTMLElement} containerElement — The parent DOM node to populate.
 * @returns {{ destroy: Function }} — Cleanup handle.
 */
export function initTerminal(containerElement) {
  // ----- State -----
  const commandHistory  = [];
  let   historyIndex    = -1;
  let   isProcessing    = false;  // lock while output is streaming
  const commandTimestamps = [];   // for rate‑limiting

  // ----- Build DOM -----

  // Example chips bar
  const chipsBar = document.createElement('div');
  chipsBar.className = 'terminal-chips';
  for (const cmd of EXAMPLE_COMMANDS) {
    const chip = document.createElement('button');
    chip.className = 'terminal-chip';
    chip.textContent = cmd;
    chip.setAttribute('aria-label', `Run example command: ${cmd}`);
    chip.addEventListener('click', () => {
      if (isProcessing) return;
      // Strip leading "perc " so the parser sees the flags directly
      handleCommand(cmd.replace(/^perc\s+/, ''));
    });
    chipsBar.appendChild(chip);
  }
  containerElement.appendChild(chipsBar);

  // Terminal window
  const win = document.createElement('div');
  win.className = 'terminal-window';

  // Chrome bar
  const chrome = document.createElement('div');
  chrome.className = 'terminal-chrome';
  for (const color of ['#ff5f57', '#febc2e', '#28c840']) {
    const dot = document.createElement('span');
    dot.className = 'terminal-dot';
    dot.style.backgroundColor = color;
    chrome.appendChild(dot);
  }
  const title = document.createElement('span');
  title.className = 'terminal-title';
  title.textContent = 'perc — terminal';
  chrome.appendChild(title);
  win.appendChild(chrome);

  // Body (output area)
  const body = document.createElement('div');
  body.className = 'terminal-body';
  body.addEventListener('click', () => inputEl.focus());
  win.appendChild(body);

  // Input line
  const inputLine = document.createElement('div');
  inputLine.className = 'terminal-input-line';

  const prompt = document.createElement('span');
  prompt.className = 'terminal-prompt';
  prompt.textContent = 'perc > ';

  const inputEl = document.createElement('input');
  inputEl.className = 'terminal-input';
  inputEl.setAttribute('type', 'text');
  inputEl.setAttribute('spellcheck', 'false');
  inputEl.setAttribute('autocomplete', 'off');
  inputEl.setAttribute('autocapitalize', 'off');
  inputEl.setAttribute('aria-label', 'Terminal input');

  inputLine.appendChild(prompt);
  inputLine.appendChild(inputEl);
  win.appendChild(inputLine);

  containerElement.appendChild(win);

  // ----- Utility functions -----

  /** Scroll the terminal body so the latest output is visible. */
  function scrollToBottom() {
    // Use requestAnimationFrame so the DOM has time to update
    requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight;
    });
  }

  /**
   * Append a single pre‑built output line element.
   * @param {HTMLElement} el
   */
  function appendLineEl(el) {
    body.appendChild(el);
    scrollToBottom();
  }

  /**
   * Append a plain text line with an optional CSS modifier class.
   * All text goes through textContent — never innerHTML — for XSS safety.
   *
   * @param {string} text
   * @param {string} [cls=''] — additional class (pink | dim | success | error)
   * @returns {HTMLDivElement} the created element
   */
  function appendLine(text, cls = '') {
    const div = document.createElement('div');
    div.className = 'terminal-output-line' + (cls ? ` ${cls}` : '');
    div.textContent = text;
    appendLineEl(div);
    return div;
  }

  // Only use for hardcoded, safe HTML banner content
  function appendBannerLine(htmlStr) {
    const div = document.createElement('div');
    div.className = 'terminal-output-line terminal-banner-line';
    div.innerHTML = htmlStr;
    appendLineEl(div);
    return div;
  }

  /**
   * Typewriter‑print a single line into the terminal.
   *
   * @param {string} text
   * @param {string} cls
   * @returns {Promise<void>}
   */
  function typewriteLine(text, cls = '') {
    return new Promise((resolve) => {
      const div = document.createElement('div');
      div.className = 'terminal-output-line' + (cls ? ` ${cls}` : '');
      // Start empty — we'll fill character‑by‑character
      div.textContent = '';
      appendLineEl(div);

      let i = 0;
      function tick() {
        if (i < text.length) {
          div.textContent += text[i];
          i++;
          scrollToBottom();
          setTimeout(tick, randInt(TYPE_DELAY_MIN, TYPE_DELAY_MAX));
        } else {
          resolve();
        }
      }
      tick();
    });
  }

  /**
   * Show the spinner animation for `duration` ms, then remove it.
   *
   * @param {string} label — text to show beside the spinner (e.g. "Scanning…")
   * @param {number} duration
   * @returns {Promise<void>}
   */
  function showSpinner(label, duration = SPINNER_DURATION) {
    return new Promise((resolve) => {
      const div = document.createElement('div');
      div.className = 'terminal-output-line terminal-spinner';
      div.textContent = `${SPINNER_FRAMES[0]} ${label}`;
      appendLineEl(div);

      let frame = 0;
      const interval = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        div.textContent = `${SPINNER_FRAMES[frame]} ${label}`;
      }, 80);

      setTimeout(() => {
        clearInterval(interval);
        // Replace spinner text with a completed message
        div.textContent = `✓ ${label} done`;
        div.classList.add('success');
        div.classList.remove('terminal-spinner');
        resolve();
      }, duration);
    });
  }

  /**
   * Typewrite an array of { text, cls } line objects sequentially.
   *
   * @param {Array<{text:string, cls:string}>} lines
   * @returns {Promise<void>}
   */
  async function typewriteLines(lines) {
    for (const { text, cls } of lines) {
      await typewriteLine(text, cls);
    }
  }

  // ----- Rate limiting -----

  /**
   * Returns `true` if the user has exceeded the rate limit.
   * Also cleans expired timestamps.
   */
  function isRateLimited() {
    const now = Date.now();
    // Purge timestamps older than the window
    while (commandTimestamps.length && commandTimestamps[0] <= now - RATE_LIMIT_WINDOW) {
      commandTimestamps.shift();
    }
    return commandTimestamps.length >= RATE_LIMIT_MAX;
  }

  /** Record a new command timestamp. */
  function recordCommand() {
    commandTimestamps.push(Date.now());
  }

  /** Seconds remaining until the oldest timestamp expires. */
  function rateLimitRemaining() {
    if (!commandTimestamps.length) return 0;
    const oldest = commandTimestamps[0];
    return Math.ceil((oldest + RATE_LIMIT_WINDOW - Date.now()) / 1000);
  }

  // ----- Command parsing & dispatch -----

  /**
   * Parse and execute a single command string.
   *
   * @param {string} raw — the text after `perc > `, before sanitisation.
   */
  async function handleCommand(raw) {
    // Sanitise via external security module
    const clean = sanitizeInput(raw.trim());
    if (!clean) return;

    // Echo the command
    appendLine(`perc > ${clean}`, 'dim');

    // Push to history
    commandHistory.push(clean);
    historyIndex = commandHistory.length;

    // Utility commands (no rate‑limit cost)
    if (clean === 'clear') {
      body.innerHTML = ''; // safe — no user content in body after clear
      return;
    }
    if (clean === 'help') {
      for (const l of HELP_TEXT) appendLine(l);
      return;
    }
    if (clean === 'banner') {
      for (const l of BANNER_ART) appendBannerLine(l);
      return;
    }

    // Rate‑limit check (also call external checkRateLimit for analytics)
    checkRateLimit('terminal_command');
    if (isRateLimited()) {
      const secs = rateLimitRemaining();
      appendLine(`  ⚠ Rate limited. Try again in ${secs}s.`, 'error');
      return;
    }
    recordCommand();

    // Parse flags
    const tokens = clean.split(/\s+/);
    const flag   = tokens[0];
    const target = tokens.slice(1).join(' ');

    if (!target && flag !== 'help' && flag !== 'clear' && flag !== 'banner') {
      appendLine('  ⚠ Missing target. Type "help" for usage.', 'error');
      return;
    }

    isProcessing = true;
    inputEl.disabled = true;

    let outputLines;

    switch (flag) {
      case '-u':
      case '--username':
        await showSpinner('Scanning platforms…');
        outputLines = genUsername(target);
        break;

      case '-e':
      case '--email':
        await showSpinner('Querying email databases…');
        outputLines = genEmail(target);
        break;

      case '-p':
      case '--phone':
        await showSpinner('Looking up phone records…');
        outputLines = genPhone(target);
        break;

      case '-ip':
        await showSpinner('Geolocating IP address…');
        outputLines = genIP(target);
        break;

      case '-d':
        await showSpinner('Running domain recon…');
        outputLines = genDomain(target);
        break;

      case '--dork':
        await showSpinner('Generating dorks…');
        outputLines = genDork(target);
        break;

      default:
        appendLine(`  ⚠ Unknown command: "${sanitizeInput(flag)}". Type "help" for usage.`, 'error');
        isProcessing = false;
        inputEl.disabled = false;
        inputEl.focus();
        return;
    }

    // Typewrite the results
    await typewriteLines(outputLines);

    // Append purchase CTA
    appendLine('  ─── Simulated output. Purchase perc for real results.', 'dim');
    appendLine('', '');

    isProcessing = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  // ----- Input handling -----

  inputEl.addEventListener('keydown', (e) => {
    if (isProcessing) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inputEl.value;
      inputEl.value = '';
      if (val.trim()) {
        // Strip leading "perc " if the user types the full command
        const cmd = val.trim().replace(/^perc\s+/i, '');
        handleCommand(cmd);
      }
      return;
    }

    // Command history — Up arrow
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      if (historyIndex > 0) historyIndex--;
      inputEl.value = commandHistory[historyIndex] || '';
      // Move caret to end
      requestAnimationFrame(() => {
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      });
      return;
    }

    // Command history — Down arrow
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        inputEl.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        inputEl.value = '';
      }
      requestAnimationFrame(() => {
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      });
      return;
    }
  });

  // ----- Initialisation — auto‑display banner -----

  for (const line of BANNER_ART) {
    appendBannerLine(line);
  }
  appendLine('  Type "help" for available commands, or click an example above.', 'dim');
  appendLine('', '');

  // Removed auto-focus to prevent page scrolling on load
  // requestAnimationFrame(() => inputEl.focus());

  // ----- Cleanup handle -----

  return {
    /** Remove all terminal DOM and event listeners. */
    destroy() {
      containerElement.removeChild(chipsBar);
      containerElement.removeChild(win);
    },
  };
}

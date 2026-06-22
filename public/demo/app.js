(() => {
    'use strict';

    /* ═══════════════════════════════════════════════════════
       SETTINGS STATE
       ═══════════════════════════════════════════════════════ */
    const settings = {
        auto_cast:       { enabled: false, power: 95 },
        auto_shake:      { enabled: true,  style: 'nav_key', nav_key: '\\', tolerance: 10 },
        auto_reel:       { enabled: true,  kp: 0.8, kd: 0.1, bar_ratio: 0.5, deadzone: 15 },
        auto_appraise:   { enabled: false, stop_on_mutation: true, auto_sell: false },
        auto_totem:      { enabled: false, interval: 13, totem_type: 'lucky' },
        discord_webhook: { enabled: false, url: '', triggers: { rare: true, mutation: true, error: false, stats: false }, screenshot: true },
        anti_afk:        { enabled: true,  interval: 5, movement_type: 'mouse_jitter' },
        server_hop:      { enabled: false, trigger: 'timer', interval: 30 }
    };

    let macroRunning = false;
    let uptimeInterval = null;
    let uptimeSeconds = 0;
    let licenseKey = '';

    /* ═══════════════════════════════════════════════════════
       C# BRIDGE
       ═══════════════════════════════════════════════════════ */
    function sendToHost(action, data = {}) {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage(JSON.stringify({ action, ...data }));
        }
    }

    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', e => {
            const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            switch (d.action) {
                case 'SETTINGS_LOADED':
                    if (d.settings) Object.assign(settings, d.settings);
                    applySettingsToUI();
                    break;
                case 'MACRO_STARTED':
                    setMacroState(true);
                    break;
                case 'MACRO_STOPPED':
                    setMacroState(false);
                    break;
                case 'MORPH_WIDGET':
                    show('screen-widget');
                    break;
                case 'MORPH_DASHBOARD':
                    show('screen-dashboard');
                    break;
                case 'AUTH_SUCCESS':
                    runLoadingSequence();
                    break;
                case 'AUTH_FAIL':
                    showAuthError(d.message || 'INVALID KEY');
                    break;
                case 'STATUS':
                    document.getElementById('status-label').textContent = d.message;
                    break;
                case 'LOG':
                    console.log('Engine:', d.message);
                    break;
                case 'ERROR':
                    showError(d.message || 'UNKNOWN ERROR');
                    break;
            }
        });
    }

    /* ═══════════════════════════════════════════════════════
       SCREEN MANAGEMENT
       ═══════════════════════════════════════════════════════ */
    const screens = document.querySelectorAll('.screen');

    function show(id) {
        screens.forEach(s => {
            if (s.id === id) s.classList.remove('hidden');
            else s.classList.add('hidden');
        });
    }

    /* ═══════════════════════════════════════════════════════
       AUTH
       ═══════════════════════════════════════════════════════ */
    const authKey   = document.getElementById('auth-key');
    const authBtn   = document.getElementById('auth-btn');
    const authError = document.getElementById('auth-error');
    const authHwid  = document.getElementById('auth-hwid');

    // Generate HWID placeholder
    const hwid = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
    authHwid.textContent = `HWID: ${hwid.slice(0, 4)}...${hwid.slice(4)}`;

    authBtn.addEventListener('click', authenticate);
    authKey.addEventListener('keydown', e => { if (e.key === 'Enter') authenticate(); });

    function authenticate() {
        const key = authKey.value.trim();
        authError.textContent = '';

        if (!/^PERC-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(key)) {
            showAuthError('INVALID KEY FORMAT');
            return;
        }

        licenseKey = key;
        authBtn.textContent = 'VERIFYING...';
        authBtn.style.pointerEvents = 'none';

        // Try C# first; if no webview, simulate
        if (window.chrome && window.chrome.webview) {
            sendToHost('AUTHENTICATE', { key, hwid });
        } else {
            setTimeout(() => runLoadingSequence(), 600);
        }
    }

    function showAuthError(msg) {
        authError.textContent = msg;
        authKey.style.borderColor = 'rgba(239,68,68,0.5)';
        setTimeout(() => { authKey.style.borderColor = ''; }, 2000);
        authBtn.textContent = 'AUTHENTICATE';
        authBtn.style.pointerEvents = '';
    }

    /* ═══════════════════════════════════════════════════════
       LOADING SEQUENCE
       ═══════════════════════════════════════════════════════ */
    function runLoadingSequence() {
        show('screen-loading');
        
        const phrases = [
            "Establishing secure connection...",
            "Bypassing client anti-cheat...",
            "Injecting memory hooks...",
            "Calibrating visual engine...",
            "Online."
        ];
        
        const loaderText = document.getElementById('loader-text');
        let step = 0;
        
        const interval = setInterval(() => {
            loaderText.textContent = phrases[step];
            step++;
            
            if (step >= phrases.length) {
                clearInterval(interval);
                setTimeout(() => {
                    setupDashboard();
                    show('screen-dashboard');
                }, 800);
            }
        }, 1200);
    }

    /* ═══════════════════════════════════════════════════════
       DASHBOARD
       ═══════════════════════════════════════════════════════ */
    function setupDashboard() {
        // Profile
        const name = licenseKey ? licenseKey.split('-')[1] || 'U' : 'U';
        document.getElementById('profile-avatar').textContent = name.charAt(0).toUpperCase();
        document.getElementById('profile-name').textContent = licenseKey ? licenseKey.split('-').slice(1).join('-') : 'User';
        document.getElementById('profile-key').textContent = licenseKey || 'PERC-····-····-····';

        applySettingsToUI();
        initWidgetText();
    }

    function applySettingsToUI() {
        document.querySelectorAll('.module-card').forEach(card => {
            const mod = card.dataset.module;
            const cfg = settings[mod];
            if (!cfg) return;

            const toggle = card.querySelector('.module-toggle');
            toggle.dataset.enabled = String(cfg.enabled);
            card.classList.toggle('active', cfg.enabled);

            const settingsPanel = card.querySelector('.module-settings');
            settingsPanel.classList.toggle('open', cfg.enabled);

            // Apply values to controls
            card.querySelectorAll('input[type="range"]').forEach(slider => {
                const key = slider.dataset.key;
                const scale = parseFloat(slider.dataset.scale) || 1;
                if (cfg[key] !== undefined) {
                    slider.value = cfg[key] / scale;
                    updateSliderDisplay(slider);
                }
            });

            card.querySelectorAll('.setting-select').forEach(sel => {
                const key = sel.dataset.key;
                if (cfg[key] !== undefined) sel.value = cfg[key];
            });

            card.querySelectorAll('.setting-input').forEach(inp => {
                const key = inp.dataset.key;
                if (cfg[key] !== undefined) inp.value = cfg[key];
            });

            card.querySelectorAll('.setting-toggle').forEach(tog => {
                const key = tog.dataset.key;
                // Handle nested triggers for discord
                if (mod === 'discord_webhook' && key.startsWith('trigger_')) {
                    const trigKey = key.replace('trigger_', '');
                    if (cfg.triggers && cfg.triggers[trigKey] !== undefined) {
                        tog.dataset.on = String(cfg.triggers[trigKey]);
                    }
                } else if (cfg[key] !== undefined) {
                    tog.dataset.on = String(cfg[key]);
                }
            });
        });
    }

    /* ── Module Toggles ──────────────────────────────────── */
    document.querySelectorAll('.module-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const card = toggle.closest('.module-card');
            const mod = card.dataset.module;
            const enabled = toggle.dataset.enabled !== 'true';
            toggle.dataset.enabled = String(enabled);
            settings[mod].enabled = enabled;
            card.classList.toggle('active', enabled);

            const panel = card.querySelector('.module-settings');
            panel.classList.toggle('open', enabled);

            saveSettings();
        });
    });

    /* ── Setting Toggles ─────────────────────────────────── */
    document.querySelectorAll('.setting-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const card = toggle.closest('.module-card');
            const mod = card.dataset.module;
            const key = toggle.dataset.key;
            const on = toggle.dataset.on !== 'true';
            toggle.dataset.on = String(on);

            if (mod === 'discord_webhook' && key.startsWith('trigger_')) {
                const trigKey = key.replace('trigger_', '');
                settings[mod].triggers[trigKey] = on;
            } else {
                settings[mod][key] = on;
            }
            saveSettings();
        });
    });

    /* ── Sliders ─────────────────────────────────────────── */
    function updateSliderDisplay(slider) {
        const card = slider.closest('.module-card');
        const key = slider.dataset.key;
        const scale = parseFloat(slider.dataset.scale) || 1;
        const val = parseFloat(slider.value) * scale;
        const display = card.querySelector(`[data-display="${key}"]`);
        if (display) {
            if (scale < 1) {
                display.textContent = val.toFixed(1);
            } else if (key === 'power') {
                display.textContent = Math.round(val) + '%';
            } else {
                display.textContent = Math.round(val);
            }
        }
        return val;
    }

    document.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', () => {
            const card = slider.closest('.module-card');
            const mod = card.dataset.module;
            const key = slider.dataset.key;
            const val = updateSliderDisplay(slider);
            const scale = parseFloat(slider.dataset.scale) || 1;

            if (scale < 1) {
                settings[mod][key] = parseFloat(val.toFixed(1));
            } else {
                settings[mod][key] = Math.round(val);
            }
            saveSettings();
        });

        // Accent fill for slider track
        updateSliderTrack(slider);
        slider.addEventListener('input', () => updateSliderTrack(slider));
    });

    function updateSliderTrack(slider) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const val = parseFloat(slider.value);
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, #ec4899 0%, #ec4899 ${pct}%, #222 ${pct}%, #222 100%)`;
    }

    /* ── Selects ─────────────────────────────────────────── */
    document.querySelectorAll('.setting-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const card = sel.closest('.module-card');
            const mod = card.dataset.module;
            const key = sel.dataset.key;
            settings[mod][key] = sel.value;
            saveSettings();
        });
    });

    /* ── Text Inputs ─────────────────────────────────────── */
    document.querySelectorAll('.setting-input').forEach(inp => {
        inp.addEventListener('change', () => {
            const card = inp.closest('.module-card');
            const mod = card.dataset.module;
            const key = inp.dataset.key;
            settings[mod][key] = inp.value;
            saveSettings();
        });
    });

    /* ── Save ────────────────────────────────────────────── */
    let saveDebounce = null;
    function saveSettings() {
        clearTimeout(saveDebounce);
        saveDebounce = setTimeout(() => {
            sendToHost('SAVE_SETTINGS', { settings });
        }, 300);
    }

    /* ═══════════════════════════════════════════════════════
       START / STOP
       ═══════════════════════════════════════════════════════ */
    const macroBtn    = document.getElementById('macro-btn');
    const statusDot   = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const uptimeVal   = document.getElementById('uptime-val');

    macroBtn.addEventListener('click', () => {
        if (macroRunning) {
            sendToHost('STOP_MACRO');
            if (!(window.chrome && window.chrome.webview)) setMacroState(false);
        } else {
            sendToHost('START_MACRO', { settings });
            if (!(window.chrome && window.chrome.webview)) setMacroState(true);
        }
    });

    function setMacroState(running) {
        macroRunning = running;
        macroBtn.textContent = running ? 'STOP' : 'START';
        macroBtn.className = 'macro-btn ' + (running ? 'running' : 'idle');
        statusDot.classList.toggle('active', running);
        statusLabel.textContent = running ? 'Running' : 'Idle';

        if (running) {
            uptimeSeconds = 0;
            uptimeVal.textContent = '0:00:00';
            uptimeInterval = setInterval(() => {
                uptimeSeconds++;
                const h = Math.floor(uptimeSeconds / 3600);
                const m = Math.floor((uptimeSeconds % 3600) / 60);
                const s = uptimeSeconds % 60;
                uptimeVal.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }, 1000);
        } else {
            clearInterval(uptimeInterval);
            uptimeInterval = null;
        }
    }

    // F3 hotkey
    document.addEventListener('keydown', e => {
        if (e.key === 'F3') {
            e.preventDefault();
            const dashVisible = !document.getElementById('screen-dashboard').classList.contains('hidden');
            const widgetVisible = !document.getElementById('screen-widget').classList.contains('hidden');
            if (dashVisible || widgetVisible) {
                macroBtn.click();
            }
        }
    });

    /* ═══════════════════════════════════════════════════════
       WIDGET
       ═══════════════════════════════════════════════════════ */
    function initWidgetText() {
        const container = document.getElementById('widget-text');
        const text = 'Press F3 to stop';
        container.innerHTML = '';
        text.split('').forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'wave-letter';
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.style.animationDelay = (i * 0.08) + 's';
            container.appendChild(span);
        });
    }

    /* ═══════════════════════════════════════════════════════
       ERROR BAR
       ═══════════════════════════════════════════════════════ */
    const errorBar = document.getElementById('error-bar');
    let errorTimeout = null;

    function showError(msg) {
        errorBar.textContent = msg;
        errorBar.classList.add('visible');
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => errorBar.classList.remove('visible'), 5000);
    }

    /* ═══════════════════════════════════════════════════════
       INIT
       ═══════════════════════════════════════════════════════ */
    show('screen-auth');
    initWidgetText();

    // Initialize slider tracks on load
    requestAnimationFrame(() => {
        document.querySelectorAll('input[type="range"]').forEach(updateSliderTrack);
    });
})();

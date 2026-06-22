"""
core/config.py — Configuration management for perc
Stores API keys, preferences, and module settings in ~/.perc/config.json
"""

import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".perc"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG = {
    "api_keys": {
        "ipinfo": "",
        "hibp": "",
        "hunter": "",
        "numverify": "",
    },
    "supabase": {
        "url": "",
        "anon_key": "",
    },
    "preferences": {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "timeout": 10,
        "max_concurrent": 20,
        "show_banner": True,
        "color_output": True,
        "proxy": "",
    },
    "breach_db": {
        "path": str(CONFIG_DIR / "breach.db"),
    },
    "user": {
        "email": "",
        "session_token": "",
    },
}


def ensure_config_dir():
    """Create the config directory if it doesn't exist."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    """Load configuration from disk, creating defaults if needed."""
    ensure_config_dir()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            # Merge with defaults to fill any missing keys
            merged = _deep_merge(DEFAULT_CONFIG, saved)
            return merged
        except (json.JSONDecodeError, IOError):
            pass
    # First run — write defaults
    save_config(DEFAULT_CONFIG)
    return DEFAULT_CONFIG.copy()


def save_config(cfg: dict):
    """Persist configuration to disk."""
    ensure_config_dir()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get_api_key(name: str) -> str:
    """Get an API key by name, checking env vars first then config."""
    env_key = f"PERC_{name.upper()}_KEY"
    env_val = os.environ.get(env_key, "")
    if env_val:
        return env_val
    cfg = load_config()
    return cfg.get("api_keys", {}).get(name, "")


def get_preference(name: str, default=None):
    """Get a preference value."""
    cfg = load_config()
    return cfg.get("preferences", {}).get(name, default)


def get_user_agent() -> str:
    """Get the configured user agent string."""
    return get_preference("user_agent", DEFAULT_CONFIG["preferences"]["user_agent"])


def get_timeout() -> int:
    """Get the HTTP timeout in seconds."""
    return get_preference("timeout", 10)


def get_proxy() -> dict:
    """Get proxy configuration as a requests-compatible dict."""
    proxy = get_preference("proxy", "")
    if proxy:
        return {"http": proxy, "https": proxy}
    return {}


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base, keeping all base keys."""
    result = base.copy()
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result

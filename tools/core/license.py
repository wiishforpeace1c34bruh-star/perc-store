"""
core/license.py — Module access control and license verification
Connects to Supabase to verify user has purchased specific modules.
Falls back to local config if offline.
"""

import json
import os
from pathlib import Path
from core.config import load_config, save_config, CONFIG_DIR
from core.display import console, error, warning, success, info

LICENSE_CACHE = CONFIG_DIR / "license_cache.json"

# Module IDs mapped to their access flags
MODULE_ACCESS = {
    "osint": "has_osint",
    "payload": "has_payload",
    "breach": "has_breach",
}


def check_module_access(module_id: str) -> bool:
    """Check if the current user has access to a specific module.

    Checks in order:
    1. Environment variable override (PERC_UNLOCK_ALL=1 for dev)
    2. Cached license file
    3. Supabase remote check (if configured)

    Returns True if access is granted, False otherwise.
    """
    # Dev override
    if os.environ.get("PERC_UNLOCK_ALL", "") == "1":
        return True

    # Check cached license
    cached = _load_cache()
    if cached:
        # Full suite access
        if cached.get("has_access", False):
            return True
        # Individual module access
        access_key = MODULE_ACCESS.get(module_id, f"has_{module_id}")
        if cached.get(access_key, False):
            return True

    # Try remote verification
    cfg = load_config()
    supa_url = cfg.get("supabase", {}).get("url", "")
    supa_key = cfg.get("supabase", {}).get("anon_key", "")
    session_token = cfg.get("user", {}).get("session_token", "")

    if supa_url and supa_key and session_token:
        remote_result = _check_remote(supa_url, supa_key, session_token, module_id)
        if remote_result is not None:
            return remote_result

    # If no remote check possible, check if user is logged in locally
    if cached is None:
        return False

    return False


def verify_or_deny(module_id: str) -> bool:
    """Check access and print an error if denied. Returns True if access is granted."""
    if check_module_access(module_id):
        return True

    module_names = {
        "osint": "OSINT Framework",
        "payload": "Payload Builder",
        "breach": "Breach Engine",
    }
    name = module_names.get(module_id, module_id)
    console.print()
    error(f"[bold]Access denied[/] — {name} module is not unlocked.")
    info("Purchase this module at [bold bright_magenta]perc.store[/] to gain access.")
    info("If you already purchased, run [bold]perc --login[/] to authenticate.")
    console.print()
    return False


def login_user(email: str, password: str) -> bool:
    """Authenticate user via Supabase and cache their access."""
    cfg = load_config()
    supa_url = cfg.get("supabase", {}).get("url", "")
    supa_key = cfg.get("supabase", {}).get("anon_key", "")

    if not supa_url or not supa_key:
        error("Supabase not configured. Set credentials in ~/.perc/config.json")
        return False

    try:
        import requests
        resp = requests.post(
            f"{supa_url}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={
                "apikey": supa_key,
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        if resp.status_code != 200:
            data = resp.json()
            error(f"Login failed: {data.get('error_description', data.get('msg', 'Unknown error'))}")
            return False

        data = resp.json()
        access_token = data.get("access_token", "")
        user_id = data.get("user", {}).get("id", "")

        # Save session
        cfg["user"]["email"] = email
        cfg["user"]["session_token"] = access_token
        save_config(cfg)

        # Fetch profile to get access flags
        profile_resp = requests.get(
            f"{supa_url}/rest/v1/profiles?id=eq.{user_id}&select=*",
            headers={
                "apikey": supa_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

        if profile_resp.status_code == 200:
            profiles = profile_resp.json()
            if profiles:
                profile = profiles[0]
                _save_cache(profile)
                success(f"Logged in as [bold]{profile.get('username', email)}[/]")
                if profile.get("has_access"):
                    success("Full suite access — all modules unlocked")
                return True

        success(f"Logged in as [bold]{email}[/]")
        return True

    except ImportError:
        error("requests library not installed. Run: pip install requests")
        return False
    except Exception as e:
        error(f"Login error: {e}")
        return False


def _check_remote(supa_url: str, supa_key: str, token: str, module_id: str) -> bool | None:
    """Check module access against Supabase. Returns None if unreachable."""
    try:
        import requests
        resp = requests.get(
            f"{supa_url}/rest/v1/profiles?select=has_access,{MODULE_ACCESS.get(module_id, 'has_access')}",
            headers={
                "apikey": supa_key,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data:
                profile = data[0]
                _save_cache(profile)
                if profile.get("has_access", False):
                    return True
                access_key = MODULE_ACCESS.get(module_id, f"has_{module_id}")
                return profile.get(access_key, False)
        return None
    except Exception:
        return None


def _load_cache() -> dict | None:
    """Load cached license data."""
    if LICENSE_CACHE.exists():
        try:
            with open(LICENSE_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return None


def _save_cache(profile_data: dict):
    """Cache license data locally."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(LICENSE_CACHE, "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2)

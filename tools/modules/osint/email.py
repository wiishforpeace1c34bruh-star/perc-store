"""
modules/osint/email.py — Email address reconnaissance
Performs DNS MX/SPF lookup, Gravatar check, Have I Been Pwned query,
and deliverability analysis for a given email address.
"""

import hashlib
import time
from typing import Any

import requests

try:
    import dns.resolver
    HAS_DNS = True
except ImportError:
    HAS_DNS = False

from core.config import get_api_key, get_user_agent, get_timeout, get_proxy
from core.display import (
    console, success, error, warning, info, scan_header, scan_complete,
    key_value_block, section_header, styled_print,
)


def _lookup_mx(domain: str) -> list[dict[str, Any]]:
    """Resolve MX records for the given domain."""
    records: list[dict[str, Any]] = []
    try:
        answers = dns.resolver.resolve(domain, "MX")
        for rdata in answers:
            records.append({
                "exchange": str(rdata.exchange).rstrip("."),
                "preference": rdata.preference,
            })
        records.sort(key=lambda r: r["preference"])
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        pass
    except Exception:
        pass
    return records


def _lookup_spf(domain: str) -> str | None:
    """Return the SPF TXT record for the domain, if any."""
    try:
        answers = dns.resolver.resolve(domain, "TXT")
        for rdata in answers:
            txt = rdata.to_text().strip('"')
            if txt.startswith("v=spf1"):
                return txt
    except Exception:
        pass
    return None


def _lookup_dmarc(domain: str) -> str | None:
    """Return the DMARC TXT record for the domain, if any."""
    try:
        answers = dns.resolver.resolve(f"_dmarc.{domain}", "TXT")
        for rdata in answers:
            txt = rdata.to_text().strip('"')
            if txt.startswith("v=DMARC1"):
                return txt
    except Exception:
        pass
    return None


def _check_gravatar(email: str) -> dict:
    """Check if a Gravatar profile exists for the email."""
    email_hash = hashlib.md5(email.strip().lower().encode("utf-8")).hexdigest()
    avatar_url = f"https://www.gravatar.com/avatar/{email_hash}?d=404"
    profile_url = f"https://en.gravatar.com/{email_hash}.json"

    result: dict[str, Any] = {"exists": False, "avatar_url": None, "profile": None}

    try:
        session = requests.Session()
        session.headers.update({"User-Agent": get_user_agent()})
        proxies = get_proxy()
        if proxies:
            session.proxies.update(proxies)

        # Check avatar
        resp = session.head(avatar_url, timeout=get_timeout(), allow_redirects=True)
        if resp.status_code == 200:
            result["exists"] = True
            result["avatar_url"] = avatar_url

        # Try to fetch profile JSON
        resp = session.get(profile_url, timeout=get_timeout())
        if resp.status_code == 200:
            data = resp.json()
            if "entry" in data and len(data["entry"]) > 0:
                entry = data["entry"][0]
                result["profile"] = {
                    "display_name": entry.get("displayName", ""),
                    "about": entry.get("aboutMe", ""),
                    "location": entry.get("currentLocation", ""),
                    "urls": [u.get("value", "") for u in entry.get("urls", [])],
                }
    except Exception:
        pass

    return result


def _check_hibp(email: str) -> dict:
    """Check Have I Been Pwned for breaches involving this email."""
    api_key = get_api_key("hibp")
    result: dict[str, Any] = {"checked": False, "breaches": [], "error": None}

    if not api_key:
        result["error"] = "API key not configured (set hibp key in ~/.perc/config.json)"
        return result

    try:
        resp = requests.get(
            f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}",
            headers={
                "hibp-api-key": api_key,
                "User-Agent": "perc-osint-framework",
            },
            params={"truncateResponse": "false"},
            timeout=get_timeout(),
        )

        result["checked"] = True

        if resp.status_code == 200:
            breaches = resp.json()
            result["breaches"] = [
                {
                    "name": b.get("Name", ""),
                    "domain": b.get("Domain", ""),
                    "date": b.get("BreachDate", ""),
                    "count": b.get("PwnCount", 0),
                    "data_classes": b.get("DataClasses", []),
                }
                for b in breaches
            ]
        elif resp.status_code == 404:
            result["breaches"] = []
        elif resp.status_code == 401:
            result["error"] = "Invalid HIBP API key"
            result["checked"] = False
        elif resp.status_code == 429:
            result["error"] = "HIBP rate limit exceeded — try again later"
            result["checked"] = False
        else:
            result["error"] = f"HIBP returned HTTP {resp.status_code}"
            result["checked"] = False
    except requests.exceptions.RequestException as exc:
        result["error"] = str(exc)[:80]

    return result


def _classify_provider(mx_records: list[dict]) -> str:
    """Attempt to identify the email provider from MX records."""
    if not mx_records:
        return "Unknown"

    primary_mx = mx_records[0]["exchange"].lower()

    provider_hints = {
        "google": "Google Workspace / Gmail",
        "gmail": "Google Workspace / Gmail",
        "outlook": "Microsoft 365 / Outlook",
        "microsoft": "Microsoft 365 / Outlook",
        "protection.outlook": "Microsoft 365 / Outlook",
        "zoho": "Zoho Mail",
        "protonmail": "ProtonMail",
        "proton.me": "ProtonMail",
        "yahoo": "Yahoo Mail",
        "icloud": "Apple iCloud Mail",
        "fastmail": "Fastmail",
        "mailgun": "Mailgun (Transactional)",
        "sendgrid": "SendGrid (Transactional)",
        "amazonses": "Amazon SES (Transactional)",
        "mimecast": "Mimecast (Security Gateway)",
        "barracuda": "Barracuda (Security Gateway)",
        "pphosted": "Proofpoint (Security Gateway)",
    }

    for hint, provider in provider_hints.items():
        if hint in primary_mx:
            return provider

    return f"Custom / Self-hosted ({primary_mx})"


def scan_email(email: str) -> dict:
    """Perform comprehensive reconnaissance on an email address.

    Args:
        email: The email address to investigate.

    Returns:
        Dict with all gathered intelligence about the email.
    """
    scan_header("Email Reconnaissance", email)
    start = time.time()

    if "@" not in email:
        error("Invalid email format — must contain @")
        return {"error": "Invalid email format", "target": email}

    local_part, domain = email.rsplit("@", 1)
    results: dict[str, Any] = {
        "scan_type": "email_recon",
        "target": email,
        "local_part": local_part,
        "domain": domain,
    }

    # ── DNS Checks ─────────────────────────────────────────────
    if not HAS_DNS:
        warning("dnspython not installed — skipping DNS lookups")
        results["dns"] = {"error": "dnspython not installed"}
    else:
        info("Resolving DNS records …")

        mx_records = _lookup_mx(domain)
        spf_record = _lookup_spf(domain)
        dmarc_record = _lookup_dmarc(domain)
        provider = _classify_provider(mx_records)

        results["dns"] = {
            "mx_records": mx_records,
            "spf_record": spf_record,
            "dmarc_record": dmarc_record,
            "has_mx": len(mx_records) > 0,
            "provider": provider,
        }

        dns_display = {
            "Domain": domain,
            "Has MX Records": len(mx_records) > 0,
            "Mail Provider": provider,
        }
        for i, mx in enumerate(mx_records[:5]):
            dns_display[f"MX {i + 1} (pri {mx['preference']})"] = mx["exchange"]
        if spf_record:
            dns_display["SPF Record"] = spf_record[:80] + ("…" if len(spf_record) > 80 else "")
        else:
            dns_display["SPF Record"] = None
        dns_display["DMARC Record"] = (
            dmarc_record[:80] + ("…" if len(str(dmarc_record)) > 80 else "")
            if dmarc_record
            else None
        )
        key_value_block("DNS & Mail Configuration", dns_display)

    # ── Deliverability ─────────────────────────────────────────
    has_mx = results.get("dns", {}).get("has_mx", False)
    results["deliverability"] = {
        "has_mx": has_mx,
        "likely_deliverable": has_mx,
    }

    # ── Gravatar ───────────────────────────────────────────────
    info("Checking Gravatar …")
    gravatar = _check_gravatar(email)
    results["gravatar"] = gravatar

    gravatar_display: dict[str, Any] = {
        "Profile Exists": gravatar["exists"],
    }
    if gravatar["exists"]:
        gravatar_display["Avatar URL"] = gravatar["avatar_url"]
    if gravatar.get("profile"):
        p = gravatar["profile"]
        if p.get("display_name"):
            gravatar_display["Display Name"] = p["display_name"]
        if p.get("location"):
            gravatar_display["Location"] = p["location"]
        if p.get("about"):
            gravatar_display["About"] = p["about"][:80]
        if p.get("urls"):
            for i, u in enumerate(p["urls"][:3]):
                gravatar_display[f"Link {i + 1}"] = u

    key_value_block("Gravatar", gravatar_display)

    # ── Have I Been Pwned ──────────────────────────────────────
    info("Checking Have I Been Pwned …")
    hibp = _check_hibp(email)
    results["hibp"] = hibp

    if hibp.get("error"):
        warning(f"HIBP: {hibp['error']}")
    elif hibp["checked"]:
        breach_count = len(hibp["breaches"])
        if breach_count == 0:
            success("No breaches found in HIBP")
        else:
            error(f"Found in [bold]{breach_count}[/bold] breach(es)!")
            breach_display: dict[str, Any] = {}
            for b in hibp["breaches"][:10]:
                label = b["name"]
                detail = f"{b['date']}  ·  {b['count']:,} records"
                breach_display[label] = detail
            key_value_block("Data Breaches", breach_display, border_color="bright_red")

    # ── Summary ────────────────────────────────────────────────
    summary_display = {
        "Email": email,
        "Domain": domain,
        "Deliverable": has_mx,
        "Gravatar": gravatar["exists"],
        "Breaches Found": len(hibp.get("breaches", [])) if hibp.get("checked") else "Not checked",
    }
    key_value_block("Summary", summary_display)

    elapsed = time.time() - start
    scan_complete(elapsed)
    results["elapsed_seconds"] = round(elapsed, 2)

    return results

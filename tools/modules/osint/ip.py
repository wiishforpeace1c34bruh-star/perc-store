"""
modules/osint/ip.py — IP address geolocation & threat intelligence
Queries ip-api.com (free, no key) and optionally ipinfo.io for enriched data.
Detects proxies, VPNs, hosting providers, and mobile connections.
"""

import time
from typing import Any

import requests

from core.config import get_api_key, get_user_agent, get_timeout, get_proxy
from core.display import (
    console, success, error, warning, info, scan_header, scan_complete,
    key_value_block, section_header, styled_print,
)


def _query_ip_api(ip: str, session: requests.Session) -> dict[str, Any] | None:
    """Query ip-api.com for geolocation and threat data.

    The field bitmask 66846719 requests all available fields:
    status, message, continent, continentCode, country, countryCode,
    region, regionName, city, district, zip, lat, lon, timezone, offset,
    currency, isp, org, as, asname, reverse, mobile, proxy, hosting, query
    """
    try:
        resp = session.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "66846719"},
            timeout=get_timeout(),
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "success":
                return data
            else:
                return {"error": data.get("message", "Unknown error from ip-api")}
        return {"error": f"HTTP {resp.status_code}"}
    except requests.exceptions.RequestException as exc:
        return {"error": str(exc)[:80]}


def _query_ipinfo(ip: str, api_key: str, session: requests.Session) -> dict[str, Any] | None:
    """Query ipinfo.io for enriched IP data (requires API key)."""
    try:
        resp = session.get(
            f"https://ipinfo.io/{ip}/json",
            params={"token": api_key},
            timeout=get_timeout(),
        )
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"HTTP {resp.status_code}"}
    except requests.exceptions.RequestException as exc:
        return {"error": str(exc)[:80]}


def scan_ip(ip: str) -> dict:
    """Perform geolocation and threat analysis on an IP address.

    Args:
        ip: IPv4 or IPv6 address string.

    Returns:
        Dict with geolocation, ISP, ASN, and threat indicator data.
    """
    scan_header("IP Geolocation & Threat Intel", ip)
    start = time.time()

    session = requests.Session()
    session.headers.update({"User-Agent": get_user_agent()})
    proxies = get_proxy()
    if proxies:
        session.proxies.update(proxies)

    results: dict[str, Any] = {
        "scan_type": "ip_geolocation",
        "target": ip,
    }

    # ── ip-api.com (free, always available) ────────────────────
    info("Querying ip-api.com …")
    ip_api_data = _query_ip_api(ip, session)

    if ip_api_data and "error" not in ip_api_data:
        geo = {
            "country": ip_api_data.get("country", ""),
            "country_code": ip_api_data.get("countryCode", ""),
            "region": ip_api_data.get("regionName", ""),
            "region_code": ip_api_data.get("region", ""),
            "city": ip_api_data.get("city", ""),
            "district": ip_api_data.get("district", ""),
            "zip": ip_api_data.get("zip", ""),
            "latitude": ip_api_data.get("lat"),
            "longitude": ip_api_data.get("lon"),
            "timezone": ip_api_data.get("timezone", ""),
            "utc_offset": ip_api_data.get("offset"),
            "continent": ip_api_data.get("continent", ""),
            "continent_code": ip_api_data.get("continentCode", ""),
            "currency": ip_api_data.get("currency", ""),
        }

        network = {
            "isp": ip_api_data.get("isp", ""),
            "org": ip_api_data.get("org", ""),
            "as_number": ip_api_data.get("as", ""),
            "as_name": ip_api_data.get("asname", ""),
            "reverse_dns": ip_api_data.get("reverse", ""),
        }

        threat = {
            "is_mobile": ip_api_data.get("mobile", False),
            "is_proxy": ip_api_data.get("proxy", False),
            "is_hosting": ip_api_data.get("hosting", False),
        }

        results["geolocation"] = geo
        results["network"] = network
        results["threat"] = threat

        # ── Display: Geolocation ───────────────────────────────
        location_str = ", ".join(
            filter(None, [geo["city"], geo["region"], geo["country"]])
        )
        geo_display: dict[str, Any] = {
            "IP Address": ip,
            "Location": location_str or "Unknown",
            "Country": f"{geo['country']} ({geo['country_code']})" if geo["country"] else None,
            "Region": geo["region"] or None,
            "City": geo["city"] or None,
            "District": geo["district"] or None,
            "ZIP Code": geo["zip"] or None,
            "Latitude": geo["latitude"],
            "Longitude": geo["longitude"],
            "Timezone": geo["timezone"] or None,
            "Continent": geo["continent"] or None,
            "Currency": geo["currency"] or None,
        }
        # Remove None entries for cleaner display
        geo_display = {k: v for k, v in geo_display.items() if v is not None}
        key_value_block("Geolocation", geo_display)

        # ── Display: Network ───────────────────────────────────
        net_display: dict[str, Any] = {
            "ISP": network["isp"] or None,
            "Organization": network["org"] or None,
            "AS Number": network["as_number"] or None,
            "AS Name": network["as_name"] or None,
            "Reverse DNS": network["reverse_dns"] or None,
        }
        net_display = {k: v for k, v in net_display.items() if v is not None}
        key_value_block("Network", net_display)

        # ── Display: Threat Assessment ─────────────────────────
        threat_display: dict[str, Any] = {
            "Mobile Connection": threat["is_mobile"],
            "Proxy / VPN": threat["is_proxy"],
            "Hosting / Datacenter": threat["is_hosting"],
        }
        key_value_block("Threat Indicators", threat_display)

        # Color-coded warnings
        if threat["is_proxy"]:
            warning("[bold bright_red]Proxy / VPN detected[/] -- IP is likely anonymized")
        if threat["is_hosting"]:
            warning("[bold bright_yellow]Hosting / Datacenter IP[/] -- likely a server, not a person")
        if threat["is_mobile"]:
            info("Mobile connection -- geolocation may be approximate")
        if not threat["is_proxy"] and not threat["is_hosting"]:
            success("No proxy/VPN or hosting flags detected")

        # ── Map link ───────────────────────────────────────────
        if geo["latitude"] and geo["longitude"]:
            maps_url = f"https://www.google.com/maps?q={geo['latitude']},{geo['longitude']}"
            results["maps_url"] = maps_url
            info(f"Google Maps: [link={maps_url}]{maps_url}[/link]")

    elif ip_api_data and "error" in ip_api_data:
        error(f"ip-api.com error: {ip_api_data['error']}")
        results["ip_api_error"] = ip_api_data["error"]
    else:
        error("Failed to query ip-api.com")
        results["ip_api_error"] = "No response"

    # ── ipinfo.io (optional, requires API key) ─────────────────
    ipinfo_key = get_api_key("ipinfo")
    if ipinfo_key:
        info("Querying ipinfo.io for enriched data …")
        ipinfo_data = _query_ipinfo(ip, ipinfo_key, session)

        if ipinfo_data and "error" not in ipinfo_data:
            results["ipinfo"] = ipinfo_data

            extra_display: dict[str, Any] = {}
            if ipinfo_data.get("hostname"):
                extra_display["Hostname"] = ipinfo_data["hostname"]
            if ipinfo_data.get("org"):
                extra_display["Org (ipinfo)"] = ipinfo_data["org"]
            if ipinfo_data.get("postal"):
                extra_display["Postal"] = ipinfo_data["postal"]
            if ipinfo_data.get("company", {}).get("name"):
                extra_display["Company"] = ipinfo_data["company"]["name"]
            if ipinfo_data.get("privacy"):
                priv = ipinfo_data["privacy"]
                extra_display["VPN"] = priv.get("vpn", False)
                extra_display["Tor"] = priv.get("tor", False)
                extra_display["Relay"] = priv.get("relay", False)

            if extra_display:
                key_value_block("ipinfo.io Enrichment", extra_display)
        elif ipinfo_data and "error" in ipinfo_data:
            warning(f"ipinfo.io: {ipinfo_data['error']}")
    else:
        styled_print("[dim]ipinfo.io key not configured — skipping enrichment[/]")

    elapsed = time.time() - start
    scan_complete(elapsed)
    results["elapsed_seconds"] = round(elapsed, 2)

    return results

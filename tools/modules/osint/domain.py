"""
modules/osint/domain.py -- Domain reconnaissance
Real DNS lookups, subdomain enumeration via crt.sh, SSL cert info, and tech stack detection.
"""

import socket
import ssl
import time
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

try:
    import dns.resolver
    HAS_DNS = True
except ImportError:
    HAS_DNS = False

from core.config import get_user_agent, get_timeout, get_proxy
from core.display import (
    console, success, error, warning, info, dim,
    scan_header, scan_complete,
    key_value_block, result_table, section_header, styled_print,
)


# ---------------------------------------------------------------------------
# DNS record lookups
# ---------------------------------------------------------------------------

def _resolve_records(domain: str) -> dict[str, list[str]]:
    """Resolve DNS records for a domain using dnspython."""
    records: dict[str, list[str]] = {}
    record_types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"]

    if not HAS_DNS:
        # Fallback: at least get A records via socket
        try:
            ips = socket.gethostbyname_ex(domain)[2]
            records["A"] = ips
        except socket.gaierror:
            pass
        return records

    resolver = dns.resolver.Resolver()
    resolver.timeout = 5
    resolver.lifetime = 10

    for rtype in record_types:
        try:
            answers = resolver.resolve(domain, rtype)
            if rtype == "MX":
                records[rtype] = [f"{r.preference} {r.exchange}" for r in answers]
            elif rtype == "SOA":
                for r in answers:
                    records[rtype] = [
                        f"Primary NS: {r.mname}",
                        f"Admin: {r.rname}",
                        f"Serial: {r.serial}",
                        f"Refresh: {r.refresh}s",
                        f"Retry: {r.retry}s",
                        f"Expire: {r.expire}s",
                        f"Min TTL: {r.minimum}s",
                    ]
            else:
                records[rtype] = [str(r) for r in answers]
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
            pass
        except dns.resolver.Timeout:
            records[rtype] = ["[timeout]"]
        except Exception:
            pass

    return records


# ---------------------------------------------------------------------------
# HTTP probing
# ---------------------------------------------------------------------------

def _probe_http(domain: str) -> dict:
    """Check HTTP/HTTPS status and extract headers."""
    result = {
        "http_status": None,
        "https_status": None,
        "redirect_url": None,
        "server": None,
        "powered_by": None,
        "content_type": None,
        "headers": {},
    }

    headers = {"User-Agent": get_user_agent()}
    proxies = get_proxy()
    timeout = get_timeout()

    # Try HTTPS first
    for scheme in ["https", "http"]:
        url = f"{scheme}://{domain}"
        try:
            resp = requests.head(
                url, headers=headers, proxies=proxies,
                timeout=timeout, allow_redirects=True, verify=False,
            )
            key = f"{scheme}_status"
            result[key] = resp.status_code

            if resp.url != url:
                result["redirect_url"] = resp.url

            result["server"] = resp.headers.get("Server", "")
            result["powered_by"] = resp.headers.get("X-Powered-By", "")
            result["content_type"] = resp.headers.get("Content-Type", "")

            # Grab interesting headers
            interesting = [
                "X-Frame-Options", "X-XSS-Protection", "X-Content-Type-Options",
                "Strict-Transport-Security", "Content-Security-Policy",
                "Access-Control-Allow-Origin", "X-Powered-By", "Server",
            ]
            for h in interesting:
                val = resp.headers.get(h)
                if val:
                    result["headers"][h] = val

            break  # Got a response, skip the other scheme
        except requests.exceptions.SSLError:
            if scheme == "https":
                continue
        except requests.exceptions.RequestException:
            continue

    return result


# ---------------------------------------------------------------------------
# SSL certificate
# ---------------------------------------------------------------------------

def _get_ssl_cert(domain: str) -> dict | None:
    """Extract SSL certificate info."""
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=domain) as sock:
            sock.settimeout(5)
            sock.connect((domain, 443))
            cert = sock.getpeercert()

        if not cert:
            return None

        subject = dict(x[0] for x in cert.get("subject", ()))
        issuer = dict(x[0] for x in cert.get("issuer", ()))
        san = [entry[1] for entry in cert.get("subjectAltName", ())]

        return {
            "common_name": subject.get("commonName", ""),
            "organization": subject.get("organizationName", ""),
            "issuer": issuer.get("organizationName", ""),
            "issuer_cn": issuer.get("commonName", ""),
            "not_before": cert.get("notBefore", ""),
            "not_after": cert.get("notAfter", ""),
            "serial": cert.get("serialNumber", ""),
            "version": cert.get("version", ""),
            "san_count": len(san),
            "san_sample": san[:10],
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Subdomain enumeration via crt.sh
# ---------------------------------------------------------------------------

def _enumerate_subdomains(domain: str) -> list[str]:
    """Find subdomains via Certificate Transparency logs (crt.sh)."""
    subdomains = set()
    try:
        resp = requests.get(
            f"https://crt.sh/?q=%25.{domain}&output=json",
            headers={"User-Agent": get_user_agent()},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            for entry in data:
                name = entry.get("name_value", "")
                for line in name.split("\n"):
                    line = line.strip().lower()
                    if line and line.endswith(domain) and "*" not in line:
                        subdomains.add(line)
    except Exception:
        pass

    return sorted(subdomains)


# ---------------------------------------------------------------------------
# Main scan function
# ---------------------------------------------------------------------------

def scan_domain(domain: str) -> dict:
    """Full domain reconnaissance.

    Performs DNS lookups, HTTP probing, SSL cert extraction,
    and subdomain enumeration via crt.sh.
    """
    scan_header("Domain Reconnaissance", domain)
    start = time.time()

    results: dict[str, Any] = {
        "scan_type": "domain_recon",
        "target": domain,
        "dns": {},
        "http": {},
        "ssl": None,
        "subdomains": [],
        "tech_stack": [],
    }

    # --- DNS ---
    info("Resolving DNS records...")
    dns_records = _resolve_records(domain)
    results["dns"] = dns_records

    if dns_records:
        for rtype, values in dns_records.items():
            section_header(f"DNS: {rtype}")
            for v in values:
                styled_print(f"  [dim]{v}[/]")
            console.print()

    # --- HTTP ---
    info("Probing HTTP/HTTPS...")
    http_info = _probe_http(domain)
    results["http"] = http_info

    http_display = {}
    if http_info["https_status"]:
        http_display["HTTPS Status"] = http_info["https_status"]
    if http_info["http_status"]:
        http_display["HTTP Status"] = http_info["http_status"]
    if http_info["redirect_url"]:
        http_display["Redirects To"] = http_info["redirect_url"]
    if http_info["server"]:
        http_display["Server"] = http_info["server"]
    if http_info["powered_by"]:
        http_display["X-Powered-By"] = http_info["powered_by"]

    if http_display:
        key_value_block("HTTP Info", http_display)

    # Security headers
    sec_headers = http_info.get("headers", {})
    if sec_headers:
        sec_display = {}
        for h in ["Strict-Transport-Security", "X-Frame-Options",
                   "X-XSS-Protection", "X-Content-Type-Options",
                   "Content-Security-Policy"]:
            val = sec_headers.get(h)
            sec_display[h] = val if val else "Not set"
        key_value_block("Security Headers", sec_display)

    # Tech stack hints
    tech = []
    server = (http_info.get("server") or "").lower()
    powered = (http_info.get("powered_by") or "").lower()
    if "nginx" in server:
        tech.append("Nginx")
    if "apache" in server:
        tech.append("Apache")
    if "cloudflare" in server:
        tech.append("Cloudflare")
    if "php" in powered:
        tech.append("PHP")
    if "asp.net" in powered:
        tech.append("ASP.NET")
    if "express" in powered:
        tech.append("Express.js")

    results["tech_stack"] = tech
    if tech:
        info(f"Detected tech: [bold]{', '.join(tech)}[/]")

    # --- SSL ---
    info("Checking SSL certificate...")
    ssl_info = _get_ssl_cert(domain)
    results["ssl"] = ssl_info

    if ssl_info:
        ssl_display = {
            "Common Name": ssl_info["common_name"],
            "Organization": ssl_info["organization"] or "--",
            "Issuer": ssl_info["issuer"],
            "Issuer CN": ssl_info["issuer_cn"],
            "Valid From": ssl_info["not_before"],
            "Valid Until": ssl_info["not_after"],
            "SANs": ssl_info["san_count"],
        }
        key_value_block("SSL Certificate", ssl_display)

        if ssl_info["san_sample"]:
            section_header("Subject Alternative Names (sample)")
            for san in ssl_info["san_sample"]:
                styled_print(f"  {san}")
            console.print()
    else:
        warning("Could not retrieve SSL certificate")

    # --- Subdomains ---
    info("Enumerating subdomains via crt.sh...")
    subdomains = _enumerate_subdomains(domain)
    results["subdomains"] = subdomains

    if subdomains:
        # Show up to 30
        display_subs = subdomains[:30]
        rows = [(s,) for s in display_subs]
        result_table(
            f"Subdomains ({len(subdomains)} found)",
            rows,
            columns=["Subdomain"],
        )
        if len(subdomains) > 30:
            dim(f"  ... and {len(subdomains) - 30} more")
    else:
        info("No subdomains found via crt.sh")

    elapsed = time.time() - start
    results["elapsed_seconds"] = round(elapsed, 2)
    scan_complete(elapsed, len(subdomains))

    return results

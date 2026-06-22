#!/usr/bin/env python3
"""
perc.py — Intelligence Framework CLI
Main entry point for the perc tool suite.

Usage:
    python perc.py [options] <target>

Run `python perc.py --help` for full usage information.
"""

import argparse
import json
import os
import sys
import time

# Ensure the tools directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import __version__
from core.banner import print_banner, print_help, print_module_header
from core.config import load_config, save_config
from core.display import (
    console,
    success,
    error,
    warning,
    info,
    dim,
    export_results,
    section_header,
)
from core.license import check_module_access, verify_or_deny, login_user


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        prog="perc",
        description="PERC Intelligence Framework",
        add_help=False,
    )

    # OSINT flags
    parser.add_argument("-u", "--username", type=str, help="Username search")
    parser.add_argument("-e", "--email", type=str, help="Email reconnaissance")
    parser.add_argument("-p", "--phone", type=str, help="Phone number lookup")
    parser.add_argument("-ip", type=str, dest="ip", help="IP geolocation")
    parser.add_argument("-d", "--domain", type=str, help="Domain recon")
    parser.add_argument("-img", type=str, dest="image", help="Image EXIF/GEOINT")
    parser.add_argument("--dork", type=str, help="Google dork generation")
    parser.add_argument("-c", "--category", type=str, default="all", help="Dork category")

    # Payload flags
    parser.add_argument("--payload", type=str, nargs="?", const="interactive", help="Payload builder")
    parser.add_argument("--lhost", type=str, default="", help="Listener host for payloads")
    parser.add_argument("--lport", type=int, default=4444, help="Listener port for payloads")

    # Breach flags
    parser.add_argument("--breach", type=str, help="Breach database search")
    parser.add_argument("--breach-field", type=str, default="all", help="Breach search field (email, username, phone, domain, all)")
    parser.add_argument("--breach-import", type=str, dest="breach_import", help="Import breach data file")
    parser.add_argument("--breach-source", type=str, dest="breach_source", help="Source name for breach import")
    parser.add_argument("--breach-stats", action="store_true", dest="breach_stats", help="Show breach DB stats")
    parser.add_argument("--breach-dedup", action="store_true", dest="breach_dedup", help="Deduplicate breach DB")

    # Utility flags
    parser.add_argument("--help", "-h", action="store_true", dest="show_help", help="Show help")
    parser.add_argument("--version", action="store_true", help="Show version")
    parser.add_argument("--modules", action="store_true", help="List modules and access")
    parser.add_argument("--config", action="store_true", help="Show config path")
    parser.add_argument("--login", nargs=2, metavar=("EMAIL", "PASSWORD"), help="Login to perc.store")
    parser.add_argument("-o", "--output", type=str, help="Save output to file")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress banner")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Output as JSON")

    return parser


def run_osint_username(username: str, output_file: str = None, as_json: bool = False):
    """Run username enumeration."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.username import scan_username
    result = scan_username(username)
    _handle_output(result, output_file, as_json)


def run_osint_email(email: str, output_file: str = None, as_json: bool = False):
    """Run email reconnaissance."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.email import scan_email
    result = scan_email(email)
    _handle_output(result, output_file, as_json)


def run_osint_phone(phone: str, output_file: str = None, as_json: bool = False):
    """Run phone number lookup."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.phone import scan_phone
    result = scan_phone(phone)
    _handle_output(result, output_file, as_json)


def run_osint_ip(ip: str, output_file: str = None, as_json: bool = False):
    """Run IP geolocation."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.ip import scan_ip
    result = scan_ip(ip)
    _handle_output(result, output_file, as_json)


def run_osint_domain(domain: str, output_file: str = None, as_json: bool = False):
    """Run domain recon."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.domain import scan_domain
    result = scan_domain(domain)
    _handle_output(result, output_file, as_json)


def run_osint_image(filepath: str, output_file: str = None, as_json: bool = False):
    """Run image EXIF extraction."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.image import scan_image
    result = scan_image(filepath)
    _handle_output(result, output_file, as_json)


def run_osint_dork(target: str, category: str = "all", output_file: str = None, as_json: bool = False):
    """Run Google dork generation."""
    if not verify_or_deny("osint"):
        return
    from modules.osint.dork import generate_dorks
    result = generate_dorks(target, category)
    _handle_output(result, output_file, as_json)


def run_payload(payload_type: str, lhost: str = "", lport: int = 4444, output_file: str = None, as_json: bool = False):
    """Run payload builder."""
    if not verify_or_deny("payload"):
        return
    from modules.payload.builder import interactive_builder, quick_payload

    if payload_type == "interactive":
        result = interactive_builder()
    elif payload_type == "list":
        from modules.payload.shells import list_shells
        from modules.payload.macros import list_macros
        shells = list_shells()
        macros = list_macros()

        section_header("Available Reverse Shells")
        for s in shells:
            console.print(f"  [bright_magenta]{s['type'].ljust(22)}[/] {s['description']}")
        console.print()

        section_header("Available Macros")
        for m in macros:
            console.print(f"  [bright_yellow]{m['id'].ljust(22)}[/] {m['description']}")
        console.print()
        return
    else:
        if not lhost:
            error("--lhost is required for payload generation. Example: perc --payload bash_tcp --lhost 10.0.0.1 --lport 4444")
            return
        result = quick_payload(payload_type, lhost, lport)

    _handle_output(result, output_file, as_json)


def run_breach_search(query: str, field: str = "all", output_file: str = None, as_json: bool = False):
    """Run breach database search."""
    if not verify_or_deny("breach"):
        return
    from modules.breach.engine import search_breach
    result = search_breach(query, field)
    _handle_output(result, output_file, as_json)


def run_breach_import(filepath: str, source_name: str = None):
    """Import breach data."""
    if not verify_or_deny("breach"):
        return
    from modules.breach.engine import breach_import
    breach_import(filepath, source_name)


def run_breach_stats():
    """Show breach database statistics."""
    if not verify_or_deny("breach"):
        return
    from modules.breach.engine import breach_stats
    breach_stats()


def run_breach_dedup():
    """Deduplicate breach database."""
    if not verify_or_deny("breach"):
        return
    from modules.breach.engine import breach_deduplicate
    breach_deduplicate()


def show_modules():
    """Display module access status."""
    section_header("Module Access")

    modules = [
        ("osint", "OSINT Framework", "Username, email, phone, IP, domain, dork, GEOINT"),
        ("payload", "Payload Builder", "Reverse shells, macros, obfuscation, droppers"),
        ("breach", "Breach Engine", "Offline credential search, database import"),
    ]

    for mod_id, name, desc in modules:
        has_access = check_module_access(mod_id)
        status = "[bright_green]Active[/]" if has_access else "[dim]Locked[/]"
        console.print(f"  {status}  [bold]{name.ljust(20)}[/] [dim]{desc}[/]")

    console.print()


def _handle_output(result: dict | None, output_file: str = None, as_json: bool = False):
    """Handle output export if requested."""
    if result is None:
        return
    if as_json:
        console.print_json(json.dumps(result, default=str, indent=2))
    if output_file:
        export_results(result, output_file)


def main():
    """Main entry point."""
    parser = build_parser()
    args = parser.parse_args()

    # Show help if no args
    if len(sys.argv) == 1 or args.show_help:
        print_help()
        return

    # Version
    if args.version:
        console.print(f"  perc v{__version__}")
        return

    # Banner (unless quiet)
    if not args.quiet and not args.json_output:
        print_banner()

    # Login
    if args.login:
        login_user(args.login[0], args.login[1])
        return

    # Config
    if args.config:
        from core.config import CONFIG_FILE
        info(f"Config file: [bold]{CONFIG_FILE}[/]")
        return

    # Modules
    if args.modules:
        show_modules()
        return

    # Route to the appropriate module
    output = args.output
    js = args.json_output

    if args.username:
        run_osint_username(args.username, output, js)
    elif args.email:
        run_osint_email(args.email, output, js)
    elif args.phone:
        run_osint_phone(args.phone, output, js)
    elif args.ip:
        run_osint_ip(args.ip, output, js)
    elif args.domain:
        run_osint_domain(args.domain, output, js)
    elif args.image:
        run_osint_image(args.image, output, js)
    elif args.dork:
        run_osint_dork(args.dork, args.category, output, js)
    elif args.payload is not None:
        run_payload(args.payload, args.lhost, args.lport, output, js)
    elif args.breach:
        run_breach_search(args.breach, args.breach_field, output, js)
    elif args.breach_import:
        run_breach_import(args.breach_import, args.breach_source)
    elif args.breach_stats:
        run_breach_stats()
    elif args.breach_dedup:
        run_breach_dedup()
    else:
        print_help()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n  [dim]Interrupted.[/dim]")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n  [bright_red]Error:[/bright_red] {e}")
        sys.exit(1)

"""
modules/osint/dork.py — Google dork query generator
Generates categorized Google dork queries for OSINT reconnaissance.
Supports 10 categories with 8-15 templates each.
"""

import time
from typing import Any

from core.display import (
    console, success, info, scan_header, scan_complete,
    section_header, styled_print, key_value_block,
)


# ---------------------------------------------------------------------------
# Dork template categories
# Each template uses {target} as the placeholder for the search subject.
# ---------------------------------------------------------------------------
DORK_CATEGORIES: dict[str, list[str]] = {
    "social": [
        'site:twitter.com "{target}"',
        'site:x.com "{target}"',
        'site:linkedin.com/in/ "{target}"',
        'site:facebook.com "{target}"',
        'site:instagram.com "{target}"',
        'site:reddit.com/user/ "{target}"',
        'site:github.com "{target}"',
        'site:medium.com "@{target}"',
        'site:tiktok.com "@{target}"',
        'site:youtube.com "{target}"',
        'site:pinterest.com "{target}"',
        'site:flickr.com "{target}"',
        '"{target}" inurl:profile',
        '"{target}" inurl:user',
        '"{target}" site:about.me',
    ],
    "documents": [
        '"{target}" filetype:pdf',
        '"{target}" filetype:doc OR filetype:docx',
        '"{target}" filetype:xls OR filetype:xlsx',
        '"{target}" filetype:ppt OR filetype:pptx',
        '"{target}" filetype:csv',
        '"{target}" filetype:rtf',
        '"{target}" filetype:odt',
        '"{target}" filetype:txt',
        'site:{target} filetype:pdf',
        'site:{target} filetype:doc OR filetype:docx',
        'site:{target} filetype:xls OR filetype:xlsx',
        'site:{target} filetype:ppt OR filetype:pptx',
    ],
    "login": [
        'site:{target} inurl:login',
        'site:{target} inurl:admin',
        'site:{target} inurl:signin',
        'site:{target} intitle:"login"',
        'site:{target} intitle:"admin panel"',
        'site:{target} intitle:"dashboard" inurl:admin',
        'site:{target} inurl:wp-login.php',
        'site:{target} inurl:wp-admin',
        'site:{target} inurl:cpanel',
        'site:{target} inurl:webmail',
        'site:{target} intitle:"sign in" OR intitle:"log in"',
        'site:{target} inurl:portal',
    ],
    "directories": [
        'site:{target} intitle:"index of /"',
        'site:{target} intitle:"index of" "parent directory"',
        'site:{target} intitle:"directory listing"',
        'site:{target} intitle:"index of" inurl:ftp',
        'site:{target} intitle:"index of" "backup"',
        'site:{target} intitle:"index of" "config"',
        'site:{target} intitle:"index of" "logs"',
        'site:{target} intitle:"index of" ".git"',
        'site:{target} intitle:"index of" "wp-content"',
        'site:{target} intitle:"index of" "uploads"',
    ],
    "databases": [
        'site:{target} filetype:sql',
        'site:{target} filetype:db',
        'site:{target} filetype:sqlite',
        'site:{target} filetype:mdb',
        'site:{target} filetype:bak',
        '"{target}" filetype:sql "INSERT INTO"',
        '"{target}" filetype:sql "CREATE TABLE"',
        'site:{target} inurl:phpmyadmin',
        'site:{target} intitle:"phpMyAdmin"',
        'site:{target} inurl:adminer',
        'site:{target} ext:sql intext:password',
    ],
    "email": [
        'site:{target} intext:"@{target}"',
        '"{target}" "@gmail.com" OR "@yahoo.com" OR "@hotmail.com"',
        'site:{target} filetype:csv intext:email',
        '"{target}" intext:"email" intext:"phone"',
        '"{target}" intext:"contact" intext:"@"',
        'site:{target} "mailto:"',
        '"{target}" filetype:xls intext:email',
        'intext:"@{target}" filetype:txt',
        'site:pastebin.com "{target}" email',
        'site:pastebin.com "@{target}"',
    ],
    "phone": [
        '"{target}" intext:"phone" OR intext:"tel" OR intext:"fax"',
        '"{target}" intext:"contact" intext:"phone"',
        'site:{target} intext:"phone" intext:"email"',
        '"{target}" filetype:csv intext:phone',
        '"{target}" intext:"+1" OR intext:"+44" OR intext:"+91"',
        'site:{target} "telephone" OR "mobile" OR "cell"',
        '"{target}" "phone number" OR "contact number"',
        '"{target}" inurl:contact',
    ],
    "personal": [
        '"{target}" intext:"date of birth" OR intext:"DOB"',
        '"{target}" intext:"address" intext:"phone"',
        '"{target}" intext:"resume" OR intext:"curriculum vitae"',
        '"{target}" filetype:pdf intext:"resume"',
        '"{target}" intext:"social security" OR intext:"SSN"',
        '"{target}" site:pastebin.com',
        '"{target}" site:justpaste.it',
        '"{target}" site:doxbin.com',
        '"{target}" site:scribd.com',
        '"{target}" intext:"passport" OR intext:"driver license"',
        '"{target}" intitle:"resume" filetype:pdf',
    ],
    "credentials": [
        'site:{target} filetype:env',
        'site:{target} filetype:cfg',
        'site:{target} filetype:ini',
        'site:{target} filetype:conf',
        'site:{target} filetype:yml "password"',
        'site:{target} filetype:json "password"',
        'site:{target} filetype:xml "password"',
        'site:{target} filetype:log "password"',
        'site:{target} inurl:.env',
        'site:{target} intext:"DB_PASSWORD" OR intext:"DB_USERNAME"',
        'site:{target} intext:"api_key" OR intext:"apikey" OR intext:"api_secret"',
        'site:{target} "AWS_SECRET_ACCESS_KEY" OR "AWS_ACCESS_KEY_ID"',
        'site:github.com "{target}" "password" OR "secret" OR "token"',
        'site:pastebin.com "{target}" "password"',
    ],
    "subdomains": [
        'site:*.{target}',
        'site:*.{target} -www',
        'site:{target} -www -site:www.{target}',
        'site:*.*.{target}',
        'site:dev.{target} OR site:staging.{target} OR site:test.{target}',
        'site:api.{target} OR site:app.{target} OR site:beta.{target}',
        'site:admin.{target} OR site:portal.{target} OR site:mail.{target}',
        'site:vpn.{target} OR site:remote.{target} OR site:intranet.{target}',
        'site:cdn.{target} OR site:assets.{target} OR site:static.{target}',
        'site:jira.{target} OR site:confluence.{target} OR site:wiki.{target}',
    ],
}

# Human-readable category labels
_CATEGORY_META: dict[str, dict[str, str]] = {
    "social":      {"label": "Social Media & Profiles"},
    "documents":   {"label": "Exposed Documents"},
    "login":       {"label": "Login Panels & Admin Pages"},
    "directories": {"label": "Directory Listings"},
    "databases":   {"label": "Database Exposures"},
    "email":       {"label": "Email Addresses"},
    "phone":       {"label": "Phone Numbers"},
    "personal":    {"label": "Personal Information"},
    "credentials": {"label": "Credentials & Secrets"},
    "subdomains":  {"label": "Subdomain Discovery"},
}


def generate_dorks(target: str, category: str = "all") -> dict:
    """Generate Google dork queries for the given target.

    Args:
        target: The target string (domain, name, or username).
        category: Category to generate dorks for, or 'all' for every category.
                  Valid categories: social, documents, login, directories,
                  databases, email, phone, personal, credentials, subdomains

    Returns:
        Dict with generated dorks organized by category.
    """
    scan_header("Google Dork Generator", target)
    start = time.time()

    # Determine which categories to use
    if category.lower() == "all":
        categories = list(DORK_CATEGORIES.keys())
    elif category.lower() in DORK_CATEGORIES:
        categories = [category.lower()]
    else:
        from core.display import error as display_error
        display_error(
            f"Unknown category: [bold]{category}[/bold]\n"
            f"  Valid: {', '.join(DORK_CATEGORIES.keys())}, all"
        )
        return {
            "error": f"Unknown category: {category}",
            "valid_categories": list(DORK_CATEGORIES.keys()),
        }

    results: dict[str, Any] = {
        "scan_type": "dork_generator",
        "target": target,
        "categories": {},
        "total_dorks": 0,
    }

    total_dorks = 0

    for cat in categories:
        templates = DORK_CATEGORIES[cat]
        meta = _CATEGORY_META.get(cat, {"label": cat.title()})

        dorks = [tpl.format(target=target) for tpl in templates]
        results["categories"][cat] = dorks
        total_dorks += len(dorks)

        # Display
        section_header(meta["label"])

        for i, dork in enumerate(dorks, 1):
            # Make the dork a clickable Google search link
            encoded = dork.replace(" ", "+").replace('"', "%22")
            search_url = f"https://www.google.com/search?q={encoded}"
            styled_print(
                f"[dim]{i:>2}.[/dim]  [bold white]{dork}[/]"
            )
            styled_print(
                f"     [dim]{search_url}[/dim]"
            )

    results["total_dorks"] = total_dorks

    console.print()
    success(f"Generated [bold]{total_dorks}[/bold] dork(s) across [bold]{len(categories)}[/bold] category/ies")

    elapsed = time.time() - start
    scan_complete(elapsed, result_count=total_dorks)
    results["elapsed_seconds"] = round(elapsed, 2)

    return results

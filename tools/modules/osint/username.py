"""
modules/osint/username.py — Username enumeration across platforms
Checks username availability on 45+ social media and developer platforms concurrently.
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests

from core.config import get_user_agent, get_timeout, get_proxy
from core.display import (
    console, success, error, warning, info, scan_header, scan_complete,
    platform_results, progress_scanner, styled_print,
)

# ---------------------------------------------------------------------------
# Platform definitions
# Each entry: name, url template ({username}), error_type, and error_value
#   error_type='status_code' — profile found if HTTP status != 404
#   error_type='message'     — profile found if error_value NOT in response text
# ---------------------------------------------------------------------------
PLATFORMS: list[dict[str, Any]] = [
    # Developer / Code
    {"name": "GitHub", "url": "https://github.com/{username}", "error_type": "status_code"},
    {"name": "GitLab", "url": "https://gitlab.com/{username}", "error_type": "status_code"},
    {"name": "Bitbucket", "url": "https://bitbucket.org/{username}/", "error_type": "status_code"},
    {"name": "Replit", "url": "https://replit.com/@{username}", "error_type": "status_code"},
    {"name": "CodePen", "url": "https://codepen.io/{username}", "error_type": "status_code"},
    {"name": "StackOverflow", "url": "https://stackoverflow.com/users/{username}", "error_type": "status_code"},
    {"name": "HackerOne", "url": "https://hackerone.com/{username}", "error_type": "status_code"},
    {"name": "BugCrowd", "url": "https://bugcrowd.com/{username}", "error_type": "status_code"},
    {"name": "npm", "url": "https://www.npmjs.com/~{username}", "error_type": "status_code"},
    {"name": "PyPI", "url": "https://pypi.org/user/{username}/", "error_type": "status_code"},

    # Social media
    {"name": "Twitter/X", "url": "https://x.com/{username}", "error_type": "status_code"},
    {"name": "Reddit", "url": "https://www.reddit.com/user/{username}", "error_type": "status_code"},
    {"name": "Instagram", "url": "https://www.instagram.com/{username}/", "error_type": "status_code"},
    {"name": "TikTok", "url": "https://www.tiktok.com/@{username}", "error_type": "status_code"},
    {"name": "Facebook", "url": "https://www.facebook.com/{username}", "error_type": "message", "error_value": "Page Not Found"},
    {"name": "Pinterest", "url": "https://www.pinterest.com/{username}/", "error_type": "status_code"},
    {"name": "Snapchat", "url": "https://www.snapchat.com/add/{username}", "error_type": "status_code"},
    {"name": "VK", "url": "https://vk.com/{username}", "error_type": "message", "error_value": "Page not found"},
    {"name": "Tumblr", "url": "https://{username}.tumblr.com", "error_type": "status_code"},
    {"name": "Mastodon.social", "url": "https://mastodon.social/@{username}", "error_type": "status_code"},

    # Content / Media
    {"name": "YouTube", "url": "https://www.youtube.com/@{username}", "error_type": "status_code"},
    {"name": "Twitch", "url": "https://www.twitch.tv/{username}", "error_type": "status_code"},
    {"name": "Medium", "url": "https://medium.com/@{username}", "error_type": "status_code"},
    {"name": "Spotify", "url": "https://open.spotify.com/user/{username}", "error_type": "status_code"},
    {"name": "SoundCloud", "url": "https://soundcloud.com/{username}", "error_type": "status_code"},
    {"name": "Vimeo", "url": "https://vimeo.com/{username}", "error_type": "status_code"},
    {"name": "Flickr", "url": "https://www.flickr.com/people/{username}/", "error_type": "status_code"},
    {"name": "DeviantArt", "url": "https://www.deviantart.com/{username}", "error_type": "status_code"},
    {"name": "500px", "url": "https://500px.com/p/{username}", "error_type": "status_code"},

    # Professional / Portfolio
    {"name": "LinkedIn", "url": "https://www.linkedin.com/in/{username}/", "error_type": "status_code"},
    {"name": "Dribbble", "url": "https://dribbble.com/{username}", "error_type": "status_code"},
    {"name": "Behance", "url": "https://www.behance.net/{username}", "error_type": "status_code"},
    {"name": "About.me", "url": "https://about.me/{username}", "error_type": "status_code"},
    {"name": "Gravatar", "url": "https://en.gravatar.com/{username}", "error_type": "status_code"},
    {"name": "Fiverr", "url": "https://www.fiverr.com/{username}", "error_type": "status_code"},

    # Gaming
    {"name": "Steam", "url": "https://steamcommunity.com/id/{username}", "error_type": "message", "error_value": "The specified profile could not be found"},
    {"name": "Xbox Gamertag", "url": "https://xboxgamertag.com/search/{username}", "error_type": "status_code"},

    # Messaging / Community
    {"name": "Telegram", "url": "https://t.me/{username}", "error_type": "message", "error_value": "If you have <strong>Telegram</strong>, you can contact"},
    {"name": "Discord", "url": "https://discord.com/users/{username}", "error_type": "status_code"},
    {"name": "Keybase", "url": "https://keybase.io/{username}", "error_type": "status_code"},
    {"name": "HackerNews", "url": "https://news.ycombinator.com/user?id={username}", "error_type": "message", "error_value": "No such user."},

    # Finance / Commerce
    {"name": "Patreon", "url": "https://www.patreon.com/{username}", "error_type": "status_code"},
    {"name": "CashApp", "url": "https://cash.app/${username}", "error_type": "status_code"},
    {"name": "Venmo", "url": "https://account.venmo.com/u/{username}", "error_type": "status_code"},

    # Other
    {"name": "Imgur", "url": "https://imgur.com/user/{username}", "error_type": "status_code"},
    {"name": "Trello", "url": "https://trello.com/{username}", "error_type": "status_code"},
    {"name": "Slideshare", "url": "https://www.slideshare.net/{username}", "error_type": "status_code"},
]


def _check_platform(platform: dict, username: str, session: requests.Session) -> dict:
    """Check a single platform for the given username. Returns a result dict."""
    name = platform["name"]
    url = platform["url"].format(username=username)
    error_type = platform["error_type"]

    result = {"name": name, "url": url, "found": False, "status_code": None, "error": None}

    try:
        resp = session.get(url, timeout=get_timeout(), allow_redirects=True)
        result["status_code"] = resp.status_code

        if error_type == "status_code":
            result["found"] = resp.status_code != 404
        elif error_type == "message":
            error_value = platform.get("error_value", "")
            result["found"] = error_value not in resp.text
    except requests.exceptions.Timeout:
        result["error"] = "timeout"
    except requests.exceptions.ConnectionError:
        result["error"] = "connection_error"
    except requests.exceptions.TooManyRedirects:
        result["error"] = "too_many_redirects"
    except requests.exceptions.RequestException as exc:
        result["error"] = str(exc)[:60]

    return result


def scan_username(username: str) -> dict:
    """Enumerate a username across all configured platforms.

    Args:
        username: The username string to search for.

    Returns:
        Dict with target, found list, not_found list, errors, and counts.
    """
    scan_header("Username Enumeration", username)
    start = time.time()

    headers = {"User-Agent": get_user_agent()}
    proxies = get_proxy()

    session = requests.Session()
    session.headers.update(headers)
    if proxies:
        session.proxies.update(proxies)

    found: list[dict] = []
    not_found: list[str] = []
    errors: list[dict] = []
    display_rows: list[dict] = []

    info(f"Checking [bold]{len(PLATFORMS)}[/bold] platforms with 20 threads …")
    console.print()

    with progress_scanner("Scanning platforms") as progress:
        task = progress.add_task("Scanning platforms …", total=len(PLATFORMS))
        futures = {}

        with ThreadPoolExecutor(max_workers=20) as executor:
            for plat in PLATFORMS:
                fut = executor.submit(_check_platform, plat, username, session)
                futures[fut] = plat["name"]

            for future in as_completed(futures):
                result = future.result()
                progress.advance(task)

                if result.get("error"):
                    errors.append({"name": result["name"], "error": result["error"]})
                    display_rows.append({"name": result["name"], "found": False, "url": None})
                elif result["found"]:
                    found.append({"name": result["name"], "url": result["url"]})
                    display_rows.append({"name": result["name"], "found": True, "url": result["url"]})
                else:
                    not_found.append(result["name"])
                    display_rows.append({"name": result["name"], "found": False, "url": None})

    # Sort: found first, then alphabetical
    display_rows.sort(key=lambda r: (not r["found"], r["name"].lower()))

    platform_results(display_rows, title=f"Username: {username}")

    if errors:
        warning(f"{len(errors)} platform(s) returned errors")
        for e in errors:
            styled_print(f"  [dim]{e['name']}: {e['error']}[/]")

    elapsed = time.time() - start
    scan_complete(elapsed, result_count=len(found))

    return {
        "scan_type": "username_enumeration",
        "target": username,
        "total_platforms": len(PLATFORMS),
        "found_count": len(found),
        "found": found,
        "not_found": not_found,
        "errors": errors,
        "elapsed_seconds": round(elapsed, 2),
    }

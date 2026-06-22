"""
modules/breach/engine.py — Breach search engine and CLI interface
"""

import time

from modules.breach.database import BreachDatabase
from modules.breach.importer import import_file, import_directory
from core.display import (
    console, success, error, info, warning,
    scan_header, scan_complete,
    key_value_block, result_table, section_header, dim,
)


def _censor_password(pw: str) -> str:
    """Partially censor a password: show first 2 chars + ***."""
    if not pw:
        return ""
    if len(pw) <= 2:
        return pw[0] + "***"
    return pw[:2] + "***"


def search_breach(query: str, field: str = "all") -> dict:
    """Search the local breach database.

    Args:
        query: Search term (email, username, phone, etc.)
        field: Field to search ('all', 'email', 'username', 'phone', 'domain')

    Returns:
        Dict with query, field, results list, count, and timing.
    """
    scan_header("Breach Engine", query)
    start = time.time()

    db = BreachDatabase()
    try:
        if field == "email":
            results = db.search_email(query)
        elif field == "username":
            results = db.search_username(query)
        elif field == "phone":
            results = db.search_phone(query)
        elif field == "domain":
            results = db.search_domain(query)
        else:
            results = db.search(query, field="all")
    except Exception as e:
        error(f"Search error: {e}")
        db.close()
        return {"error": str(e)}
    finally:
        db.close()

    elapsed = time.time() - start

    if not results:
        info("No results found.")
        scan_complete(elapsed, 0)
        return {
            "query": query,
            "field": field,
            "results": [],
            "count": 0,
            "elapsed_seconds": round(elapsed, 2),
        }

    # Build table rows
    rows = []
    for r in results:
        email = r.get("email", "")
        username = r.get("username", "")
        pw = r.get("password", "")
        h = r.get("hash", "")
        source = r.get("source", "")

        pw_display = _censor_password(pw) if pw else (h[:12] + "..." if h and len(h) > 12 else h)
        rows.append((email, username, pw_display, source))

    result_table(
        f"Breach Results for: {query}",
        rows,
        columns=["Email", "Username", "Password/Hash", "Source"],
    )

    scan_complete(elapsed, len(results))

    return {
        "query": query,
        "field": field,
        "results": results,
        "count": len(results),
        "elapsed_seconds": round(elapsed, 2),
    }


def breach_import(filepath: str, source_name: str = None) -> dict:
    """Import a breach data file into the local database."""
    import os
    if not os.path.exists(filepath):
        error(f"File not found: {filepath}")
        return {"error": "file_not_found"}

    if os.path.isdir(filepath):
        return import_directory(filepath)

    return import_file(filepath, source_name)


def breach_stats() -> dict:
    """Display breach database statistics."""
    section_header("Breach Database Statistics")

    db = BreachDatabase()
    try:
        stats = db.get_stats()
    except Exception as e:
        error(f"Error reading database: {e}")
        db.close()
        return {"error": str(e)}
    finally:
        db.close()

    key_value_block("Overview", {
        "Total entries": f"{stats.get('total_entries', 0):,}",
        "Total sources": stats.get("total_sources", 0),
        "Database size": _format_size(stats.get("db_size_bytes", 0)),
    })

    sources = stats.get("top_sources", [])
    if sources:
        rows = [(s["name"], f"{s['count']:,}") for s in sources]
        result_table("Top Sources", rows, columns=["Source", "Entries"])

    return stats


def breach_deduplicate() -> dict:
    """Remove duplicate entries from the breach database."""
    section_header("Deduplication")
    info("Scanning for duplicate entries...")

    db = BreachDatabase()
    try:
        removed = db.deduplicate()
    except Exception as e:
        error(f"Deduplication error: {e}")
        db.close()
        return {"error": str(e)}
    finally:
        db.close()

    if removed > 0:
        success(f"Removed [bold]{removed:,}[/] duplicate entries")
    else:
        info("No duplicates found")

    return {"removed": removed}


def _format_size(size_bytes: int) -> str:
    """Format byte count to human-readable string."""
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f"{size:.1f} {units[i]}"

"""
modules/breach/importer.py — Breach data file importer
Parses common breach dump formats and bulk-imports them into the local SQLite database.
"""

import csv
import json
import os
import re
import time
from pathlib import Path

from modules.breach.database import BreachDatabase
from core.display import (
    console, success, error, info, warning, dim,
    progress_scanner, result_table, key_value_block,
)

# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
HASH_RE = re.compile(r"^[a-fA-F0-9]{32,128}$")


def detect_format(filepath: str) -> str:
    """Read first 20 lines and detect the breach file format.

    Returns one of:
        'email:pass', 'email:hash', 'user:pass', 'combo', 'csv', 'json', 'unknown'
    """
    ext = Path(filepath).suffix.lower()
    if ext == ".json":
        return "json"
    if ext == ".csv":
        return "csv"

    lines = _read_sample(filepath, 20)
    if not lines:
        return "unknown"

    email_pass = 0
    email_hash = 0
    user_pass = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Try colon-separated first
        if ":" in line:
            parts = line.split(":", 1)
            left, right = parts[0].strip(), parts[1].strip()

            if EMAIL_RE.match(left):
                if HASH_RE.match(right):
                    email_hash += 1
                else:
                    email_pass += 1
            else:
                user_pass += 1
        elif ";" in line:
            # semicolon-separated
            parts = line.split(";", 1)
            left = parts[0].strip()
            if EMAIL_RE.match(left):
                email_pass += 1
            else:
                user_pass += 1
        elif "," in line and not ext == ".csv":
            # Might be csv without extension
            if line.count(",") >= 2:
                return "csv"

    total = email_pass + email_hash + user_pass
    if total == 0:
        return "unknown"

    if email_hash > email_pass and email_hash > user_pass:
        return "email:hash"
    elif email_pass >= user_pass:
        return "email:pass"
    elif user_pass > 0:
        return "user:pass"

    return "combo"


def parse_line(line: str, fmt: str) -> dict | None:
    """Parse a single line into a dict based on format.

    Returns dict with keys matching the database columns, or None if unparseable.
    """
    line = line.strip()
    if not line:
        return None

    entry = {}

    if fmt in ("email:pass", "email:hash", "user:pass", "combo"):
        # Try colon first, then semicolon
        sep = ":" if ":" in line else (";" if ";" in line else None)
        if not sep:
            return None

        parts = line.split(sep, 1)
        if len(parts) < 2:
            return None

        left = parts[0].strip()
        right = parts[1].strip()

        if not left or not right:
            return None

        if fmt == "email:pass":
            entry["email"] = left
            entry["password"] = right
        elif fmt == "email:hash":
            entry["email"] = left
            entry["hash"] = right
        elif fmt == "user:pass":
            entry["username"] = left
            entry["password"] = right
        elif fmt == "combo":
            if EMAIL_RE.match(left):
                entry["email"] = left
            else:
                entry["username"] = left

            if HASH_RE.match(right):
                entry["hash"] = right
            else:
                entry["password"] = right

    elif fmt == "csv":
        # CSV lines are handled differently in import_file
        return None

    elif fmt == "json":
        # JSON entries are handled differently in import_file
        return None

    return entry if entry else None


# ---------------------------------------------------------------------------
# Import functions
# ---------------------------------------------------------------------------

def import_file(filepath: str, source_name: str = None, batch_size: int = 5000) -> dict:
    """Import a breach data file into the local database.

    Supports: email:pass, email:hash, user:pass, combo, csv, json formats.
    Handles large files efficiently by streaming line-by-line.

    Returns dict with import statistics.
    """
    filepath = os.path.abspath(filepath)

    if not os.path.isfile(filepath):
        error(f"File not found: {filepath}")
        return {"error": "file_not_found"}

    if source_name is None:
        source_name = Path(filepath).stem

    # Detect format
    fmt = detect_format(filepath)
    info(f"Detected format: [bold]{fmt}[/]")

    if fmt == "unknown":
        error("Could not detect file format. Supported: email:pass, email:hash, user:pass, csv, json")
        return {"error": "unknown_format"}

    start = time.time()
    stats = {
        "file": filepath,
        "source": source_name,
        "format": fmt,
        "lines_read": 0,
        "parsed": 0,
        "inserted": 0,
        "skipped": 0,
        "errors": 0,
    }

    db = BreachDatabase()

    try:
        if fmt == "json":
            _import_json(filepath, db, source_name, stats)
        elif fmt == "csv":
            _import_csv(filepath, db, source_name, batch_size, stats)
        else:
            _import_text(filepath, db, source_name, fmt, batch_size, stats)
    except Exception as e:
        error(f"Import error: {e}")
        stats["errors"] += 1
    finally:
        db.close()

    elapsed = time.time() - start
    stats["elapsed_seconds"] = round(elapsed, 2)

    # Print summary
    console.print()
    key_value_block("Import Summary", {
        "File": Path(filepath).name,
        "Source": source_name,
        "Format": fmt,
        "Lines read": stats["lines_read"],
        "Parsed": stats["parsed"],
        "Inserted": stats["inserted"],
        "Skipped": stats["skipped"],
        "Time": f"{elapsed:.1f}s",
    })

    return stats


def _import_text(filepath: str, db: BreachDatabase, source: str, fmt: str, batch_size: int, stats: dict):
    """Import a text-based breach file (email:pass, user:pass, etc.)."""
    batch = []
    file_size = os.path.getsize(filepath)

    with progress_scanner("Importing") as progress:
        task = progress.add_task("Reading file...", total=file_size)

        fh = _open_file(filepath)
        bytes_read = 0

        for line in fh:
            bytes_read += len(line.encode("utf-8", errors="ignore"))
            progress.update(task, completed=min(bytes_read, file_size))
            stats["lines_read"] += 1

            entry = parse_line(line, fmt)
            if entry:
                entry["source"] = source
                batch.append(entry)
                stats["parsed"] += 1
            else:
                stats["skipped"] += 1

            if len(batch) >= batch_size:
                inserted = db.insert_batch(batch, source)
                stats["inserted"] += inserted
                batch = []

        fh.close()

    # Flush remaining
    if batch:
        inserted = db.insert_batch(batch, source)
        stats["inserted"] += inserted


def _import_csv(filepath: str, db: BreachDatabase, source: str, batch_size: int, stats: dict):
    """Import a CSV breach file with headers."""
    batch = []
    fh = _open_file(filepath)

    reader = csv.DictReader(fh)
    field_map = _build_csv_field_map(reader.fieldnames or [])

    if not field_map:
        error("Could not map CSV columns to breach fields")
        fh.close()
        return

    info(f"CSV field mapping: {field_map}")

    for row in reader:
        stats["lines_read"] += 1
        entry = {}
        for db_field, csv_field in field_map.items():
            val = row.get(csv_field, "").strip()
            if val:
                entry[db_field] = val

        if entry:
            entry["source"] = source
            batch.append(entry)
            stats["parsed"] += 1
        else:
            stats["skipped"] += 1

        if len(batch) >= batch_size:
            inserted = db.insert_batch(batch, source)
            stats["inserted"] += inserted
            batch = []

    fh.close()

    if batch:
        inserted = db.insert_batch(batch, source)
        stats["inserted"] += inserted


def _import_json(filepath: str, db: BreachDatabase, source: str, stats: dict):
    """Import a JSON breach file (array of objects)."""
    fh = _open_file(filepath)
    content = fh.read()
    fh.close()

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        error(f"JSON parse error: {e}")
        return

    if not isinstance(data, list):
        error("JSON file must contain an array of objects")
        return

    entries = []
    for item in data:
        if not isinstance(item, dict):
            stats["skipped"] += 1
            continue
        stats["lines_read"] += 1

        entry = {}
        for key, val in item.items():
            mapped = _map_field_name(key)
            if mapped and val:
                entry[mapped] = str(val).strip()

        if entry:
            entry["source"] = source
            entries.append(entry)
            stats["parsed"] += 1
        else:
            stats["skipped"] += 1

    if entries:
        inserted = db.insert_batch(entries, source)
        stats["inserted"] += inserted


def import_directory(dirpath: str, recursive: bool = False) -> dict:
    """Import all supported breach files from a directory.

    Returns combined stats dict.
    """
    dirpath = os.path.abspath(dirpath)
    if not os.path.isdir(dirpath):
        error(f"Directory not found: {dirpath}")
        return {"error": "dir_not_found"}

    supported_ext = {".txt", ".csv", ".json", ".lst", ".dat"}
    files = []

    if recursive:
        for root, dirs, filenames in os.walk(dirpath):
            for fname in filenames:
                if Path(fname).suffix.lower() in supported_ext:
                    files.append(os.path.join(root, fname))
    else:
        for fname in os.listdir(dirpath):
            fpath = os.path.join(dirpath, fname)
            if os.path.isfile(fpath) and Path(fname).suffix.lower() in supported_ext:
                files.append(fpath)

    if not files:
        warning("No supported files found in directory")
        return {"error": "no_files", "dir": dirpath}

    info(f"Found {len(files)} file(s) to import")

    combined = {
        "dir": dirpath,
        "files_processed": 0,
        "total_inserted": 0,
        "total_skipped": 0,
    }

    for fpath in files:
        console.print(f"\n  [bold]Importing:[/] {Path(fpath).name}")
        result = import_file(fpath)
        combined["files_processed"] += 1
        combined["total_inserted"] += result.get("inserted", 0)
        combined["total_skipped"] += result.get("skipped", 0)

    success(f"Imported {combined['files_processed']} file(s), {combined['total_inserted']} total entries")
    return combined


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _open_file(filepath: str):
    """Open a file with encoding fallback: utf-8 -> latin-1 -> ignore."""
    for encoding in ("utf-8", "latin-1"):
        try:
            fh = open(filepath, "r", encoding=encoding, errors="strict")
            # Test read a few bytes
            fh.read(256)
            fh.seek(0)
            return fh
        except (UnicodeDecodeError, UnicodeError):
            continue

    # Last resort
    return open(filepath, "r", encoding="utf-8", errors="ignore")


def _read_sample(filepath: str, n: int = 20) -> list[str]:
    """Read first n lines from a file."""
    fh = _open_file(filepath)
    lines = []
    for i, line in enumerate(fh):
        if i >= n:
            break
        lines.append(line)
    fh.close()
    return lines


def _map_field_name(name: str) -> str | None:
    """Map a field name from a breach file to our database column."""
    name_lower = name.lower().strip()
    mapping = {
        "email": "email",
        "mail": "email",
        "e-mail": "email",
        "email_address": "email",
        "user": "username",
        "username": "username",
        "login": "username",
        "nick": "username",
        "nickname": "username",
        "pass": "password",
        "password": "password",
        "passwd": "password",
        "pwd": "password",
        "hash": "hash",
        "password_hash": "hash",
        "passhash": "hash",
        "md5": "hash",
        "sha1": "hash",
        "sha256": "hash",
        "phone": "phone",
        "telephone": "phone",
        "mobile": "phone",
        "cell": "phone",
        "phone_number": "phone",
        "ip": "ip",
        "ip_address": "ip",
        "ipaddress": "ip",
        "name": "name",
        "fullname": "name",
        "full_name": "name",
        "realname": "name",
        "first_name": "name",
        "firstname": "name",
    }
    return mapping.get(name_lower)


def _build_csv_field_map(fieldnames: list[str]) -> dict[str, str]:
    """Build a mapping from our DB fields to CSV column names."""
    result = {}
    for col in fieldnames:
        mapped = _map_field_name(col)
        if mapped and mapped not in result:
            result[mapped] = col
    return result

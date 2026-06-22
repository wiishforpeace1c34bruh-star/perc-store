"""
modules/breach/database.py — SQLite database management for breach data.

Provides a BreachDatabase class that manages a local SQLite database for
storing, indexing, and searching breach entries.  Uses FTS5 for fast
full-text search with a LIKE fallback when FTS is unavailable.
"""

import sqlite3
import os
from pathlib import Path

from core.config import load_config
from core.display import console, success, error, info, dim, progress_scanner


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

DB_SCHEMA = """
-- Main entries table
CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT,
    username    TEXT,
    password    TEXT,
    hash        TEXT,
    phone       TEXT,
    ip          TEXT,
    name        TEXT,
    source      TEXT,
    added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sources meta-table
CREATE TABLE IF NOT EXISTS sources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE,
    entry_count INTEGER DEFAULT 0,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_entries_email    ON entries(email);
CREATE INDEX IF NOT EXISTS idx_entries_username ON entries(username);
CREATE INDEX IF NOT EXISTS idx_entries_phone    ON entries(phone);
CREATE INDEX IF NOT EXISTS idx_entries_ip       ON entries(ip);
CREATE INDEX IF NOT EXISTS idx_entries_source   ON entries(source);

-- FTS5 full-text index (content-sync mode)
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    email, username, password, name, source,
    content=entries,
    content_rowid=id
);
"""


class BreachDatabase:
    """Context-managed SQLite database for breach records."""

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def __init__(self, db_path: str = None) -> None:
        if db_path is None:
            cfg = load_config()
            db_path = cfg.get("breach_db", {}).get("path", "")
            if not db_path:
                db_path = str(Path.home() / ".perc" / "breach.db")

        self.db_path: str = db_path
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

        self.conn: sqlite3.Connection = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self._init_schema()

    def _init_schema(self) -> None:
        """Run the schema DDL (safe to call repeatedly)."""
        try:
            self.conn.executescript(DB_SCHEMA)
            self.conn.commit()
        except sqlite3.OperationalError as exc:
            # FTS5 may not be compiled in — create tables without it
            if "fts5" in str(exc).lower():
                schema_no_fts = "\n".join(
                    line for line in DB_SCHEMA.splitlines()
                    if "fts5" not in line.lower()
                    and "entries_fts" not in line.lower()
                    and "content=" not in line.lower()
                    and "content_rowid=" not in line.lower()
                )
                # Re-create without the FTS block
                clean = []
                skip = False
                for line in DB_SCHEMA.splitlines():
                    if "CREATE VIRTUAL TABLE" in line:
                        skip = True
                        continue
                    if skip and line.strip() == ");":
                        skip = False
                        continue
                    if skip:
                        continue
                    clean.append(line)
                self.conn.executescript("\n".join(clean))
                self.conn.commit()
            else:
                raise

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self) -> None:
        """Close the database connection."""
        if self.conn:
            try:
                self.conn.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # FTS helpers
    # ------------------------------------------------------------------

    def _has_fts(self) -> bool:
        """Check whether the FTS5 virtual table exists."""
        try:
            self.conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='entries_fts'"
            )
            row = self.conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='entries_fts'"
            ).fetchone()
            return row is not None
        except Exception:
            return False

    def _rebuild_fts(self) -> None:
        """Rebuild the FTS index from the entries table."""
        if not self._has_fts():
            return
        try:
            self.conn.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
            self.conn.commit()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    @staticmethod
    def _rows_to_dicts(rows) -> list[dict]:
        """Convert sqlite3.Row objects to plain dicts."""
        return [dict(r) for r in rows]

    def search(self, query: str, field: str = "all", limit: int = 100) -> list[dict]:
        """Search entries by field or across all indexed fields.

        Parameters
        ----------
        query : str
            The search term.
        field : str
            One of ``email``, ``username``, ``phone``, ``ip``, ``name``, ``source``,
            or ``all`` (default) which searches across multiple fields.
        limit : int
            Maximum number of results to return.
        """
        query = query.strip()
        if not query:
            return []

        if field != "all":
            # Single-field search with LIKE
            allowed = {"email", "username", "phone", "ip", "name", "source", "password", "hash"}
            if field not in allowed:
                error(f"Unknown field: {field}")
                return []
            sql = f"SELECT * FROM entries WHERE {field} LIKE ? LIMIT ?"
            rows = self.conn.execute(sql, (f"%{query}%", limit)).fetchall()
            return self._rows_to_dicts(rows)

        # All-field search — try FTS5 first
        if self._has_fts():
            try:
                fts_query = '"' + query.replace('"', '""') + '"'
                sql = (
                    "SELECT e.* FROM entries e "
                    "JOIN entries_fts f ON e.id = f.rowid "
                    "WHERE entries_fts MATCH ? LIMIT ?"
                )
                rows = self.conn.execute(sql, (fts_query, limit)).fetchall()
                return self._rows_to_dicts(rows)
            except Exception:
                pass  # fall through to LIKE

        # LIKE fallback for all-field search
        like = f"%{query}%"
        sql = (
            "SELECT * FROM entries WHERE "
            "email LIKE ? OR username LIKE ? OR phone LIKE ? "
            "OR ip LIKE ? OR name LIKE ? LIMIT ?"
        )
        rows = self.conn.execute(sql, (like, like, like, like, like, limit)).fetchall()
        return self._rows_to_dicts(rows)

    def search_email(self, email: str, limit: int = 100) -> list[dict]:
        """Search by email — exact first, then wildcard."""
        email = email.strip()
        if not email:
            return []
        # Try exact match
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE email = ? LIMIT ?", (email, limit)
        ).fetchall()
        if rows:
            return self._rows_to_dicts(rows)
        # Wildcard
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE email LIKE ? LIMIT ?", (f"%{email}%", limit)
        ).fetchall()
        return self._rows_to_dicts(rows)

    def search_username(self, username: str, limit: int = 100) -> list[dict]:
        """Search by username."""
        username = username.strip()
        if not username:
            return []
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE username = ? LIMIT ?", (username, limit)
        ).fetchall()
        if rows:
            return self._rows_to_dicts(rows)
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE username LIKE ? LIMIT ?",
            (f"%{username}%", limit),
        ).fetchall()
        return self._rows_to_dicts(rows)

    def search_phone(self, phone: str, limit: int = 100) -> list[dict]:
        """Search by phone number (strips common separators before matching)."""
        phone = phone.strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        if not phone:
            return []
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', ''), ')', '') LIKE ? LIMIT ?",
            (f"%{phone}%", limit),
        ).fetchall()
        return self._rows_to_dicts(rows)

    def search_domain(self, domain: str, limit: int = 100) -> list[dict]:
        """Search for emails belonging to a domain."""
        domain = domain.strip().lower()
        if not domain:
            return []
        pattern = f"%@{domain}"
        rows = self.conn.execute(
            "SELECT * FROM entries WHERE LOWER(email) LIKE ? LIMIT ?",
            (pattern, limit),
        ).fetchall()
        return self._rows_to_dicts(rows)

    # ------------------------------------------------------------------
    # Insert
    # ------------------------------------------------------------------

    def insert_batch(self, entries: list[dict], source: str) -> int:
        """Bulk-insert a list of entry dicts.

        Parameters
        ----------
        entries : list[dict]
            Each dict may contain keys: email, username, password, hash,
            phone, ip, name.  Missing keys are stored as ``None``.
        source : str
            Name of the breach source / file for attribution.

        Returns
        -------
        int
            Number of rows inserted.
        """
        if not entries:
            return 0

        cols = ("email", "username", "password", "hash", "phone", "ip", "name", "source")
        insert_sql = (
            "INSERT INTO entries (email, username, password, hash, phone, ip, name, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )

        rows = []
        for entry in entries:
            row = tuple(entry.get(c) for c in cols[:-1]) + (source,)
            rows.append(row)

        cursor = self.conn.cursor()
        try:
            cursor.executemany(insert_sql, rows)
            count = cursor.rowcount
            self.conn.commit()
        except Exception as exc:
            self.conn.rollback()
            error(f"Batch insert failed: {exc}")
            return 0

        # Update source meta
        try:
            self.conn.execute(
                "INSERT INTO sources (name, entry_count) VALUES (?, ?) "
                "ON CONFLICT(name) DO UPDATE SET entry_count = entry_count + ?",
                (source, count, count),
            )
            self.conn.commit()
        except Exception:
            pass

        # Rebuild FTS if available
        self._rebuild_fts()

        return count

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------

    def get_stats(self) -> dict:
        """Return aggregate statistics about the database."""
        total_entries = self.conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        total_sources = self.conn.execute("SELECT COUNT(*) FROM sources").fetchone()[0]

        top_sources_rows = self.conn.execute(
            "SELECT source, COUNT(*) as cnt FROM entries "
            "GROUP BY source ORDER BY cnt DESC LIMIT 10"
        ).fetchall()
        top_sources = [{"name": r["source"], "count": r["cnt"]} for r in top_sources_rows]

        date_row = self.conn.execute(
            "SELECT MIN(added_at) as earliest, MAX(added_at) as latest FROM entries"
        ).fetchone()
        earliest = date_row["earliest"] if date_row else None
        latest = date_row["latest"] if date_row else None

        return {
            "total_entries": total_entries,
            "total_sources": total_sources,
            "top_sources": top_sources,
            "date_range": {"earliest": earliest, "latest": latest},
        }

    def get_sources(self) -> list[dict]:
        """Return all sources with their entry counts."""
        rows = self.conn.execute(
            "SELECT name, entry_count, imported_at FROM sources ORDER BY entry_count DESC"
        ).fetchall()
        return self._rows_to_dicts(rows)

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def deduplicate(self) -> int:
        """Remove exact duplicate rows (same email, username, password,
        hash, phone, ip, name, source), keeping the first occurrence.

        Returns
        -------
        int
            Number of rows removed.
        """
        before = self.conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        self.conn.execute(
            """
            DELETE FROM entries WHERE id NOT IN (
                SELECT MIN(id) FROM entries
                GROUP BY email, username, password, hash, phone, ip, name, source
            )
            """
        )
        self.conn.commit()
        after = self.conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        removed = before - after

        if removed > 0:
            self._rebuild_fts()

        return removed

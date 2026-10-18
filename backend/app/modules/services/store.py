import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.modules.services.seed import DEMO_CATEGORIES, DEMO_LISTINGS, DEMO_SUBCATEGORIES


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid4().hex


class ServiceStore:
    def __init__(self, path: str) -> None:
        self._lock = threading.Lock()
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False, timeout=5)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        if path != ":memory:":
            self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS service_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                active INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS service_subcategories (
                id TEXT PRIMARY KEY,
                category_id TEXT NOT NULL REFERENCES service_categories(id),
                name TEXT NOT NULL,
                response_hours INTEGER,
                completion_hours INTEGER,
                sla_note TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                active INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS service_listings (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                provider_name TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                subcategory_id TEXT NOT NULL REFERENCES service_subcategories(id),
                price_paise INTEGER,
                ward_id TEXT NOT NULL,
                area_text TEXT NOT NULL,
                contact_name TEXT NOT NULL,
                contact_phone TEXT NOT NULL,
                status TEXT NOT NULL,
                review_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS service_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS service_listings_provider ON service_listings(provider_id);
            CREATE INDEX IF NOT EXISTS service_listings_sub ON service_listings(subcategory_id);
            """
        )
        self._conn.commit()
        self._seed()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def _seed(self) -> None:
        with self._lock:
            flagged = self._conn.execute("SELECT value FROM service_meta WHERE key = 'demo_seeded'").fetchone()
            if flagged:
                return
        with self._tx() as conn:
            if conn.execute("SELECT value FROM service_meta WHERE key = 'demo_seeded'").fetchone():
                return
            for category in DEMO_CATEGORIES:
                conn.execute(
                    "INSERT OR IGNORE INTO service_categories (id, name, sort_order, active) VALUES (?, ?, ?, ?)",
                    (category["id"], category["name"], category["sort_order"], 1 if category["active"] else 0),
                )
            for item in DEMO_SUBCATEGORIES:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO service_subcategories (
                        id, category_id, name, response_hours, completion_hours, sla_note, sort_order, active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item["id"],
                        item["category_id"],
                        item["name"],
                        item["response_hours"],
                        item["completion_hours"],
                        item["sla_note"],
                        item["sort_order"],
                        1 if item["active"] else 0,
                    ),
                )
            now = _utc_now()
            for listing in DEMO_LISTINGS:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO service_listings (
                        id, provider_id, provider_name, title, details, subcategory_id, price_paise,
                        ward_id, area_text, contact_name, contact_phone, status, review_note, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                    """,
                    (
                        listing["id"],
                        listing["provider_id"],
                        listing["provider_name"],
                        listing["title"],
                        listing["details"],
                        listing["subcategory_id"],
                        listing["price_paise"],
                        listing["ward_id"],
                        listing["area_text"],
                        listing["contact_name"],
                        listing["contact_phone"],
                        listing["status"],
                        now,
                        now,
                    ),
                )
            conn.execute("INSERT INTO service_meta (key, value) VALUES ('demo_seeded', '1')")

    def list_categories(self, *, include_hidden: bool = False) -> list[dict]:
        sql = "SELECT * FROM service_categories"
        if not include_hidden:
            sql += " WHERE active = 1"
        sql += " ORDER BY sort_order, name"
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql).fetchall()]

    def get_category(self, category_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM service_categories WHERE id = ?", (category_id,)).fetchone()
        return dict(row) if row else None

    def insert_category(self, body: dict) -> dict:
        category_id = _new_id()
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO service_categories (id, name, sort_order, active) VALUES (?, ?, ?, ?)",
                (category_id, body["name"], body["sort_order"], 1 if body["active"] else 0),
            )
        return self.get_category(category_id) or {}

    def update_category(self, category_id: str, fields: dict) -> dict | None:
        if not fields:
            return self.get_category(category_id)
        assignments = []
        values: list[object] = []
        for key, value in fields.items():
            if key == "active":
                assignments.append("active = ?")
                values.append(1 if value else 0)
            else:
                assignments.append(f"{key} = ?")
                values.append(value)
        values.append(category_id)
        with self._tx() as conn:
            conn.execute(f"UPDATE service_categories SET {', '.join(assignments)} WHERE id = ?", values)
        return self.get_category(category_id)

    def category_listing_count(self, category_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT COUNT(*) AS total FROM service_listings l
                JOIN service_subcategories s ON s.id = l.subcategory_id
                WHERE s.category_id = ?
                """,
                (category_id,),
            ).fetchone()
        return int(row["total"])

    def list_subcategories(self, category_id: str | None = None, *, include_hidden: bool = False) -> list[dict]:
        clauses = ["1 = 1"]
        params: list[object] = []
        if category_id:
            clauses.append("s.category_id = ?")
            params.append(category_id)
        if not include_hidden:
            clauses.append("s.active = 1 AND c.active = 1")
        sql = f"""
            SELECT s.*, c.name AS category_name
            FROM service_subcategories s
            JOIN service_categories c ON c.id = s.category_id
            WHERE {' AND '.join(clauses)}
            ORDER BY c.sort_order, s.sort_order, s.name
        """
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def get_subcategory(self, subcategory_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT s.*, c.name AS category_name
                FROM service_subcategories s
                JOIN service_categories c ON c.id = s.category_id
                WHERE s.id = ?
                """,
                (subcategory_id,),
            ).fetchone()
        return dict(row) if row else None

    def insert_subcategory(self, body: dict) -> dict:
        item_id = _new_id()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO service_subcategories (
                    id, category_id, name, response_hours, completion_hours, sla_note, sort_order, active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    body["category_id"],
                    body["name"],
                    body.get("response_hours"),
                    body.get("completion_hours"),
                    body.get("sla_note") or "",
                    body["sort_order"],
                    1 if body["active"] else 0,
                ),
            )
        return self.get_subcategory(item_id) or {}

    def update_subcategory(self, subcategory_id: str, fields: dict) -> dict | None:
        if not fields:
            return self.get_subcategory(subcategory_id)
        assignments = []
        values: list[object] = []
        for key, value in fields.items():
            if key == "active":
                assignments.append("active = ?")
                values.append(1 if value else 0)
            else:
                assignments.append(f"{key} = ?")
                values.append(value)
        values.append(subcategory_id)
        with self._tx() as conn:
            conn.execute(f"UPDATE service_subcategories SET {', '.join(assignments)} WHERE id = ?", values)
        return self.get_subcategory(subcategory_id)

    def subcategory_listing_count(self, subcategory_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS total FROM service_listings WHERE subcategory_id = ?",
                (subcategory_id,),
            ).fetchone()
        return int(row["total"])

    def list_listings(
        self,
        *,
        status: str | None = None,
        provider_id: str | None = None,
        category_id: str | None = None,
        subcategory_id: str | None = None,
        ward_id: str | None = None,
        q: str | None = None,
    ) -> list[dict]:
        clauses = ["1 = 1"]
        params: list[object] = []
        if status:
            clauses.append("l.status = ?")
            params.append(status)
        if provider_id:
            clauses.append("l.provider_id = ?")
            params.append(provider_id)
        if category_id:
            clauses.append("c.id = ?")
            params.append(category_id)
        if subcategory_id:
            clauses.append("l.subcategory_id = ?")
            params.append(subcategory_id)
        if ward_id:
            clauses.append("l.ward_id = ?")
            params.append(ward_id)
        if q:
            clauses.append("(lower(l.title) LIKE ? OR lower(l.details) LIKE ? OR lower(l.provider_name) LIKE ?)")
            needle = f"%{q.lower()}%"
            params.extend([needle, needle, needle])
        sql = f"""
            SELECT l.*, s.name AS subcategory_name, s.category_id, s.response_hours, s.completion_hours,
                   s.sla_note, s.active AS subcategory_active, c.name AS category_name, c.active AS category_active
            FROM service_listings l
            JOIN service_subcategories s ON s.id = l.subcategory_id
            JOIN service_categories c ON c.id = s.category_id
            WHERE {' AND '.join(clauses)}
            ORDER BY l.created_at DESC
        """
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def get_listing(self, listing_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT l.*, s.name AS subcategory_name, s.category_id, s.response_hours, s.completion_hours,
                       s.sla_note, s.active AS subcategory_active, c.name AS category_name, c.active AS category_active
                FROM service_listings l
                JOIN service_subcategories s ON s.id = l.subcategory_id
                JOIN service_categories c ON c.id = s.category_id
                WHERE l.id = ?
                """,
                (listing_id,),
            ).fetchone()
        return dict(row) if row else None

    def insert_listing(self, body: dict) -> dict:
        listing_id = _new_id()
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO service_listings (
                    id, provider_id, provider_name, title, details, subcategory_id, price_paise,
                    ward_id, area_text, contact_name, contact_phone, status, review_note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    listing_id,
                    body["provider_id"],
                    body["provider_name"],
                    body["title"],
                    body["details"],
                    body["subcategory_id"],
                    body.get("price_paise"),
                    body["ward_id"],
                    body["area_text"],
                    body["contact_name"],
                    body["contact_phone"],
                    body["status"],
                    now,
                    now,
                ),
            )
        return self.get_listing(listing_id) or {}

    def update_listing(self, listing_id: str, fields: dict) -> dict | None:
        if not fields:
            return self.get_listing(listing_id)
        assignments = ["updated_at = ?"]
        values: list[object] = [_utc_now()]
        for key, value in fields.items():
            assignments.append(f"{key} = ?")
            values.append(value)
        values.append(listing_id)
        with self._tx() as conn:
            conn.execute(f"UPDATE service_listings SET {', '.join(assignments)} WHERE id = ?", values)
        return self.get_listing(listing_id)

    def delete_listing(self, listing_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute("DELETE FROM service_listings WHERE id = ?", (listing_id,))
            return cursor.rowcount > 0

    def status_counts(self) -> dict[str, int]:
        counts = {"pending": 0, "approved": 0, "rejected": 0, "disabled": 0}
        with self._lock:
            rows = self._conn.execute("SELECT status, COUNT(*) AS total FROM service_listings GROUP BY status").fetchall()
        for row in rows:
            counts[row["status"]] = int(row["total"])
        return counts

    def subcategory_counts(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT category_id, COUNT(*) AS total FROM service_subcategories GROUP BY category_id"
            ).fetchall()
        return {row["category_id"]: int(row["total"]) for row in rows}

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.modules.media.refs import dump_refs, load_refs

NewPhoto = tuple[str, bytes]
OPEN_ORDER_STATUSES = ("placed", "accepted")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid4().hex


def _listing(row: sqlite3.Row) -> dict:
    listing = dict(row)
    listing["media"] = load_refs(listing.get("media"))
    return listing


_LISTING_SELECT = """
    SELECT l.*,
        (SELECT id FROM market_photos p WHERE p.listing_id = l.id ORDER BY sort_order LIMIT 1) AS cover_id,
        (SELECT AVG(rating) FROM market_reviews r WHERE r.listing_id = l.id) AS rating_avg,
        (SELECT COUNT(*) FROM market_reviews r WHERE r.listing_id = l.id) AS review_count,
        (SELECT COUNT(*) FROM market_orders o WHERE o.listing_id = l.id AND o.status IN ('placed', 'accepted')) AS open_orders
    FROM market_listings l
"""


class MarketStore:
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
            CREATE TABLE IF NOT EXISTS market_listings (
                id TEXT PRIMARY KEY,
                seller_id TEXT NOT NULL,
                seller_name TEXT NOT NULL,
                ward_id TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                condition TEXT NOT NULL,
                price_paise INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                pickup_area TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS market_listings_seller ON market_listings(seller_id);
            CREATE TABLE IF NOT EXISTS market_photos (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL,
                mime TEXT NOT NULL,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS market_orders (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL REFERENCES market_listings(id),
                buyer_id TEXT NOT NULL,
                buyer_name TEXT NOT NULL,
                seller_id TEXT NOT NULL,
                seller_name TEXT NOT NULL,
                title TEXT NOT NULL,
                price_paise INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                note TEXT NOT NULL,
                seller_note TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS market_orders_buyer ON market_orders(buyer_id);
            CREATE INDEX IF NOT EXISTS market_orders_seller ON market_orders(seller_id);
            CREATE TABLE IF NOT EXISTS market_reviews (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL REFERENCES market_listings(id),
                seller_id TEXT NOT NULL,
                reviewer_id TEXT NOT NULL,
                reviewer_name TEXT NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (listing_id, reviewer_id)
            );
            CREATE TABLE IF NOT EXISTS market_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(market_listings)")}
        if "media" not in columns:
            self._conn.execute("ALTER TABLE market_listings ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
        self._conn.commit()

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

    def flag(self, key: str) -> bool:
        with self._lock:
            row = self._conn.execute("SELECT value FROM market_meta WHERE key = ?", (key,)).fetchone()
        return row is not None

    def set_flag(self, key: str) -> None:
        with self._tx() as conn:
            conn.execute("INSERT OR REPLACE INTO market_meta (key, value) VALUES (?, '1')", (key,))

    # Listings

    def insert_listing(self, listing: dict, photos: list[NewPhoto], listing_id: str | None = None) -> str:
        listing_id = listing_id or _new_id()
        now = listing.get("created_at") or _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO market_listings (
                    id, seller_id, seller_name, ward_id, title, description, category, condition,
                    price_paise, quantity, pickup_area, media, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                """,
                (
                    listing_id,
                    listing["seller_id"],
                    listing["seller_name"],
                    listing["ward_id"],
                    listing["title"],
                    listing["description"],
                    listing["category"],
                    listing["condition"],
                    listing["price_paise"],
                    listing["quantity"],
                    listing["pickup_area"],
                    dump_refs(listing.get("media")),
                    now,
                    now,
                ),
            )
            self._write_photos(conn, listing_id, list(photos))
        return listing_id

    def update_listing(self, listing_id: str, fields: dict, photos: list[str | NewPhoto] | None) -> None:
        if "media" in fields:
            fields = {**fields, "media": dump_refs(fields["media"])}
        with self._tx() as conn:
            if fields:
                columns = ", ".join(f"{name} = ?" for name in fields)
                conn.execute(
                    f"UPDATE market_listings SET {columns}, updated_at = ? WHERE id = ?",
                    (*fields.values(), _utc_now(), listing_id),
                )
            else:
                conn.execute("UPDATE market_listings SET updated_at = ? WHERE id = ?", (_utc_now(), listing_id))
            if photos is not None:
                keep = [photo for photo in photos if isinstance(photo, str)]
                marks = ",".join("?" for _ in keep) or "''"
                conn.execute(
                    f"DELETE FROM market_photos WHERE listing_id = ? AND id NOT IN ({marks})",
                    (listing_id, *keep),
                )
                self._write_photos(conn, listing_id, photos)

    def _write_photos(self, conn: sqlite3.Connection, listing_id: str, photos: list[str | NewPhoto]) -> None:
        for index, photo in enumerate(photos):
            if isinstance(photo, str):
                conn.execute("UPDATE market_photos SET sort_order = ? WHERE id = ? AND listing_id = ?", (index, photo, listing_id))
            else:
                mime, data = photo
                conn.execute(
                    "INSERT INTO market_photos (id, listing_id, sort_order, mime, data) VALUES (?, ?, ?, ?, ?)",
                    (_new_id(), listing_id, index, mime, data),
                )

    def get_listing(self, listing_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(f"{_LISTING_SELECT} WHERE l.id = ?", (listing_id,)).fetchone()
            if row is None:
                return None
            photos = self._conn.execute(
                "SELECT id FROM market_photos WHERE listing_id = ? ORDER BY sort_order", (listing_id,)
            ).fetchall()
        listing = _listing(row)
        listing["photo_ids"] = [photo["id"] for photo in photos]
        return listing

    def list_listings(self, seller_id: str | None = None) -> list[dict]:
        clauses = ["l.status != 'removed'"]
        params: list[str] = []
        if seller_id is not None:
            clauses.append("l.seller_id = ?")
            params.append(seller_id)
        sql = f"{_LISTING_SELECT} WHERE {' AND '.join(clauses)} ORDER BY l.created_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [_listing(row) for row in rows]

    def photo(self, photo_id: str) -> tuple[str, bytes] | None:
        with self._lock:
            row = self._conn.execute("SELECT mime, data FROM market_photos WHERE id = ?", (photo_id,)).fetchone()
        return (row["mime"], bytes(row["data"])) if row else None

    # Orders

    def insert_order(self, listing: dict, buyer_id: str, buyer_name: str, quantity: int, note: str) -> str | None:
        order_id = _new_id()
        now = _utc_now()
        with self._tx() as conn:
            taken = conn.execute(
                """
                UPDATE market_listings SET quantity = quantity - ?, updated_at = ?
                WHERE id = ? AND status = 'active' AND quantity >= ?
                """,
                (quantity, now, listing["id"], quantity),
            )
            if taken.rowcount == 0:
                return None
            conn.execute(
                """
                INSERT INTO market_orders (
                    id, listing_id, buyer_id, buyer_name, seller_id, seller_name, title, price_paise,
                    quantity, note, seller_note, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'placed', ?, ?)
                """,
                (
                    order_id,
                    listing["id"],
                    buyer_id,
                    buyer_name,
                    listing["seller_id"],
                    listing["seller_name"],
                    listing["title"],
                    listing["price_paise"],
                    quantity,
                    note,
                    now,
                    now,
                ),
            )
        return order_id

    def get_order(self, order_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM market_orders WHERE id = ?", (order_id,)).fetchone()
        return dict(row) if row else None

    def list_orders(self, buyer_id: str | None = None, seller_id: str | None = None) -> list[dict]:
        column, value = ("buyer_id", buyer_id) if buyer_id is not None else ("seller_id", seller_id)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT o.*,
                    (SELECT id FROM market_photos p WHERE p.listing_id = o.listing_id ORDER BY sort_order LIMIT 1) AS cover_id,
                    (SELECT media FROM market_listings l WHERE l.id = o.listing_id) AS media,
                    EXISTS (
                        SELECT 1 FROM market_reviews r WHERE r.listing_id = o.listing_id AND r.reviewer_id = o.buyer_id
                    ) AS reviewed
                FROM market_orders o WHERE o.{column} = ? ORDER BY o.created_at DESC
                """,
                (value,),
            ).fetchall()
        return [_listing(row) for row in rows]

    def set_order_status(self, order: dict, status: str, seller_note: str | None, restock: bool) -> bool:
        with self._tx() as conn:
            marks = ",".join("?" for _ in OPEN_ORDER_STATUSES)
            changed = conn.execute(
                f"""
                UPDATE market_orders SET status = ?, seller_note = COALESCE(?, seller_note), updated_at = ?
                WHERE id = ? AND status IN ({marks})
                """,
                (status, seller_note, _utc_now(), order["id"], *OPEN_ORDER_STATUSES),
            )
            if changed.rowcount == 0:
                return False
            if restock:
                conn.execute(
                    "UPDATE market_listings SET quantity = quantity + ? WHERE id = ?",
                    (order["quantity"], order["listing_id"]),
                )
        return True

    def open_order_id(self, listing_id: str, buyer_id: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT id FROM market_orders WHERE listing_id = ? AND buyer_id = ? AND status IN ('placed', 'accepted')",
                (listing_id, buyer_id),
            ).fetchone()
        return row["id"] if row else None

    def has_completed_order(self, listing_id: str, buyer_id: str) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM market_orders WHERE listing_id = ? AND buyer_id = ? AND status = 'completed'",
                (listing_id, buyer_id),
            ).fetchone()
        return row is not None

    # Reviews

    def reviews(self, listing_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM market_reviews WHERE listing_id = ? ORDER BY updated_at DESC", (listing_id,)
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_review(self, listing: dict, reviewer_id: str, reviewer_name: str, rating: int, comment: str) -> None:
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO market_reviews (
                    id, listing_id, seller_id, reviewer_id, reviewer_name, rating, comment, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (listing_id, reviewer_id)
                DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at
                """,
                (_new_id(), listing["id"], listing["seller_id"], reviewer_id, reviewer_name, rating, comment, now, now),
            )

    def delete_review(self, listing_id: str, reviewer_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "DELETE FROM market_reviews WHERE listing_id = ? AND reviewer_id = ?", (listing_id, reviewer_id)
            )
            return cursor.rowcount > 0

    def seller_stats(self, seller_id: str) -> dict:
        with self._lock:
            reviews = self._conn.execute(
                "SELECT AVG(rating) AS avg, COUNT(*) AS total FROM market_reviews WHERE seller_id = ?", (seller_id,)
            ).fetchone()
            active = self._conn.execute(
                "SELECT COUNT(*) AS total FROM market_listings WHERE seller_id = ? AND status = 'active' AND quantity > 0",
                (seller_id,),
            ).fetchone()
            sales = self._conn.execute(
                "SELECT COUNT(*) AS total FROM market_orders WHERE seller_id = ? AND status = 'completed'", (seller_id,)
            ).fetchone()
        return {
            "rating_avg": reviews["avg"],
            "review_count": reviews["total"],
            "active_listings": active["total"],
            "completed_sales": sales["total"],
        }

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.modules.media.refs import dump_refs, load_refs
from app.modules.civic.seed import CITY_CENTER, WARD_GEO
from app.modules.property.seed import CITY_SELLER, DEMO_PROPERTIES

_PROPERTY_FIELDS = (
    "title",
    "property_type",
    "ward_id",
    "address_text",
    "area_sqft",
    "bedrooms",
    "price_paise",
    "description",
    "contact_phone",
    "lister_role",
    "lister_name",
    "agency_name",
    "owner_name",
    "commission_pct",
    "latitude",
    "longitude",
    "image",
    "media",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _column_values(body: dict) -> tuple:
    return tuple(dump_refs(body.get("media")) if field == "media" else body[field] for field in _PROPERTY_FIELDS)


class PropertyStore:
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
            CREATE TABLE IF NOT EXISTS properties (
                id TEXT PRIMARY KEY,
                seller_id TEXT NOT NULL,
                title TEXT NOT NULL,
                property_type TEXT NOT NULL,
                ward_id TEXT NOT NULL,
                address_text TEXT NOT NULL,
                area_sqft INTEGER NOT NULL,
                bedrooms INTEGER,
                price_paise INTEGER NOT NULL,
                description TEXT NOT NULL,
                contact_phone TEXT NOT NULL,
                lister_role TEXT NOT NULL,
                lister_name TEXT NOT NULL,
                agency_name TEXT,
                owner_name TEXT,
                commission_pct REAL,
                latitude REAL,
                longitude REAL,
                image TEXT,
                status TEXT NOT NULL,
                review_note TEXT,
                sold_price_paise INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS property_offers (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                buyer_id TEXT NOT NULL,
                buyer_name TEXT NOT NULL,
                buyer_phone TEXT NOT NULL,
                amount_paise INTEGER NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL,
                seller_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_offers_property ON property_offers(property_id);
            CREATE INDEX IF NOT EXISTS idx_offers_buyer ON property_offers(buyer_id);
            CREATE TABLE IF NOT EXISTS brokers (
                user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                agency_name TEXT NOT NULL,
                license_no TEXT NOT NULL,
                phone TEXT NOT NULL,
                about TEXT NOT NULL,
                status TEXT NOT NULL,
                review_note TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS seeded (
                id TEXT PRIMARY KEY
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(properties)")}
        if "media" not in columns:
            self._conn.execute("ALTER TABLE properties ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
        if "latitude" not in columns:
            self._conn.execute("ALTER TABLE properties ADD COLUMN latitude REAL")
            self._conn.execute("ALTER TABLE properties ADD COLUMN longitude REAL")
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
        with self._tx() as conn:
            for demo in DEMO_PROPERTIES:
                done = conn.execute("SELECT 1 FROM seeded WHERE id = ?", (demo["id"],)).fetchone()
                if done is not None:
                    continue
                self._insert(conn, demo["id"], CITY_SELLER, {**demo, "agency_name": None, "image": demo.get("image")}, "approved")
                conn.execute("INSERT INTO seeded (id) VALUES (?)", (demo["id"],))
            for demo in DEMO_PROPERTIES:
                photo = demo.get("image")
                if photo:
                    conn.execute(
                        "UPDATE properties SET image = ? WHERE id = ? AND (image IS NULL OR image = '')",
                        (photo, demo["id"]),
                    )
                if demo.get("latitude") is not None:
                    conn.execute(
                        """
                        UPDATE properties SET latitude = ?, longitude = ?
                        WHERE id = ? AND (latitude IS NULL OR longitude IS NULL)
                        """,
                        (demo["latitude"], demo["longitude"], demo["id"]),
                    )

    def _insert(self, conn: sqlite3.Connection, property_id: str, seller_id: str, body: dict, status: str) -> None:
        now = _utc_now()
        conn.execute(
            f"""
            INSERT INTO properties (id, seller_id, {", ".join(_PROPERTY_FIELDS)}, status, created_at, updated_at)
            VALUES (?, ?, {", ".join("?" for _ in _PROPERTY_FIELDS)}, ?, ?, ?)
            """,
            (property_id, seller_id, *_column_values(body), status, now, now),
        )

    def insert(self, seller_id: str, body: dict, status: str) -> str:
        property_id = str(uuid4())
        with self._tx() as conn:
            self._insert(conn, property_id, seller_id, body, status)
        return property_id

    def update(self, property_id: str, body: dict, status: str) -> None:
        assignments = ", ".join(f"{field} = ?" for field in _PROPERTY_FIELDS)
        with self._tx() as conn:
            conn.execute(
                f"UPDATE properties SET {assignments}, status = ?, review_note = NULL, updated_at = ? WHERE id = ?",
                (*_column_values(body), status, _utc_now(), property_id),
            )

    def get(self, property_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM properties WHERE id = ?", (property_id,)).fetchone()
            return self._pack(row) if row else None

    def list_rows(self, *, statuses: tuple[str, ...] | None = None, seller_id: str | None = None) -> list[dict]:
        clauses = ["1 = 1"]
        params: list[str] = []
        if statuses is not None:
            clauses.append(f"status IN ({', '.join('?' for _ in statuses)})")
            params.extend(statuses)
        if seller_id is not None:
            clauses.append("seller_id = ?")
            params.append(seller_id)
        sql = f"SELECT * FROM properties WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
            return [self._pack(row) for row in rows]

    def set_status(self, property_id: str, status: str, note: str | None = None, *, keep_note: bool = False) -> None:
        with self._tx() as conn:
            if keep_note:
                conn.execute(
                    "UPDATE properties SET status = ?, updated_at = ? WHERE id = ?",
                    (status, _utc_now(), property_id),
                )
            else:
                conn.execute(
                    "UPDATE properties SET status = ?, review_note = ?, updated_at = ? WHERE id = ?",
                    (status, note, _utc_now(), property_id),
                )

    def delete(self, property_id: str) -> None:
        with self._tx() as conn:
            conn.execute("DELETE FROM properties WHERE id = ?", (property_id,))

    def status_counts(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute("SELECT status, COUNT(*) AS total FROM properties GROUP BY status").fetchall()
        return {row["status"]: int(row["total"]) for row in rows}

    def insert_offer(self, property_id: str, buyer_id: str, buyer_name: str, phone: str, amount: int, message: str) -> str:
        offer_id = str(uuid4())
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO property_offers (
                    id, property_id, buyer_id, buyer_name, buyer_phone, amount_paise, message, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (offer_id, property_id, buyer_id, buyer_name, phone, amount, message, now, now),
            )
        return offer_id

    def get_offer(self, offer_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM property_offers WHERE id = ?", (offer_id,)).fetchone()
        return dict(row) if row else None

    def offers_for(self, property_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM property_offers WHERE property_id = ? ORDER BY created_at DESC",
                (property_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def offers_by(self, buyer_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM property_offers WHERE buyer_id = ? ORDER BY created_at DESC",
                (buyer_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def set_offer_status(self, offer_id: str, status: str, note: str | None = None) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE property_offers SET status = ?, seller_note = COALESCE(?, seller_note), updated_at = ? WHERE id = ?",
                (status, note, _utc_now(), offer_id),
            )

    def accept_offer(self, property_id: str, offer_id: str, note: str | None) -> None:
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                "UPDATE property_offers SET status = 'accepted', seller_note = ?, updated_at = ? WHERE id = ?",
                (note, now, offer_id),
            )
            conn.execute("UPDATE properties SET status = 'under_offer', updated_at = ? WHERE id = ?", (now, property_id))

    def release_offer(self, property_id: str, offer_id: str, offer_status: str) -> None:
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                "UPDATE property_offers SET status = ?, updated_at = ? WHERE id = ?",
                (offer_status, now, offer_id),
            )
            conn.execute("UPDATE properties SET status = 'approved', updated_at = ? WHERE id = ?", (now, property_id))

    def complete_sale(self, property_id: str, offer_id: str | None, sold_price: int) -> None:
        now = _utc_now()
        with self._tx() as conn:
            if offer_id is not None:
                conn.execute(
                    "UPDATE property_offers SET status = 'completed', updated_at = ? WHERE id = ?",
                    (now, offer_id),
                )
            conn.execute(
                """
                UPDATE property_offers SET status = 'declined', seller_note = 'The property has been sold.', updated_at = ?
                WHERE property_id = ? AND status = 'pending'
                """,
                (now, property_id),
            )
            conn.execute(
                "UPDATE properties SET status = 'sold', sold_price_paise = ?, updated_at = ? WHERE id = ?",
                (sold_price, now, property_id),
            )

    def close_open_offers(self, property_id: str, note: str) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                UPDATE property_offers SET status = 'declined', seller_note = ?, updated_at = ?
                WHERE property_id = ? AND status IN ('pending', 'accepted')
                """,
                (note, _utc_now(), property_id),
            )

    def get_broker(self, user_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM brokers WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def list_brokers(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM brokers ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]

    def upsert_broker(self, user_id: str, display_name: str, body: dict) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO brokers (user_id, display_name, agency_name, license_no, phone, about, status, review_note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    agency_name = excluded.agency_name,
                    license_no = excluded.license_no,
                    phone = excluded.phone,
                    about = excluded.about,
                    status = 'pending',
                    review_note = NULL
                """,
                (user_id, display_name, body["agency_name"], body["license_no"], body["phone"], body["about"], _utc_now()),
            )

    def set_broker_status(self, user_id: str, status: str, note: str | None) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE brokers SET status = ?, review_note = ? WHERE user_id = ?", (status, note, user_id))

    def _pack(self, row: sqlite3.Row) -> dict:
        packed = dict(row)
        packed["media"] = load_refs(row["media"])
        geo = WARD_GEO.get(row["ward_id"], CITY_CENTER)
        packed["latitude"] = float(row["latitude"] if row["latitude"] is not None else geo["latitude"])
        packed["longitude"] = float(row["longitude"] if row["longitude"] is not None else geo["longitude"])
        offers = self._conn.execute(
            "SELECT COUNT(*) AS total FROM property_offers WHERE property_id = ? AND status IN ('pending', 'accepted')",
            (row["id"],),
        ).fetchone()
        packed["offer_count"] = int(offers["total"])
        return packed

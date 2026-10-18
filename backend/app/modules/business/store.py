import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator
from datetime import datetime, timezone
from uuid import uuid4

from app.modules.business.seed import DEMO_SHOPS
from app.modules.media.refs import dump_refs, load_refs


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BusinessStore:
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
            CREATE TABLE IF NOT EXISTS businesses (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                ward_id TEXT NOT NULL,
                address_text TEXT NOT NULL,
                phone TEXT,
                opening_hours TEXT NOT NULL,
                about TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS catalog_items (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price_paise INTEGER NOT NULL,
                is_available INTEGER NOT NULL,
                sort_order INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS service_offerings (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price_paise INTEGER,
                duration_minutes INTEGER,
                is_available INTEGER NOT NULL,
                sort_order INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS hidden_shops (
                slug TEXT PRIMARY KEY
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(businesses)")}
        if "status" not in columns:
            self._conn.execute("ALTER TABLE businesses ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'")
        if "review_note" not in columns:
            self._conn.execute("ALTER TABLE businesses ADD COLUMN review_note TEXT")
        if "media" not in columns:
            self._conn.execute("ALTER TABLE businesses ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
        item_columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(catalog_items)")}
        if "image" not in item_columns:
            self._conn.execute("ALTER TABLE catalog_items ADD COLUMN image TEXT")
        if "media" not in item_columns:
            self._conn.execute("ALTER TABLE catalog_items ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
        for shop in DEMO_SHOPS:
            for item in shop.get("catalog", []):
                photo = item.get("image")
                if photo:
                    self._conn.execute(
                        "UPDATE catalog_items SET image = ? WHERE id = ? AND (image IS NULL OR image = '')",
                        (photo, item["id"]),
                    )
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

    def slugs(self) -> set[str]:
        with self._lock:
            rows = self._conn.execute("SELECT slug FROM businesses").fetchall()
        return {row["slug"] for row in rows}

    def hidden_slugs(self) -> set[str]:
        with self._lock:
            rows = self._conn.execute("SELECT slug FROM hidden_shops").fetchall()
        return {row["slug"] for row in rows}

    def hide(self, slug: str) -> None:
        with self._tx() as conn:
            conn.execute("INSERT OR IGNORE INTO hidden_shops (slug) VALUES (?)", (slug,))

    def delete_business(self, business_id: str) -> None:
        with self._tx() as conn:
            conn.execute("DELETE FROM businesses WHERE id = ?", (business_id,))

    def copy_shop(self, shop: dict, owner_id: str) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO businesses (
                    id, owner_id, slug, name, category, ward_id, address_text, phone,
                    opening_hours, about, latitude, longitude, created_at, media
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    shop["id"],
                    owner_id,
                    shop["slug"],
                    shop["name"],
                    shop["category"],
                    shop["ward_id"],
                    shop["address_text"],
                    shop["phone"],
                    shop["opening_hours"],
                    shop["about"],
                    shop["latitude"],
                    shop["longitude"],
                    _utc_now(),
                    dump_refs(shop.get("media")),
                ),
            )
            for index, item in enumerate(shop["catalog"]):
                self._insert_item(conn, shop["id"], item, index, item_id=item["id"])
            for index, service in enumerate(shop.get("services", [])):
                conn.execute(
                    """
                    INSERT INTO service_offerings (
                        id, business_id, name, description, price_paise, duration_minutes, is_available, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        service["id"],
                        shop["id"],
                        service["name"],
                        service["description"],
                        service["price_paise"],
                        service["duration_minutes"],
                        1 if service["is_available"] else 0,
                        index,
                    ),
                )

    def set_status(self, business_id: str, status: str, note: str | None) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE businesses SET status = ?, review_note = ? WHERE id = ?",
                (status, note, business_id),
            )

    def set_item_available(self, business_id: str, item_id: str, available: bool) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "UPDATE catalog_items SET is_available = ? WHERE id = ? AND business_id = ?",
                (1 if available else 0, item_id, business_id),
            )
            return cursor.rowcount > 0

    def set_service_available(self, business_id: str, service_id: str, available: bool) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "UPDATE service_offerings SET is_available = ? WHERE id = ? AND business_id = ?",
                (1 if available else 0, service_id, business_id),
            )
            return cursor.rowcount > 0

    def insert(
        self,
        owner_id: str,
        slug: str,
        name: str,
        category: str,
        ward_id: str,
        address_text: str,
        phone: str | None,
        opening_hours: str,
        about: str,
        latitude: float,
        longitude: float,
        catalog: list[dict],
        services: list[dict],
        status: str = "approved",
        media: list[dict] | None = None,
    ) -> str:
        business_id = str(uuid4())
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO businesses (
                    id, owner_id, slug, name, category, ward_id, address_text, phone,
                    opening_hours, about, latitude, longitude, created_at, status, media
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    business_id,
                    owner_id,
                    slug,
                    name,
                    category,
                    ward_id,
                    address_text,
                    phone,
                    opening_hours,
                    about,
                    latitude,
                    longitude,
                    _utc_now(),
                    status,
                    dump_refs(media),
                ),
            )
            for index, item in enumerate(catalog):
                self._insert_item(conn, business_id, item, index)
            for index, service in enumerate(services):
                self._insert_service(conn, business_id, service, index)
        return business_id

    def _insert_item(
        self, conn: sqlite3.Connection, business_id: str, item: dict, sort_order: int, item_id: str | None = None
    ) -> None:
        conn.execute(
            """
            INSERT INTO catalog_items (id, business_id, name, description, price_paise, is_available, sort_order, image, media)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id or str(uuid4()),
                business_id,
                item["name"],
                item["description"],
                item["price_paise"],
                1 if item["is_available"] else 0,
                sort_order,
                item.get("image"),
                dump_refs(item.get("media")),
            ),
        )

    def _insert_service(self, conn: sqlite3.Connection, business_id: str, service: dict, sort_order: int) -> None:
        conn.execute(
            """
            INSERT INTO service_offerings (
                id, business_id, name, description, price_paise, duration_minutes, is_available, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                business_id,
                service["name"],
                service["description"],
                service["price_paise"],
                service["duration_minutes"],
                1 if service["is_available"] else 0,
                sort_order,
            ),
        )

    def add_service(self, business_id: str, service: dict) -> None:
        with self._tx() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) AS last FROM service_offerings WHERE business_id = ?",
                (business_id,),
            ).fetchone()
            self._insert_service(conn, business_id, service, row["last"] + 1)

    def delete_service(self, business_id: str, service_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "DELETE FROM service_offerings WHERE id = ? AND business_id = ?",
                (service_id, business_id),
            )
            return cursor.rowcount > 0

    def count_services(self, business_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS total FROM service_offerings WHERE business_id = ?",
                (business_id,),
            ).fetchone()
        return int(row["total"])

    def set_media(self, business_id: str, media: list[dict]) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE businesses SET media = ? WHERE id = ?", (dump_refs(media), business_id))

    def add_item(self, business_id: str, item: dict) -> None:
        with self._tx() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) AS last FROM catalog_items WHERE business_id = ?",
                (business_id,),
            ).fetchone()
            self._insert_item(conn, business_id, item, row["last"] + 1)

    def delete_item(self, business_id: str, item_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "DELETE FROM catalog_items WHERE id = ? AND business_id = ?",
                (item_id, business_id),
            )
            return cursor.rowcount > 0

    def count_items(self, business_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS total FROM catalog_items WHERE business_id = ?",
                (business_id,),
            ).fetchone()
        return int(row["total"])

    def get_by_slug(self, slug: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM businesses WHERE slug = ?", (slug,)).fetchone()
            if row is None:
                return None
            return self._pack(row)

    def list_rows(self, ward_id: str | None = None, owner_id: str | None = None) -> list[dict]:
        clauses = ["1 = 1"]
        params: list[str] = []
        if ward_id is not None:
            clauses.append("ward_id = ?")
            params.append(ward_id)
        if owner_id is not None:
            clauses.append("owner_id = ?")
            params.append(owner_id)
        sql = f"SELECT * FROM businesses WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
            return [self._pack(row) for row in rows]

    def _pack(self, row: sqlite3.Row) -> dict:
        items = self._conn.execute(
            """
            SELECT id, name, description, price_paise, is_available, image, media
            FROM catalog_items
            WHERE business_id = ?
            ORDER BY sort_order, name
            """,
            (row["id"],),
        ).fetchall()
        services = self._conn.execute(
            """
            SELECT id, name, description, price_paise, duration_minutes, is_available
            FROM service_offerings
            WHERE business_id = ?
            ORDER BY sort_order, name
            """,
            (row["id"],),
        ).fetchall()
        return {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "slug": row["slug"],
            "name": row["name"],
            "category": row["category"],
            "ward_id": row["ward_id"],
            "address_text": row["address_text"],
            "phone": row["phone"],
            "opening_hours": row["opening_hours"],
            "about": row["about"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "status": row["status"],
            "review_note": row["review_note"],
            "created_at": row["created_at"],
            "media": load_refs(row["media"]),
            "catalog": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "description": item["description"],
                    "price_paise": item["price_paise"],
                    "is_available": bool(item["is_available"]),
                    "image": item["image"],
                    "media": load_refs(item["media"]),
                }
                for item in items
            ],
            "services": [
                {
                    "id": service["id"],
                    "name": service["name"],
                    "description": service["description"],
                    "price_paise": service["price_paise"],
                    "duration_minutes": service["duration_minutes"],
                    "is_available": bool(service["is_available"]),
                }
                for service in services
            ],
        }

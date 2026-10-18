import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.civic.seed import FACILITIES, PARKING, WARD_GEO, WARDS

_WARD_FIELDS = ("name", "code", "latitude", "longitude", "active")
_FACILITY_FIELDS = ("ward_id", "kind", "name", "address_text", "opening_hours", "phone", "latitude", "longitude")
_LOT_FIELDS = (
    "ward_id",
    "name",
    "address_text",
    "capacity",
    "spaces_free",
    "price_paise_per_hour",
    "is_open",
    "latitude",
    "longitude",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _invalid(field: str, message: str, status: int = 422, code: str = "validation_error") -> ApiError:
    return ApiError(status, code, message, [{"field": field, "message": message}])


class DirectoryStore:
    """Wards, facilities, and parking lots. The seed catalog is copied in once, then admins own the rows."""

    def __init__(self, path: str) -> None:
        self._lock = threading.Lock()
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False, timeout=5)
        self._conn.row_factory = sqlite3.Row
        if path != ":memory:":
            self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS wards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS facilities (
                id TEXT PRIMARY KEY,
                ward_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                address_text TEXT NOT NULL,
                opening_hours TEXT NOT NULL,
                phone TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS parking_lots (
                id TEXT PRIMARY KEY,
                ward_id TEXT NOT NULL,
                name TEXT NOT NULL,
                address_text TEXT NOT NULL,
                capacity INTEGER NOT NULL,
                spaces_free INTEGER NOT NULL,
                price_paise_per_hour INTEGER NOT NULL,
                is_open INTEGER NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS directory_meta (key TEXT PRIMARY KEY);
            """
        )
        self._conn.commit()
        self._seed()

    def _seed(self) -> None:
        with self._tx() as conn:
            if conn.execute("SELECT 1 FROM directory_meta WHERE key = 'seeded'").fetchone():
                return
            stamp = _now()
            for position, ward in enumerate(WARDS):
                geo = WARD_GEO[ward["id"]]
                conn.execute(
                    "INSERT OR IGNORE INTO wards VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                    (ward["id"], ward["name"], ward["code"], geo["latitude"], geo["longitude"], position, stamp),
                )
            for place in FACILITIES:
                conn.execute(
                    "INSERT OR IGNORE INTO facilities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (place["id"], *(place[field] for field in _FACILITY_FIELDS)),
                )
            status = {}
            if conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'parking_status'").fetchone():
                status = {row["lot_id"]: row for row in conn.execute("SELECT * FROM parking_status").fetchall()}
            for lot in PARKING:
                saved = status.get(lot["id"])
                row = {
                    **lot,
                    "spaces_free": saved["spaces_free"] if saved else lot["spaces_free"],
                    "is_open": int(saved["is_open"]) if saved else int(lot["is_open"]),
                }
                conn.execute(
                    "INSERT OR IGNORE INTO parking_lots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (row["id"], *(row[field] for field in _LOT_FIELDS)),
                )
            conn.execute("INSERT INTO directory_meta (key) VALUES ('seeded')")

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

    def rows(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def insert(self, table: str, row: dict) -> None:
        columns = ", ".join(row)
        marks = ", ".join(f":{key}" for key in row)
        with self._tx() as conn:
            conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", row)

    def update(self, table: str, row_id: str, changes: dict) -> None:
        if not changes:
            return
        assignments = ", ".join(f"{key} = :{key}" for key in changes)
        with self._tx() as conn:
            conn.execute(f"UPDATE {table} SET {assignments} WHERE id = :id", {**changes, "id": row_id})

    def delete(self, table: str, row_id: str) -> None:
        with self._tx() as conn:
            conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))


def _ward(row: dict) -> dict:
    return {**row, "active": bool(row["active"])}


def _lot(row: dict) -> dict:
    return {**row, "is_open": bool(row["is_open"])}


class Directory:
    def __init__(self) -> None:
        self._store: DirectoryStore | None = None

    @property
    def store(self) -> DirectoryStore:
        if self._store is None:
            self._store = DirectoryStore(settings.civic_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = DirectoryStore(path)

    # Wards

    def wards(self, include_hidden: bool = False) -> list[dict]:
        rows = [_ward(row) for row in self.store.rows("SELECT * FROM wards ORDER BY position, name")]
        return rows if include_hidden else [row for row in rows if row["active"]]

    def find_ward(self, ward_id: str | None) -> dict | None:
        if not ward_id:
            return None
        rows = self.store.rows("SELECT * FROM wards WHERE id = ?", (ward_id,))
        return _ward(rows[0]) if rows else None

    def ward(self, ward_id: str, *, include_hidden: bool = False) -> dict:
        row = self.find_ward(ward_id)
        if row is None or (not row["active"] and not include_hidden):
            raise ApiError(404, "not_found", "Ward not found.")
        return row

    def ward_name(self, ward_id: str | None, fallback: str | None = None) -> str | None:
        row = self.find_ward(ward_id)
        return row["name"] if row else fallback

    def is_open_ward(self, ward_id: str | None) -> bool:
        row = self.find_ward(ward_id)
        return bool(row and row["active"])

    def create_ward(self, data: dict) -> dict:
        self._check_ward(data["name"], data["code"])
        position = len(self.store.rows("SELECT id FROM wards"))
        row = {"id": str(uuid4()), **data, "active": 1, "position": position, "created_at": _now()}
        self.store.insert("wards", row)
        return self.ward(row["id"])

    def update_ward(self, ward_id: str, changes: dict) -> dict:
        current = self.ward(ward_id, include_hidden=True)
        changes = {key: value for key, value in changes.items() if key in _WARD_FIELDS and value is not None}
        self._check_ward(changes.get("name"), changes.get("code"), ward_id)
        if changes.get("active") is False and current["active"] and len(self.wards()) <= 1:
            raise _invalid("active", "Keep at least one ward open to residents.", 409, "last_ward")
        if "active" in changes:
            changes["active"] = 1 if changes["active"] else 0
        self.store.update("wards", ward_id, changes)
        return self.ward(ward_id, include_hidden=True)

    def delete_ward(self, ward_id: str, in_use: int) -> dict:
        row = self.ward(ward_id, include_hidden=True)
        places = len(self.facilities(ward_id)) + len(self.lots(ward_id))
        if places or in_use:
            message = "This ward still has places, shops, or residents. Hide it instead, or move them first."
            raise ApiError(409, "ward_in_use", message)
        if row["active"] and len(self.wards()) <= 1:
            raise ApiError(409, "last_ward", "Keep at least one ward open to residents.")
        self.store.delete("wards", ward_id)
        return row

    def _check_ward(self, name: str | None, code: str | None, ward_id: str | None = None) -> None:
        for other in self.wards(include_hidden=True):
            if other["id"] == ward_id:
                continue
            if name and other["name"].casefold() == name.casefold():
                raise _invalid("name", f"{other['name']} already exists.", 409, "duplicate")
            if code and other["code"].casefold() == code.casefold():
                raise _invalid("code", f"Code {other['code']} is used by {other['name']}.", 409, "duplicate")

    def _check_place_ward(self, ward_id: str) -> None:
        if self.find_ward(ward_id) is None:
            raise _invalid("ward_id", "Choose a ward from the list.")

    # Facilities

    def facilities(self, ward_id: str | None = None) -> list[dict]:
        if ward_id:
            return self.store.rows("SELECT * FROM facilities WHERE ward_id = ? ORDER BY name", (ward_id,))
        return self.store.rows("SELECT * FROM facilities ORDER BY name")

    def facility(self, facility_id: str) -> dict:
        rows = self.store.rows("SELECT * FROM facilities WHERE id = ?", (facility_id,))
        if not rows:
            raise ApiError(404, "not_found", "Place not found.")
        return rows[0]

    def save_facility(self, data: dict, facility_id: str | None = None) -> dict:
        self._check_place_ward(data["ward_id"])
        if facility_id is None:
            facility_id = str(uuid4())
            self.store.insert("facilities", {"id": facility_id, **data})
        else:
            self.facility(facility_id)
            self.store.update("facilities", facility_id, data)
        return self.facility(facility_id)

    def delete_facility(self, facility_id: str) -> dict:
        row = self.facility(facility_id)
        self.store.delete("facilities", facility_id)
        return row

    # Parking lots

    def lots(self, ward_id: str | None = None) -> list[dict]:
        if ward_id:
            rows = self.store.rows("SELECT * FROM parking_lots WHERE ward_id = ? ORDER BY name", (ward_id,))
        else:
            rows = self.store.rows("SELECT * FROM parking_lots ORDER BY name")
        return [_lot(row) for row in rows]

    def lot(self, lot_id: str) -> dict:
        rows = self.store.rows("SELECT * FROM parking_lots WHERE id = ?", (lot_id,))
        if not rows:
            raise ApiError(404, "not_found", "Parking lot not found.")
        return _lot(rows[0])

    def save_lot(self, data: dict, lot_id: str | None = None) -> dict:
        self._check_place_ward(data["ward_id"])
        if data["spaces_free"] > data["capacity"]:
            raise _invalid("spaces_free", "Free spaces cannot be more than the capacity.")
        row = {**data, "is_open": 1 if data["is_open"] else 0}
        if lot_id is None:
            lot_id = str(uuid4())
            self.store.insert("parking_lots", {"id": lot_id, **row})
        else:
            self.lot(lot_id)
            self.store.update("parking_lots", lot_id, row)
        return self.lot(lot_id)

    def set_lot_status(self, lot_id: str, spaces_free: int, is_open: bool) -> dict:
        lot = self.lot(lot_id)
        if spaces_free > lot["capacity"]:
            raise _invalid("spaces_free", f"{lot['name']} has {lot['capacity']} spaces.")
        self.store.update("parking_lots", lot_id, {"spaces_free": spaces_free, "is_open": 1 if is_open else 0})
        return self.lot(lot_id)

    def delete_lot(self, lot_id: str) -> dict:
        row = self.lot(lot_id)
        self.store.delete("parking_lots", lot_id)
        return row


directory = Directory()

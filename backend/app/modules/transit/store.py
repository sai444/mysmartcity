import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator
from uuid import uuid4

from app.modules.media.refs import dump_refs, load_refs
from app.modules.transit.seed import FARE_CHARGES, FARE_RULES, VEHICLES


def _flag(value: bool) -> int:
    return 1 if value else 0


class TransitStore:
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
            CREATE TABLE IF NOT EXISTS vehicles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                registration TEXT NOT NULL,
                origin TEXT NOT NULL,
                destination TEXT NOT NULL,
                price_paise INTEGER NOT NULL,
                seats INTEGER NOT NULL,
                phone TEXT NOT NULL,
                contact_name TEXT NOT NULL,
                minutes INTEGER NOT NULL,
                departures TEXT NOT NULL,
                notes TEXT NOT NULL,
                is_active INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fare_rules (
                kind TEXT PRIMARY KEY,
                base_paise INTEGER NOT NULL,
                included_km REAL NOT NULL,
                per_km_paise INTEGER NOT NULL,
                per_minute_paise INTEGER NOT NULL,
                min_paise INTEGER NOT NULL,
                night_surcharge_pct INTEGER NOT NULL,
                night_start TEXT NOT NULL,
                night_end TEXT NOT NULL,
                per_seat INTEGER NOT NULL,
                speed_kmh INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fare_charges (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                amount INTEGER NOT NULL,
                charge_type TEXT NOT NULL,
                is_active INTEGER NOT NULL
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(vehicles)")}
        if "media" not in columns:
            self._conn.execute("ALTER TABLE vehicles ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
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
            for vehicle in VEHICLES:
                exists = conn.execute("SELECT 1 FROM vehicles WHERE id = ?", (vehicle["id"],)).fetchone()
                if exists is not None:
                    continue
                self._insert(conn, vehicle["id"], vehicle)
            for rule in FARE_RULES:
                exists = conn.execute("SELECT 1 FROM fare_rules WHERE kind = ?", (rule["kind"],)).fetchone()
                if exists is not None:
                    continue
                conn.execute(
                    """
                    INSERT INTO fare_rules (
                        kind, base_paise, included_km, per_km_paise, per_minute_paise, min_paise,
                        night_surcharge_pct, night_start, night_end, per_seat, speed_kmh
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    _rule_values(rule),
                )
            for charge in FARE_CHARGES:
                exists = conn.execute("SELECT 1 FROM fare_charges WHERE id = ?", (charge["id"],)).fetchone()
                if exists is not None:
                    continue
                conn.execute(
                    """
                    INSERT INTO fare_charges (id, kind, name, amount, charge_type, is_active)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (charge["id"], *_charge_values(charge)),
                )

    def list_rows(self, *, active_only: bool) -> list[dict]:
        sql = "SELECT * FROM vehicles"
        if active_only:
            sql += " WHERE is_active = 1"
        sql += " ORDER BY origin, destination, name"
        with self._lock:
            rows = self._conn.execute(sql).fetchall()
        return [_pack(row) for row in rows]

    def get(self, vehicle_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
        return _pack(row) if row else None

    def insert(self, body: dict) -> str:
        vehicle_id = str(uuid4())
        with self._tx() as conn:
            self._insert(conn, vehicle_id, body)
        return vehicle_id

    def update(self, vehicle_id: str, body: dict) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                """
                UPDATE vehicles SET
                    name = ?, kind = ?, registration = ?, origin = ?, destination = ?,
                    price_paise = ?, seats = ?, phone = ?, contact_name = ?, minutes = ?,
                    departures = ?, notes = ?, is_active = ?, media = ?
                WHERE id = ?
                """,
                _values(body) + (vehicle_id,),
            )
            return cursor.rowcount > 0

    def delete(self, vehicle_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
            return cursor.rowcount > 0

    def list_rules(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM fare_rules ORDER BY kind").fetchall()
        return [_pack_rule(row) for row in rows]

    def get_rule(self, kind: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM fare_rules WHERE kind = ?", (kind,)).fetchone()
        return _pack_rule(row) if row else None

    def update_rule(self, kind: str, body: dict) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                """
                UPDATE fare_rules SET
                    base_paise = ?, included_km = ?, per_km_paise = ?, per_minute_paise = ?, min_paise = ?,
                    night_surcharge_pct = ?, night_start = ?, night_end = ?, per_seat = ?, speed_kmh = ?
                WHERE kind = ?
                """,
                _rule_values({**body, "kind": kind})[1:] + (kind,),
            )
            return cursor.rowcount > 0

    def list_charges(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM fare_charges ORDER BY kind, name").fetchall()
        return [_pack_charge(row) for row in rows]

    def get_charge(self, charge_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM fare_charges WHERE id = ?", (charge_id,)).fetchone()
        return _pack_charge(row) if row else None

    def insert_charge(self, body: dict) -> str:
        charge_id = str(uuid4())
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO fare_charges (id, kind, name, amount, charge_type, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (charge_id, *_charge_values(body)),
            )
        return charge_id

    def update_charge(self, charge_id: str, body: dict) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                """
                UPDATE fare_charges SET kind = ?, name = ?, amount = ?, charge_type = ?, is_active = ?
                WHERE id = ?
                """,
                (*_charge_values(body), charge_id),
            )
            return cursor.rowcount > 0

    def delete_charge(self, charge_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute("DELETE FROM fare_charges WHERE id = ?", (charge_id,))
            return cursor.rowcount > 0

    def _insert(self, conn: sqlite3.Connection, vehicle_id: str, body: dict) -> None:
        conn.execute(
            """
            INSERT INTO vehicles (
                id, name, kind, registration, origin, destination, price_paise, seats,
                phone, contact_name, minutes, departures, notes, is_active, media
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (vehicle_id, *_values(body)),
        )


def _values(body: dict) -> tuple:
    return (
        body["name"],
        body["kind"],
        body["registration"],
        body["origin"],
        body["destination"],
        body["price_paise"],
        body["seats"],
        body["phone"],
        body["contact_name"],
        body["minutes"],
        body["departures"],
        body["notes"],
        _flag(body["is_active"]),
        dump_refs(body.get("media")),
    )


def _rule_values(body: dict) -> tuple:
    return (
        body["kind"],
        body["base_paise"],
        float(body["included_km"]),
        body["per_km_paise"],
        body["per_minute_paise"],
        body["min_paise"],
        body["night_surcharge_pct"],
        body["night_start"],
        body["night_end"],
        _flag(body["per_seat"]),
        body["speed_kmh"],
    )


def _charge_values(body: dict) -> tuple:
    return (
        body["kind"],
        body["name"],
        body["amount"],
        body["charge_type"],
        _flag(body["is_active"]),
    )


def _pack_rule(row: sqlite3.Row) -> dict:
    return {
        "kind": row["kind"],
        "base_paise": row["base_paise"],
        "included_km": row["included_km"],
        "per_km_paise": row["per_km_paise"],
        "per_minute_paise": row["per_minute_paise"],
        "min_paise": row["min_paise"],
        "night_surcharge_pct": row["night_surcharge_pct"],
        "night_start": row["night_start"],
        "night_end": row["night_end"],
        "per_seat": bool(row["per_seat"]),
        "speed_kmh": row["speed_kmh"],
    }


def _pack_charge(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "name": row["name"],
        "amount": row["amount"],
        "charge_type": row["charge_type"],
        "is_active": bool(row["is_active"]),
    }


def _pack(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "registration": row["registration"],
        "origin": row["origin"],
        "destination": row["destination"],
        "price_paise": row["price_paise"],
        "seats": row["seats"],
        "phone": row["phone"],
        "contact_name": row["contact_name"],
        "minutes": row["minutes"],
        "departures": row["departures"],
        "notes": row["notes"],
        "is_active": bool(row["is_active"]),
        "media": load_refs(row["media"]),
    }

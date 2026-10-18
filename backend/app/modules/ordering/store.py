import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

OPEN_STATUSES = ("placed", "accepted", "preparing", "out_for_delivery")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid4().hex


class OrderStore:
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
            CREATE TABLE IF NOT EXISTS commerce_orders (
                id TEXT PRIMARY KEY,
                buyer_id TEXT NOT NULL,
                buyer_name TEXT NOT NULL,
                channel TEXT NOT NULL,
                shop_id TEXT NOT NULL,
                shop_slug TEXT NOT NULL,
                shop_name TEXT NOT NULL,
                status TEXT NOT NULL,
                address TEXT NOT NULL,
                note TEXT NOT NULL,
                payment TEXT NOT NULL,
                subtotal_paise INTEGER NOT NULL,
                fee_paise INTEGER NOT NULL,
                total_paise INTEGER NOT NULL,
                idempotency_key TEXT,
                placed_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_idempotency
                ON commerce_orders(buyer_id, idempotency_key)
                WHERE idempotency_key IS NOT NULL;
            CREATE INDEX IF NOT EXISTS commerce_orders_buyer ON commerce_orders(buyer_id, placed_at DESC);
            CREATE INDEX IF NOT EXISTS commerce_orders_shop ON commerce_orders(shop_id, placed_at DESC);
            CREATE INDEX IF NOT EXISTS commerce_orders_status ON commerce_orders(status);
            CREATE TABLE IF NOT EXISTS commerce_order_lines (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
                item_id TEXT NOT NULL,
                name TEXT NOT NULL,
                qty INTEGER NOT NULL,
                unit_price_paise INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS commerce_order_events (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                note TEXT,
                actor_id TEXT NOT NULL,
                actor_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS commerce_order_events_order
                ON commerce_order_events(order_id, created_at);
            """
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

    def get(self, order_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM commerce_orders WHERE id = ?", (order_id,)).fetchone()
            if row is None:
                return None
            return self._pack(row)

    def get_by_key(self, buyer_id: str, idempotency_key: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM commerce_orders WHERE buyer_id = ? AND idempotency_key = ?",
                (buyer_id, idempotency_key),
            ).fetchone()
            if row is None:
                return None
            return self._pack(row)

    def list_orders(
        self,
        *,
        buyer_id: str | None = None,
        shop_ids: list[str] | None = None,
        status: str | None = None,
        channel: str | None = None,
    ) -> list[dict]:
        clauses = ["1 = 1"]
        params: list[object] = []
        if buyer_id is not None:
            clauses.append("buyer_id = ?")
            params.append(buyer_id)
        if shop_ids is not None:
            if not shop_ids:
                return []
            placeholders = ", ".join("?" for _ in shop_ids)
            clauses.append(f"shop_id IN ({placeholders})")
            params.extend(shop_ids)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        if channel is not None:
            clauses.append("channel = ?")
            params.append(channel)
        sql = f"SELECT * FROM commerce_orders WHERE {' AND '.join(clauses)} ORDER BY placed_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
            return [self._pack(row) for row in rows]

    def open_count(self) -> int:
        with self._lock:
            row = self._conn.execute(
                f"SELECT COUNT(*) AS total FROM commerce_orders WHERE status IN ({', '.join('?' for _ in OPEN_STATUSES)})",
                OPEN_STATUSES,
            ).fetchone()
        return int(row["total"])

    def insert(
        self,
        *,
        buyer_id: str,
        buyer_name: str,
        channel: str,
        shop_id: str,
        shop_slug: str,
        shop_name: str,
        address: str,
        note: str,
        payment: str,
        fee_paise: int,
        lines: list[dict],
        idempotency_key: str | None,
        actor_id: str,
        actor_name: str,
    ) -> dict:
        order_id = _new_id()
        now = _utc_now()
        subtotal = sum(int(line["qty"]) * int(line["unit_price_paise"]) for line in lines)
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO commerce_orders (
                    id, buyer_id, buyer_name, channel, shop_id, shop_slug, shop_name, status,
                    address, note, payment, subtotal_paise, fee_paise, total_paise, idempotency_key,
                    placed_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    buyer_id,
                    buyer_name,
                    channel,
                    shop_id,
                    shop_slug,
                    shop_name,
                    address,
                    note,
                    payment,
                    subtotal,
                    fee_paise,
                    subtotal + fee_paise,
                    idempotency_key,
                    now,
                    now,
                ),
            )
            for line in lines:
                conn.execute(
                    """
                    INSERT INTO commerce_order_lines (id, order_id, item_id, name, qty, unit_price_paise)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    ( _new_id(), order_id, line["item_id"], line["name"], line["qty"], line["unit_price_paise"]),
                )
            conn.execute(
                """
                INSERT INTO commerce_order_events (id, order_id, status, note, actor_id, actor_name, created_at)
                VALUES (?, ?, 'placed', ?, ?, ?, ?)
                """,
                (_new_id(), order_id, None, actor_id, actor_name, now),
            )
        packed = self.get(order_id)
        if packed is None:
            raise RuntimeError("order_not_stored")
        return packed

    def set_status(self, order_id: str, expected: tuple[str, ...], status: str, note: str | None, actor_id: str, actor_name: str) -> dict | None:
        now = _utc_now()
        with self._tx() as conn:
            cursor = conn.execute(
                f"""
                UPDATE commerce_orders SET status = ?, updated_at = ?
                WHERE id = ? AND status IN ({", ".join("?" for _ in expected)})
                """,
                (status, now, order_id, *expected),
            )
            if cursor.rowcount == 0:
                return None
            conn.execute(
                """
                INSERT INTO commerce_order_events (id, order_id, status, note, actor_id, actor_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (_new_id(), order_id, status, note, actor_id, actor_name, now),
            )
        return self.get(order_id)

    def _pack(self, row: sqlite3.Row) -> dict:
        lines = self._conn.execute(
            "SELECT item_id, name, qty, unit_price_paise FROM commerce_order_lines WHERE order_id = ? ORDER BY rowid",
            (row["id"],),
        ).fetchall()
        events = self._conn.execute(
            "SELECT status, note, actor_name, created_at FROM commerce_order_events WHERE order_id = ? ORDER BY created_at",
            (row["id"],),
        ).fetchall()
        return {
            **dict(row),
            "lines": [dict(line) for line in lines],
            "events": [dict(event) for event in events],
        }

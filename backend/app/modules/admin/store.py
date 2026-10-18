import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AdminStore:
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
            CREATE TABLE IF NOT EXISTS feature_flags (
                key TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                actor_id TEXT NOT NULL,
                actor_name TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
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

    def flags(self) -> dict[str, bool]:
        with self._lock:
            rows = self._conn.execute("SELECT key, enabled FROM feature_flags").fetchall()
        return {row["key"]: bool(row["enabled"]) for row in rows}

    def set_flag(self, key: str, enabled: bool) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO feature_flags (key, enabled, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
                """,
                (key, 1 if enabled else 0, _utc_now()),
            )

    def log(self, actor_id: str, actor_name: str, action: str, target: str) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO audit_log (id, actor_id, actor_name, action, target, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (str(uuid4()), actor_id, actor_name, action, target, _utc_now()),
            )

    def recent(self, limit: int) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT actor_name, action, target, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

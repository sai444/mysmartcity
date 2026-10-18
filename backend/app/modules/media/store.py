import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.modules.media.objects import object_store


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MediaStore:
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
            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                mime TEXT NOT NULL,
                size INTEGER NOT NULL,
                data BLOB NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS media_by_owner ON media(owner_id, created_at);
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

    def insert(self, owner_id: str, kind: str, mime: str, data: bytes) -> str:
        media_id = uuid4().hex
        objects = object_store()
        if objects.enabled:
            objects.put(f"media/{media_id}", data, mime)
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO media (id, owner_id, kind, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (media_id, owner_id, kind, mime, len(data), b"" if objects.enabled else data, _utc_now()),
            )
        return media_id

    def count_since(self, owner_id: str, since: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM media WHERE owner_id = ? AND created_at >= ?", (owner_id, since)
            ).fetchone()
        return int(row[0])

    def find(self, media_ids: list[str]) -> dict[str, dict]:
        if not media_ids:
            return {}
        marks = ",".join("?" for _ in media_ids)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT id, owner_id, kind, mime, size FROM media WHERE id IN ({marks})", media_ids
            ).fetchall()
        return {row["id"]: dict(row) for row in rows}

    def chunk(self, media_id: str, start: int, length: int) -> bytes:
        objects = object_store()
        if objects.enabled:
            return objects.get(f"media/{media_id}", start, length)
        with self._lock:
            row = self._conn.execute(
                "SELECT substr(data, ?, ?) AS chunk FROM media WHERE id = ?", (start + 1, length, media_id)
            ).fetchone()
        return bytes(row["chunk"]) if row else b""

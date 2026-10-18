import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.modules.media.objects import object_store
from app.modules.shorts.seed import DEMO_DIR, DEMO_SHORTS

_SELECT = """
    SELECT s.*,
        (SELECT COUNT(*) FROM short_likes l WHERE l.short_id = s.id) AS like_count,
        EXISTS (SELECT 1 FROM short_likes l WHERE l.short_id = s.id AND l.user_id = ?) AS liked
    FROM shorts s
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ShortsStore:
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
            CREATE TABLE IF NOT EXISTS short_videos (
                id TEXT PRIMARY KEY,
                mime TEXT NOT NULL,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shorts (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                caption TEXT NOT NULL,
                video_id TEXT NOT NULL REFERENCES short_videos(id),
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                sponsor TEXT NOT NULL,
                cta_label TEXT NOT NULL,
                cta_url TEXT NOT NULL,
                views INTEGER NOT NULL DEFAULT 0,
                clicks INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS short_likes (
                short_id TEXT NOT NULL REFERENCES shorts(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                PRIMARY KEY (short_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS shorts_by_author ON shorts(author_id, created_at);
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(short_videos)")}
        if "size" not in columns:
            self._conn.execute("ALTER TABLE short_videos ADD COLUMN size INTEGER NOT NULL DEFAULT 0")
        short_columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(shorts)")}
        if "media_kind" not in short_columns:
            self._conn.execute("ALTER TABLE shorts ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'video'")
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
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with self._tx() as conn:
            for index, short in enumerate(DEMO_SHORTS):
                exists = conn.execute("SELECT 1 FROM shorts WHERE id = ?", (short["id"],)).fetchone()
                if exists is not None:
                    continue
                video_id = f"{short['id']}-video"
                if short.get("media_kind") == "image":
                    from app.modules.media.swatch import png_swatch

                    data = png_swatch((46, 120, 92), (232, 201, 120), 720, 1280)
                    mime = "image/png"
                else:
                    data = (DEMO_DIR / short["file"]).read_bytes()
                    mime = "video/webm"
                self._write_video(conn, video_id, mime, data)
                self._insert(
                    conn,
                    short["id"],
                    {
                        "sponsor": "",
                        "cta_label": "",
                        "cta_url": "",
                        **short,
                        "video_id": video_id,
                        "created_at": (start + timedelta(minutes=index)).isoformat(),
                    },
                )

    def list_rows(
        self,
        viewer_id: str | None,
        *,
        status: str | None = None,
        kind: str | None = None,
        author_id: str | None = None,
    ) -> list[dict]:
        clauses: list[str] = []
        params: list[object] = [viewer_id or ""]
        for column, value in (("status", status), ("kind", kind), ("author_id", author_id)):
            if value is not None:
                clauses.append(f"s.{column} = ?")
                params.append(value)
        sql = _SELECT + (f" WHERE {' AND '.join(clauses)}" if clauses else "") + " ORDER BY s.created_at DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [_pack(row) for row in rows]

    def get(self, short_id: str, viewer_id: str | None = None) -> dict | None:
        with self._lock:
            row = self._conn.execute(_SELECT + " WHERE s.id = ?", (viewer_id or "", short_id)).fetchone()
        return _pack(row) if row else None

    def count_live(self, author_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM shorts WHERE author_id = ? AND status = 'live'", (author_id,)
            ).fetchone()
        return int(row[0])

    def _write_video(self, conn: sqlite3.Connection, video_id: str, mime: str, data: bytes) -> None:
        objects = object_store()
        if objects.enabled:
            objects.put(f"shorts/{video_id}", data, mime)
        conn.execute(
            "INSERT OR REPLACE INTO short_videos (id, mime, data, size) VALUES (?, ?, ?, ?)",
            (video_id, mime, b"" if objects.enabled else data, len(data)),
        )

    def insert(self, short: dict, mime: str, data: bytes) -> str:
        short_id = str(uuid4())
        video_id = str(uuid4())
        with self._tx() as conn:
            self._write_video(conn, video_id, mime, data)
            self._insert(
                conn,
                short_id,
                {**short, "status": "live", "video_id": video_id, "created_at": _utc_now()},
            )
        return short_id

    def _insert(self, conn: sqlite3.Connection, short_id: str, short: dict) -> None:
        conn.execute(
            """
            INSERT INTO shorts (
                id, kind, status, caption, video_id, author_id, author_name,
                sponsor, cta_label, cta_url, created_at, media_kind
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                short_id,
                short["kind"],
                short.get("status", "live"),
                short["caption"],
                short["video_id"],
                short["author_id"],
                short["author_name"],
                short["sponsor"],
                short["cta_label"],
                short["cta_url"],
                short["created_at"],
                short.get("media_kind", "video"),
            ),
        )

    def set_status(self, short_id: str, status: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute("UPDATE shorts SET status = ? WHERE id = ?", (status, short_id))
            return cursor.rowcount > 0

    def delete(self, short_id: str) -> bool:
        with self._tx() as conn:
            row = conn.execute("SELECT video_id FROM shorts WHERE id = ?", (short_id,)).fetchone()
            if row is None:
                return False
            conn.execute("DELETE FROM shorts WHERE id = ?", (short_id,))
            conn.execute("DELETE FROM short_videos WHERE id = ?", (row["video_id"],))
            object_store().delete(f"shorts/{row['video_id']}")
            return True

    def bump(self, short_id: str, column: str) -> bool:
        if column not in ("views", "clicks"):
            raise ValueError(column)
        with self._tx() as conn:
            cursor = conn.execute(f"UPDATE shorts SET {column} = {column} + 1 WHERE id = ?", (short_id,))
            return cursor.rowcount > 0

    def set_like(self, short_id: str, user_id: str, liked: bool) -> None:
        with self._tx() as conn:
            if liked:
                conn.execute("INSERT OR IGNORE INTO short_likes (short_id, user_id) VALUES (?, ?)", (short_id, user_id))
            else:
                conn.execute("DELETE FROM short_likes WHERE short_id = ? AND user_id = ?", (short_id, user_id))

    def video_meta(self, video_id: str) -> tuple[str, int] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT mime, CASE WHEN size > 0 THEN size ELSE length(data) END AS size FROM short_videos WHERE id = ?",
                (video_id,),
            ).fetchone()
        return (row["mime"], int(row["size"])) if row else None

    def video_bytes(self, video_id: str, start: int, length: int) -> bytes:
        objects = object_store()
        if objects.enabled:
            return objects.get(f"shorts/{video_id}", start, length)
        with self._lock:
            row = self._conn.execute(
                "SELECT substr(data, ?, ?) AS chunk FROM short_videos WHERE id = ?", (start + 1, length, video_id)
            ).fetchone()
        return bytes(row["chunk"]) if row else b""


def _pack(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "status": row["status"],
        "caption": row["caption"],
        "video_id": row["video_id"],
        "author_id": row["author_id"],
        "author_name": row["author_name"],
        "sponsor": row["sponsor"],
        "cta_label": row["cta_label"],
        "cta_url": row["cta_url"],
        "media_kind": row["media_kind"] if "media_kind" in row.keys() else "video",
        "views": row["views"],
        "clicks": row["clicks"],
        "like_count": row["like_count"],
        "liked": bool(row["liked"]),
        "created_at": row["created_at"],
    }

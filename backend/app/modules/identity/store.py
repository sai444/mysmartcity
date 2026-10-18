import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Iterator
from uuid import uuid4


@dataclass
class UserRecord:
    id: str
    email: str
    password_hash: str
    status: str
    display_name: str
    ward_id: str | None
    ui_mode: str
    role: str
    avatar_key: str | None
    map_style: str = "auto"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class IdentityStore:
    def __init__(self, path: str, *, seed_demo: bool = False) -> None:
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
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE TABLE IF NOT EXISTS profiles (
                user_id TEXT PRIMARY KEY REFERENCES users(id),
                display_name TEXT NOT NULL,
                avatar_key TEXT,
                ward_id TEXT,
                ui_mode TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'resident'
            );
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(profiles)")}
        if "role" not in columns:
            self._conn.execute("ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'resident'")
        if "map_style" not in columns:
            self._conn.execute("ALTER TABLE profiles ADD COLUMN map_style TEXT NOT NULL DEFAULT 'auto'")
        self._conn.commit()
        if seed_demo:
            self.seed_demo()

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

    def create_user(
        self,
        email: str,
        password_hash: str,
        display_name: str,
        ui_mode: str,
        ward_id: str | None,
        role: str = "resident",
    ) -> UserRecord:
        user_id = str(uuid4())
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, password_hash, status, created_at, deleted_at)
                VALUES (?, ?, ?, 'active', ?, NULL)
                """,
                (user_id, email, password_hash, now),
            )
            conn.execute(
                """
                INSERT INTO profiles (user_id, display_name, avatar_key, ward_id, ui_mode, role)
                VALUES (?, ?, NULL, ?, ?, ?)
                """,
                (user_id, display_name, ward_id, ui_mode, role),
            )
        created = self.get_by_id(user_id)
        if created is None:
            raise RuntimeError("User was not stored")
        return created

    def get_by_email(self, email: str) -> UserRecord | None:
        with self._lock:
            row = self._conn.execute(_USER_SQL + " WHERE u.email = ?", (email,)).fetchone()
        return _record(row) if row else None

    def get_by_id(self, user_id: str) -> UserRecord | None:
        with self._lock:
            row = self._conn.execute(_USER_SQL + " WHERE u.id = ?", (user_id,)).fetchone()
        return _record(row) if row else None

    def update_profile(
        self,
        user_id: str,
        display_name: str | None,
        ward_id: str | None,
        ui_mode: str | None,
        set_ward: bool,
        map_style: str | None = None,
    ) -> UserRecord | None:
        assignments: list[str] = []
        params: list[str | None] = []
        if display_name is not None:
            assignments.append("display_name = ?")
            params.append(display_name)
        if set_ward:
            assignments.append("ward_id = ?")
            params.append(ward_id)
        if ui_mode is not None:
            assignments.append("ui_mode = ?")
            params.append(ui_mode)
        if map_style is not None:
            assignments.append("map_style = ?")
            params.append(map_style)
        if assignments:
            params.append(user_id)
            with self._tx() as conn:
                conn.execute(f"UPDATE profiles SET {', '.join(assignments)} WHERE user_id = ?", params)
        return self.get_by_id(user_id)

    def list_users(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT u.id, u.email, u.status, u.created_at, p.display_name, p.ward_id, p.role
                FROM users u
                JOIN profiles p ON p.user_id = u.id
                WHERE u.deleted_at IS NULL
                ORDER BY u.created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def count_active_admins(self) -> int:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT COUNT(*) AS total FROM users u JOIN profiles p ON p.user_id = u.id
                WHERE p.role = 'admin' AND u.status = 'active' AND u.deleted_at IS NULL
                """
            ).fetchone()
        return int(row["total"])

    def set_status(self, user_id: str, status: str) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE users SET status = ? WHERE id = ?", (status, user_id))
            if status != "active":
                conn.execute(
                    "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                    (_utc_now(), user_id),
                )

    def set_role(self, user_id: str, role: str) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE profiles SET role = ? WHERE user_id = ?", (role, user_id))

    def save_refresh(self, user_id: str, token_hash: str, expires_at: str) -> None:
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
                VALUES (?, ?, ?, ?, NULL, ?)
                """,
                (str(uuid4()), user_id, token_hash, expires_at, now),
            )

    def rotate_refresh(self, old_hash: str, new_hash: str, expires_at: str, now: str) -> str | None:
        with self._tx() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, expires_at, revoked_at
                FROM refresh_tokens
                WHERE token_hash = ?
                """,
                (old_hash,),
            ).fetchone()
            if row is None or row["revoked_at"] is not None or row["expires_at"] <= now:
                return None
            user = conn.execute("SELECT status FROM users WHERE id = ?", (row["user_id"],)).fetchone()
            conn.execute("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?", (now, row["id"]))
            if user is None or user["status"] != "active":
                return None
            conn.execute(
                """
                INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
                VALUES (?, ?, ?, ?, NULL, ?)
                """,
                (str(uuid4()), row["user_id"], new_hash, expires_at, now),
            )
            return str(row["user_id"])

    def revoke_refresh(self, token_hash: str) -> None:
        now = _utc_now()
        with self._tx() as conn:
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                (now, token_hash),
            )

    def seed_demo(self) -> None:
        from app.core.security import hash_password
        from app.modules.identity.demo import DEMO_USERS

        for demo in DEMO_USERS:
            if self.get_by_email(demo["email"]) is not None:
                continue
            self.create_user(
                demo["email"],
                hash_password(demo["password"]),
                demo["display_name"],
                demo["ui_mode"],
                demo["ward_id"],
                demo["role"],
            )


_USER_SQL = """
SELECT u.id, u.email, u.password_hash, u.status,
       p.display_name, p.ward_id, p.ui_mode, p.role, p.avatar_key, p.map_style
FROM users u
JOIN profiles p ON p.user_id = u.id
"""


def _record(row: sqlite3.Row) -> UserRecord:
    return UserRecord(
        id=row["id"],
        email=row["email"],
        password_hash=row["password_hash"],
        status=row["status"],
        display_name=row["display_name"],
        ward_id=row["ward_id"],
        ui_mode=row["ui_mode"],
        role=row["role"] or "resident",
        avatar_key=row["avatar_key"],
        map_style=row["map_style"] or "auto",
    )

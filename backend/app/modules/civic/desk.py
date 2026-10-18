import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.civic.directory import directory
from app.modules.civic.seed import NOTICES
from app.modules.media.refs import dump_refs, load_refs
from app.modules.media.service import media_service

_RANK = {"emergency": 0, "warning": 1, "info": 2}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DeskStore:
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
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                ward_id TEXT,
                category TEXT NOT NULL,
                place TEXT NOT NULL,
                details TEXT NOT NULL,
                status TEXT NOT NULL,
                admin_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notices (
                id TEXT PRIMARY KEY,
                ward_id TEXT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                severity TEXT NOT NULL,
                starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                created_by TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ended_seed_notices (
                id TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS ward_settings (
                ward_id TEXT NOT NULL,
                section TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (ward_id, section)
            );
            """
        )
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(reports)")}
        if "media" not in columns:
            self._conn.execute("ALTER TABLE reports ADD COLUMN media TEXT NOT NULL DEFAULT '[]'")
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

    def _rows(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def add_report(self, row: dict) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO reports (id, user_id, user_name, ward_id, category, place, details, media, status,
                                     admin_note, created_at, updated_at)
                VALUES (:id, :user_id, :user_name, :ward_id, :category, :place, :details, :media, :status,
                        NULL, :created_at, :created_at)
                """,
                {**row, "media": dump_refs(row.get("media"))},
            )

    def reports(self, user_id: str | None = None, status: str | None = None) -> list[dict]:
        clauses, params = ["1 = 1"], []
        if user_id:
            clauses.append("user_id = ?")
            params.append(user_id)
        if status:
            clauses.append("status = ?")
            params.append(status)
        return self._rows(f"SELECT * FROM reports WHERE {' AND '.join(clauses)} ORDER BY created_at DESC", tuple(params))

    def update_report(self, report_id: str, status: str, note: str | None) -> bool:
        with self._tx() as conn:
            cursor = conn.execute(
                "UPDATE reports SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?",
                (status, note, _now().isoformat(), report_id),
            )
            return cursor.rowcount > 0

    def add_notice(self, row: dict) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO notices (id, ward_id, title, body, severity, starts_at, ends_at, created_by)
                VALUES (:id, :ward_id, :title, :body, :severity, :starts_at, :ends_at, :created_by)
                """,
                row,
            )

    def notices(self) -> list[dict]:
        return self._rows("SELECT * FROM notices")

    def end_notice(self, notice_id: str) -> bool:
        with self._tx() as conn:
            cursor = conn.execute("UPDATE notices SET ends_at = ? WHERE id = ?", (_now().isoformat(), notice_id))
            return cursor.rowcount > 0

    def end_seed_notice(self, notice_id: str) -> None:
        with self._tx() as conn:
            conn.execute("INSERT OR IGNORE INTO ended_seed_notices (id) VALUES (?)", (notice_id,))

    def ended_seed_ids(self) -> set[str]:
        return {row["id"] for row in self._rows("SELECT id FROM ended_seed_notices")}

    def setting(self, ward_id: str, section: str) -> dict | None:
        rows = self._rows("SELECT payload FROM ward_settings WHERE ward_id = ? AND section = ?", (ward_id, section))
        return json.loads(rows[0]["payload"]) if rows else None

    def settings_for(self, ward_id: str) -> set[str]:
        return {row["section"] for row in self._rows("SELECT section FROM ward_settings WHERE ward_id = ?", (ward_id,))}

    def set_setting(self, ward_id: str, section: str, payload: dict) -> None:
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO ward_settings (ward_id, section, payload, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(ward_id, section) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
                """,
                (ward_id, section, json.dumps(payload), _now().isoformat()),
            )

    def clear_setting(self, ward_id: str, section: str) -> None:
        with self._tx() as conn:
            conn.execute("DELETE FROM ward_settings WHERE ward_id = ? AND section = ?", (ward_id, section))

class DeskService:
    def __init__(self) -> None:
        self._store: DeskStore | None = None

    @property
    def store(self) -> DeskStore:
        if self._store is None:
            self._store = DeskStore(settings.civic_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = DeskStore(path)

    def file_report(
        self,
        user_id: str,
        user_name: str,
        ward_id: str | None,
        category: str,
        place: str,
        details: str,
        media: list[str] | None = None,
    ) -> dict:
        if ward_id is not None and not directory.is_open_ward(ward_id):
            raise ApiError(422, "validation_error", "Choose a ward from the list.", [{"field": "ward_id", "message": "Choose a ward from the list."}])
        refs = media_service.refs(user_id, media or [])
        row = {
            "id": str(uuid4()),
            "user_id": user_id,
            "user_name": user_name,
            "ward_id": ward_id,
            "category": category,
            "place": place,
            "details": details,
            "media": refs,
            "status": "submitted",
            "created_at": _now().isoformat(),
        }
        self.store.add_report(row)
        return self._report(self.store.reports(user_id=user_id)[0])

    def reports_for(self, user_id: str) -> list[dict]:
        return [self._report(row) for row in self.store.reports(user_id=user_id)]

    def all_reports(self, status: str | None = None) -> list[dict]:
        return [self._report(row) for row in self.store.reports(status=status)]

    def update_report(self, report_id: str, status: str, note: str | None) -> dict:
        if not self.store.update_report(report_id, status, note):
            raise ApiError(404, "not_found", "Report not found.")
        return next(self._report(row) for row in self.store.reports() if row["id"] == report_id)

    def open_report_count(self) -> int:
        return sum(1 for row in self.store.reports() if row["status"] in ("submitted", "in_progress"))

    def publish_notice(self, actor_id: str, ward_id: str | None, title: str, body: str, severity: str, hours: int) -> dict:
        if ward_id is not None and directory.find_ward(ward_id) is None:
            raise ApiError(422, "validation_error", "Choose a ward from the list.", [{"field": "ward_id", "message": "Choose a ward from the list."}])
        start = _now()
        row = {
            "id": str(uuid4()),
            "ward_id": ward_id,
            "title": title,
            "body": body,
            "severity": severity,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=hours)).isoformat(),
            "created_by": actor_id,
        }
        self.store.add_notice(row)
        return _notice(row)

    def end_notice(self, notice_id: str) -> None:
        if self.store.end_notice(notice_id):
            return
        if any(notice["id"] == notice_id for notice in NOTICES):
            self.store.end_seed_notice(notice_id)
            return
        raise ApiError(404, "not_found", "Notice not found.")

    def active_notices(self, ward_id: str | None = None, now: datetime | None = None, *, any_ward: bool = False) -> list[dict]:
        clock = now or _now()
        ended = self.store.ended_seed_ids()
        seeded = [dict(notice) for notice in NOTICES if notice["id"] not in ended]
        stored = [_notice(row) for row in self.store.notices()]
        rows = [
            notice
            for notice in stored + seeded
            if notice["starts_at"] <= clock <= notice["ends_at"]
            and (any_ward or notice["ward_id"] is None or notice["ward_id"] == ward_id)
        ]
        return sorted(rows, key=lambda notice: (_RANK.get(notice["severity"], 3), notice["title"]))

    def _report(self, row: dict) -> dict:
        return {**row, "ward_name": directory.ward_name(row["ward_id"]), "media": media_service.items(load_refs(row.get("media")))}


def _notice(row: dict) -> dict:
    return {
        **row,
        "starts_at": datetime.fromisoformat(row["starts_at"]),
        "ends_at": datetime.fromisoformat(row["ends_at"]),
    }


desk_service = DeskService()

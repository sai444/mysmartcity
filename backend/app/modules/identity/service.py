import sqlite3
import threading
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import get_args

from app.core.config import settings
from app.core.errors import ApiError
from app.core.security import (
    create_access_token,
    dummy_verify,
    hash_password,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.modules.admin.service import admin_service
from app.modules.civic.directory import directory
from app.modules.identity.schemas import MapStyle, MeResponse, ProfilePatch, RegisterResponse, TokenResponse
from app.modules.identity.store import IdentityStore, UserRecord

_INVALID = "Email or password is incorrect."

@dataclass
class IssuedSession:
    refresh_token: str
    register: RegisterResponse | None
    token: TokenResponse


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        now = datetime.now(timezone.utc).timestamp()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True


class IdentityService:
    def __init__(self) -> None:
        self._store: IdentityStore | None = None
        self.limiter = RateLimiter()

    @property
    def store(self) -> IdentityStore:
        if self._store is None:
            self._store = IdentityStore(settings.identity_db_path, seed_demo=True)
        return self._store

    def rebind(self, path: str, *, seed_demo: bool = False) -> None:
        if self._store is not None:
            self._store.close()
        self._store = IdentityStore(path, seed_demo=seed_demo)
        self.limiter = RateLimiter()

    def register(
        self,
        email: str,
        password: str,
        display_name: str,
        ui_mode: str,
        ward_id: str | None,
        ip: str,
    ) -> IssuedSession:
        admin_service.require("registration", "New sign-ups are paused by the city admin.")
        self._limit(f"register:{ip}", 3, 3600)
        _require_ward(ward_id)
        password_hash = hash_password(password)
        try:
            user = self.store.create_user(email, password_hash, display_name, ui_mode, ward_id)
        except sqlite3.IntegrityError as exc:
            raise ApiError(409, "email_taken", "An account with this email already exists.") from exc
        return self._issue(user, include_register=True)

    def login(self, email: str, password: str, ip: str) -> IssuedSession:
        self._limit(f"login:{ip}", 5, 60)
        user = self.store.get_by_email(email)
        if user is None:
            dummy_verify(password)
            raise ApiError(401, "invalid_credentials", _INVALID)
        if not verify_password(user.password_hash, password) or user.status != "active":
            raise ApiError(401, "invalid_credentials", _INVALID)
        return self._issue(user, include_register=False)

    def refresh(self, raw_token: str | None) -> IssuedSession:
        if not raw_token:
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        now = datetime.now(timezone.utc)
        new_raw = new_refresh_token()
        user_id = self.store.rotate_refresh(
            hash_token(raw_token),
            hash_token(new_raw),
            (now + timedelta(days=settings.refresh_token_days)).isoformat(),
            now.isoformat(),
        )
        if user_id is None:
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        user = self.store.get_by_id(user_id)
        if user is None or user.status != "active":
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        access_token, expires_in = create_access_token(user.id)
        return IssuedSession(refresh_token=new_raw, register=None, token=TokenResponse(access_token=access_token, expires_in=expires_in))

    def logout(self, raw_token: str | None) -> None:
        if raw_token:
            self.store.revoke_refresh(hash_token(raw_token))

    def me(self, user: UserRecord) -> MeResponse:
        return _me(user)

    def update_profile(self, user: UserRecord, patch: ProfilePatch) -> MeResponse:
        set_ward = "ward_id" in patch.model_fields_set and patch.ward_id is not None
        if set_ward:
            _require_ward(patch.ward_id)
        display_name = patch.display_name if "display_name" in patch.model_fields_set else None
        ui_mode = patch.ui_mode if "ui_mode" in patch.model_fields_set else None
        updated = self.store.update_profile(user.id, display_name, patch.ward_id, ui_mode, set_ward, patch.map_style)
        if updated is None or updated.status != "active":
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        return _me(updated)

    def list_users(self) -> list[dict]:
        return self.store.list_users()

    def update_user(self, actor: UserRecord, user_id: str, status: str | None, role: str | None) -> dict:
        target = self.store.get_by_id(user_id)
        if target is None:
            raise ApiError(404, "not_found", "User not found.")
        if target.id == actor.id and (status == "disabled" or role == "resident"):
            raise ApiError(409, "self_lockout", "You cannot disable or demote your own admin account.")
        losing_admin = target.role == "admin" and target.status == "active" and (status == "disabled" or role == "resident")
        if losing_admin and self.store.count_active_admins() <= 1:
            raise ApiError(409, "last_admin", "Keep at least one active city admin.")
        if status is not None:
            self.store.set_status(user_id, status)
        if role is not None:
            self.store.set_role(user_id, role)
        return next(row for row in self.store.list_users() if row["id"] == user_id)

    def require_active(self, user_id: str) -> UserRecord:
        user = self.store.get_by_id(user_id)
        if user is None or user.status != "active":
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        return user

    def _issue(self, user: UserRecord, include_register: bool) -> IssuedSession:
        raw = new_refresh_token()
        expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
        self.store.save_refresh(user.id, hash_token(raw), expires.isoformat())
        access_token, expires_in = create_access_token(user.id)
        register = None
        if include_register:
            register = RegisterResponse(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                access_token=access_token,
                expires_in=expires_in,
            )
        return IssuedSession(
            refresh_token=raw,
            register=register,
            token=TokenResponse(access_token=access_token, expires_in=expires_in),
        )

    def _limit(self, key: str, limit: int, window_seconds: float) -> None:
        if not self.limiter.allow(key, limit, window_seconds):
            raise ApiError(429, "rate_limited", "Too many attempts. Wait a little, then try again.")


def _require_ward(ward_id: str | None) -> None:
    if ward_id is None:
        return
    if not directory.is_open_ward(ward_id):
        raise ApiError(
            422,
            "validation_error",
            "Choose a ward from the list.",
            [{"field": "ward_id", "message": "Choose a ward from the list."}],
        )


def _me(user: UserRecord) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        ward_id=user.ward_id,
        ui_mode="normal" if user.ui_mode == "normal" else "modern",
        role="admin" if user.role == "admin" else "resident",
        map_style=user.map_style if user.map_style in get_args(MapStyle) else "auto",
        avatar_url=None,
        default_address=None,
    )


identity_service = IdentityService()

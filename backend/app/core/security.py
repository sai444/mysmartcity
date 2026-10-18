import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings
from app.core.errors import ApiError

_hasher = PasswordHasher()
_dummy_hash: str | None = None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def dummy_verify(password: str) -> None:
    """Spend a verify when the email is unknown so the response time stays similar."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = _hasher.hash("mynagari-dummy-password")
    verify_password(_dummy_hash, password)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def create_access_token(user_id: str) -> tuple[str, int]:
    expires_in = settings.access_token_minutes * 60
    expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    token = jwt.encode({"sub": user_id, "exp": expires}, settings.jwt_secret, algorithm="HS256")
    return token, expires_in


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ApiError(401, "unauthenticated", "Sign in to continue.") from exc
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    return subject

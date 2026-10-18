"""Object bytes for photos and videos. Docker uses MinIO; local tests keep blobs in SQLite."""

from io import BytesIO

from app.core.config import settings
from app.core.errors import ApiError


def _unavailable() -> ApiError:
    return ApiError(503, "storage_unavailable", "Photo storage is unavailable.")


class LocalObjects:
    enabled = False

    def ensure(self) -> None:
        return None

    def put(self, key: str, data: bytes, mime: str) -> None:
        return None

    def get(self, key: str, start: int, length: int) -> bytes:
        return b""

    def delete(self, key: str) -> None:
        return None


class MinioObjects:
    enabled = True

    def __init__(self) -> None:
        from minio import Minio

        self._bucket = settings.minio_bucket
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def ensure(self) -> None:
        try:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)
        except Exception as exc:
            raise _unavailable() from exc

    def put(self, key: str, data: bytes, mime: str) -> None:
        self.ensure()
        try:
            self._client.put_object(self._bucket, key, BytesIO(data), len(data), content_type=mime)
        except Exception as exc:
            raise _unavailable() from exc

    def get(self, key: str, start: int, length: int) -> bytes:
        self.ensure()
        try:
            response = self._client.get_object(self._bucket, key, offset=start, length=length)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except Exception as exc:
            from minio.error import S3Error

            if isinstance(exc, S3Error) and exc.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
                return b""
            raise _unavailable() from exc

    def delete(self, key: str) -> None:
        try:
            self._client.remove_object(self._bucket, key)
        except Exception:
            return None


_store: LocalObjects | MinioObjects | None = None


def object_store() -> LocalObjects | MinioObjects:
    global _store
    if _store is None:
        _store = MinioObjects() if settings.minio_endpoint.strip() else LocalObjects()
    return _store


def reset_object_store() -> None:
    global _store
    _store = None

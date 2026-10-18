import re
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.media.schemas import MediaItem
from app.modules.media.store import MediaStore

_MEDIA_PATH = "/api/v1/media/"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_BYTES = max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES)
_DAILY_UPLOADS = 200
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")
# ISO base-media brands that hold still images (iPhone HEIC, AVIF) rather than video.
_IMAGE_BRANDS = {b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1", b"avif", b"avis"}


def sniff(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in _IMAGE_BRANDS:
            return None
        return "video/quicktime" if brand == b"qt  " else "video/mp4"
    if head[4:8] in (b"moov", b"mdat", b"wide", b"free"):
        return "video/quicktime"
    return None


def _invalid(message: str, field: str = "media") -> ApiError:
    return ApiError(422, "validation_error", message, [{"field": field, "message": message}])


class MediaService:
    def __init__(self) -> None:
        self._store: MediaStore | None = None

    @property
    def store(self) -> MediaStore:
        if self._store is None:
            self._store = MediaStore(settings.media_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = MediaStore(path)

    def upload(self, owner_id: str, data: bytes) -> MediaItem:
        if not data:
            raise _invalid("Pick a photo or video to upload.", "file")
        mime = sniff(data[:16])
        if mime is None:
            raise _invalid("Use a JPEG, PNG, or WebP photo, or an MP4, WebM, or MOV video.", "file")
        kind = "image" if mime.startswith("image/") else "video"
        limit = MAX_IMAGE_BYTES if kind == "image" else MAX_VIDEO_BYTES
        if len(data) > limit:
            raise _invalid(f"{'Photos' if kind == 'image' else 'Videos'} must be under {limit // (1024 * 1024)} MB.", "file")
        since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        if self.store.count_since(owner_id, since) >= _DAILY_UPLOADS:
            raise ApiError(429, "too_many_uploads", "You have uploaded a lot today. Try again tomorrow.")
        media_id = self.store.insert(owner_id, kind, mime, data)
        return MediaItem(id=media_id, kind=kind, url=f"{_MEDIA_PATH}{media_id}")

    def refs(self, owner_id: str, media_ids: list[str], existing: list[dict] | None = None) -> list[dict]:
        """Turn submitted ids into stored refs. New ids must be uploads by `owner_id`; ids already on the record stay."""
        known = {ref["id"]: ref for ref in existing or []}
        wanted = list(dict.fromkeys(media_ids))
        fresh = [media_id for media_id in wanted if media_id not in known]
        found = self.store.find(fresh)
        for media_id in fresh:
            row = found.get(media_id)
            if row is None or row["owner_id"] != owner_id:
                raise _invalid("One of the uploads is missing. Upload it again.")
        return [known.get(media_id) or {"id": media_id, "kind": found[media_id]["kind"]} for media_id in wanted]

    def items(self, refs: list[dict] | None) -> list[MediaItem]:
        return [MediaItem(id=ref["id"], kind=ref["kind"], url=f"{_MEDIA_PATH}{ref['id']}") for ref in refs or []]

    def cover_url(self, refs: list[dict] | None) -> str | None:
        return next((f"{_MEDIA_PATH}{ref['id']}" for ref in refs or [] if ref["kind"] == "image"), None)

    def serve(self, media_id: str, range_header: str | None) -> tuple[int, dict[str, str], bytes]:
        row = self.store.find([media_id]).get(media_id)
        if row is None:
            raise ApiError(404, "not_found", "Media not found.")
        mime, size = row["mime"], int(row["size"])
        headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": mime,
        }
        if not range_header:
            body = self.store.chunk(media_id, 0, size)
            if size and not body:
                raise ApiError(404, "not_found", "Media not found.")
            return 200, headers, body

        match = _RANGE.match(range_header.strip())
        start, end = 0, size - 1
        if match and match.group(1):
            start = int(match.group(1))
            if match.group(2):
                end = min(int(match.group(2)), size - 1)
        elif match and match.group(2):
            start = max(size - int(match.group(2)), 0)
        if not match or (not match.group(1) and not match.group(2)) or start > end:
            return 416, {"Content-Range": f"bytes */{size}"}, b""
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        body = self.store.chunk(media_id, start, end - start + 1)
        if (end - start + 1) and not body:
            raise ApiError(404, "not_found", "Media not found.")
        return 206, headers, body


media_service = MediaService()

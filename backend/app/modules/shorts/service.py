import re

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.identity.store import UserRecord
from app.modules.media.service import MAX_IMAGE_BYTES, sniff
from app.modules.shorts.schemas import Short, ShortList
from app.modules.shorts.store import ShortsStore

_VIDEO_PATH = "/api/v1/shorts/videos/"
MAX_VIDEO_BYTES = 25 * 1024 * 1024
VIDEO_TYPES = ("video/mp4", "video/webm", "video/quicktime")
IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
_MAX_LIVE_SHORTS = 20
AD_EVERY = 3
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")
_CTA_URL = re.compile(r"^(/[A-Za-z0-9/_\-?=&.%]*|https://\S+)$")


def _looks_like_video(mime: str, head: bytes) -> bool:
    if mime == "video/webm":
        return head.startswith(b"\x1a\x45\xdf\xa3")
    return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free")


def _invalid(field: str, message: str) -> ApiError:
    return ApiError(422, "validation_error", "Check the highlighted fields.", [{"field": field, "message": message}])


def interleave(posts: list[Short], ads: list[Short], every: int = AD_EVERY) -> list[Short]:
    if not ads:
        return posts
    if not posts:
        return ads
    feed: list[Short] = []
    next_ad = 0
    for index, post in enumerate(posts, start=1):
        feed.append(post)
        if index % every == 0:
            feed.append(ads[next_ad % len(ads)])
            next_ad += 1
    if next_ad == 0:
        feed.append(ads[0])
    return feed


class ShortsService:
    def __init__(self) -> None:
        self._store: ShortsStore | None = None

    @property
    def store(self) -> ShortsStore:
        if self._store is None:
            self._store = ShortsStore(settings.shorts_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = ShortsStore(path)

    def _out(self, row: dict, viewer: UserRecord | None) -> Short:
        return Short.model_validate({**row, "video_url": f"{_VIDEO_PATH}{row['video_id']}", "is_mine": viewer is not None and viewer.id == row["author_id"]})

    def _rows(self, viewer: UserRecord | None, **filters: str) -> list[Short]:
        return [self._out(row, viewer) for row in self.store.list_rows(viewer.id if viewer else None, **filters)]

    def feed(self, viewer: UserRecord | None) -> ShortList:
        posts = self._rows(viewer, status="live", kind="user")
        ads = self._rows(viewer, status="live", kind="ad")
        return ShortList(data=interleave(posts, ads))

    def mine(self, user: UserRecord) -> ShortList:
        return ShortList(data=self._rows(user, author_id=user.id))

    def manage(self, admin: UserRecord) -> ShortList:
        return ShortList(data=self._rows(admin))

    def create(
        self,
        user: UserRecord,
        caption: str,
        mime: str,
        data: bytes,
        ad: dict[str, str] | None = None,
    ) -> Short:
        caption = caption.strip()
        if len(caption) < 2:
            raise _invalid("caption", "Write a short caption.")
        if not data:
            raise _invalid("video", "Pick a photo or a video to upload.")
        detected = sniff(data[:32])
        if detected in IMAGE_TYPES:
            if len(data) > MAX_IMAGE_BYTES:
                raise _invalid("image", f"Photos must be under {MAX_IMAGE_BYTES // (1024 * 1024)} MB.")
            media_kind = "image"
            store_mime = detected
        elif detected in VIDEO_TYPES or (detected is None and mime in VIDEO_TYPES and _looks_like_video(mime, data[:16])):
            if len(data) > MAX_VIDEO_BYTES:
                raise _invalid("video", f"Videos must be under {MAX_VIDEO_BYTES // (1024 * 1024)} MB.")
            if detected is None and not _looks_like_video(mime, data[:16]):
                raise _invalid("video", "That file does not look like a video.")
            media_kind = "video"
            store_mime = detected or mime
        else:
            raise _invalid("video", "Use a JPEG, PNG, or WebP photo, or an MP4, WebM, or MOV video.")
        if ad is None and self.store.count_live(user.id) >= _MAX_LIVE_SHORTS:
            raise ApiError(409, "too_many_shorts", f"You already have {_MAX_LIVE_SHORTS} shorts up. Remove one first.")

        fields = {"sponsor": "", "cta_label": "", "cta_url": ""}
        if ad is not None:
            fields = {key: ad.get(key, "").strip() for key in fields}
            if len(fields["sponsor"]) < 2:
                raise _invalid("sponsor", "Name the business behind the ad.")
            if bool(fields["cta_label"]) != bool(fields["cta_url"]):
                raise _invalid("cta_url", "Give both a button label and a link, or neither.")
            if fields["cta_url"] and not _CTA_URL.match(fields["cta_url"]):
                raise _invalid("cta_url", "Use a MyNagari path like /shop or a full https:// link.")

        short_id = self.store.insert(
            {
                "kind": "ad" if ad is not None else "user",
                "caption": caption,
                "author_id": user.id,
                "author_name": user.display_name,
                "media_kind": media_kind,
                **fields,
            },
            store_mime,
            data,
        )
        return self._require(short_id, user)

    def set_status(self, admin: UserRecord, short_id: str, status: str) -> Short:
        if not self.store.set_status(short_id, status):
            raise ApiError(404, "not_found", "Short not found.")
        return self._require(short_id, admin)

    def remove(self, user: UserRecord, short_id: str) -> Short:
        row = self.store.get(short_id)
        if row is None:
            raise ApiError(404, "not_found", "Short not found.")
        if row["author_id"] != user.id and user.role != "admin":
            raise ApiError(403, "not_author", "Only the person who posted this short can remove it.")
        self.store.delete(short_id)
        return self._out(row, user)

    def like(self, user: UserRecord, short_id: str, liked: bool) -> Short:
        self._live(short_id)
        self.store.set_like(short_id, user.id, liked)
        return self._require(short_id, user)

    def record_view(self, short_id: str) -> None:
        self._live(short_id)
        self.store.bump(short_id, "views")

    def record_click(self, short_id: str) -> None:
        row = self._live(short_id)
        if row["kind"] != "ad":
            raise ApiError(409, "not_an_ad", "Only ad shorts have a link to click.")
        self.store.bump(short_id, "clicks")

    def video(self, video_id: str, range_header: str | None) -> tuple[int, dict[str, str], bytes]:
        meta = self.store.video_meta(video_id)
        if meta is None:
            raise ApiError(404, "not_found", "Video not found.")
        mime, size = meta
        headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": mime,
        }
        if not range_header:
            return 200, headers, self.store.video_bytes(video_id, 0, size)

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
        return 206, headers, self.store.video_bytes(video_id, start, end - start + 1)

    def _live(self, short_id: str) -> dict:
        row = self.store.get(short_id)
        if row is None or row["status"] != "live":
            raise ApiError(404, "not_found", "Short not found.")
        return row

    def _require(self, short_id: str, viewer: UserRecord) -> Short:
        row = self.store.get(short_id, viewer.id)
        if row is None:
            raise ApiError(500, "short_not_stored", "The short could not be saved.")
        return self._out(row, viewer)


shorts_service = ShortsService()

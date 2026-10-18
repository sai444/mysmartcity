from typing import Annotated

from fastapi import APIRouter, File, Form, Header, Response, UploadFile

from app.modules.admin.service import admin_service
from app.modules.identity.router import AdminUser, CurrentUser, OptionalUser
from app.modules.shorts.schemas import Short, ShortList, StatusIn
from app.core.errors import ApiError
from app.modules.shorts.service import MAX_VIDEO_BYTES, shorts_service

router = APIRouter(prefix="/shorts", tags=["shorts"])

_PAUSED = "Shorts are paused by the city admin."

Caption = Annotated[str, Form(max_length=150)]


def _read(video: UploadFile | None, image: UploadFile | None) -> tuple[str, bytes]:
    chosen = next((item for item in (image, video) if item is not None and item.filename), None)
    if chosen is None:
        raise ApiError(422, "validation_error", "Check the highlighted fields.", [{"field": "video", "message": "Pick a photo or a video to upload."}])
    return (chosen.content_type or "", chosen.file.read(MAX_VIDEO_BYTES + 1))


@router.get("/feed", response_model=ShortList)
def feed(viewer: OptionalUser) -> ShortList:
    return shorts_service.feed(viewer)


@router.get("/mine", response_model=ShortList)
def my_shorts(user: CurrentUser) -> ShortList:
    return shorts_service.mine(user)


@router.get("/manage", response_model=ShortList)
def manage_shorts(admin: AdminUser) -> ShortList:
    return shorts_service.manage(admin)


@router.post("", response_model=Short, status_code=201)
def post_short(
    user: CurrentUser,
    caption: Caption,
    video: Annotated[UploadFile | None, File()] = None,
    image: Annotated[UploadFile | None, File()] = None,
) -> Short:
    admin_service.require("shorts", _PAUSED)
    mime, data = _read(video, image)
    short = shorts_service.create(user, caption, mime, data)
    admin_service.log(user.id, user.display_name, "Posted a short", short.caption)
    return short


@router.post("/ads", response_model=Short, status_code=201)
def post_ad(
    admin: AdminUser,
    caption: Caption,
    sponsor: Annotated[str, Form(max_length=80)],
    video: Annotated[UploadFile | None, File()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    cta_label: Annotated[str, Form(max_length=24)] = "",
    cta_url: Annotated[str, Form(max_length=300)] = "",
) -> Short:
    mime, data = _read(video, image)
    ad = {"sponsor": sponsor, "cta_label": cta_label, "cta_url": cta_url}
    short = shorts_service.create(admin, caption, mime, data, ad=ad)
    admin_service.log(admin.id, admin.display_name, "Posted an ad short", short.sponsor)
    return short


@router.patch("/{short_id}", response_model=Short)
def set_status(short_id: str, body: StatusIn, admin: AdminUser) -> Short:
    short = shorts_service.set_status(admin, short_id, body.status)
    action = "Hid a short" if body.status == "hidden" else "Restored a short"
    admin_service.log(admin.id, admin.display_name, action, short.caption)
    return short


@router.delete("/{short_id}", status_code=204)
def remove_short(short_id: str, user: CurrentUser) -> None:
    short = shorts_service.remove(user, short_id)
    if user.role == "admin" and not short.is_mine:
        admin_service.log(user.id, user.display_name, "Removed a short", short.caption)


@router.put("/{short_id}/like", response_model=Short)
def like(short_id: str, user: CurrentUser) -> Short:
    return shorts_service.like(user, short_id, True)


@router.delete("/{short_id}/like", response_model=Short)
def unlike(short_id: str, user: CurrentUser) -> Short:
    return shorts_service.like(user, short_id, False)


@router.post("/{short_id}/view", status_code=204)
def record_view(short_id: str) -> None:
    shorts_service.record_view(short_id)


@router.post("/{short_id}/click", status_code=204)
def record_click(short_id: str) -> None:
    shorts_service.record_click(short_id)


@router.get("/videos/{video_id}")
def video(video_id: str, range_header: Annotated[str | None, Header(alias="range")] = None) -> Response:
    status, headers, body = shorts_service.video(video_id, range_header)
    media_type = headers.pop("Content-Type", None)
    return Response(content=body, status_code=status, media_type=media_type, headers=headers)

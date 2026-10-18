from typing import Annotated

from fastapi import APIRouter, File, Header, Response, UploadFile

from app.modules.identity.router import CurrentUser
from app.modules.media.schemas import MediaItem
from app.modules.media.service import MAX_UPLOAD_BYTES, media_service

router = APIRouter(prefix="/media", tags=["media"])


@router.post("", response_model=MediaItem, status_code=201)
def upload(user: CurrentUser, file: Annotated[UploadFile, File()]) -> MediaItem:
    return media_service.upload(user.id, file.file.read(MAX_UPLOAD_BYTES + 1))


@router.get("/{media_id}")
def serve(media_id: str, range_header: Annotated[str | None, Header(alias="range")] = None) -> Response:
    status, headers, body = media_service.serve(media_id, range_header)
    media_type = headers.pop("Content-Type", None)
    return Response(content=body, status_code=status, media_type=media_type, headers=headers)

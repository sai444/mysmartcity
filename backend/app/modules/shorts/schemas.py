from typing import Literal

from pydantic import BaseModel, ConfigDict

Kind = Literal["user", "ad"]
Status = Literal["live", "hidden"]
MediaKind = Literal["video", "image"]


class Short(BaseModel):
    id: str
    kind: Kind
    status: Status
    caption: str
    media_kind: MediaKind = "video"
    video_url: str
    author_id: str
    author_name: str
    sponsor: str
    cta_label: str
    cta_url: str
    views: int
    clicks: int
    like_count: int
    liked: bool
    is_mine: bool
    created_at: str


class ShortList(BaseModel):
    data: list[Short]


class StatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Status

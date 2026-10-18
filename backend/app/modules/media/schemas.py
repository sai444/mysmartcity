from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

MediaKind = Literal["image", "video"]
MediaId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")]


class MediaItem(BaseModel):
    id: str
    kind: MediaKind
    url: str

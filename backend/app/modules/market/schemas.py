import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.media.schemas import MediaId, MediaItem

Category = Literal["furniture", "electronics", "home", "books", "clothing", "kids", "sports", "homemade", "other"]
Condition = Literal["new", "like_new", "good", "fair"]
ListingStatus = Literal["active", "paused", "sold_out"]
OrderStatus = Literal["placed", "accepted", "completed", "declined", "cancelled"]
OrderAction = Literal["accept", "decline", "cancel", "complete"]
Sort = Literal["newest", "price_low", "price_high", "rating"]

MAX_PHOTOS = 4
MAX_MEDIA = 8
PHOTO_DATA_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$")
PHOTO_ID = re.compile(r"^[0-9a-f]{32}$")


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def _check_photos(value: object, allow_ids: bool) -> object:
    if not isinstance(value, list):
        return value
    if len(value) > MAX_PHOTOS:
        raise ValueError(f"Add up to {MAX_PHOTOS} photos.")
    for photo in value:
        if not isinstance(photo, str) or len(photo) > 600_000:
            raise ValueError("Each photo must be under 450 KB.")
        if PHOTO_DATA_URL.match(photo) or (allow_ids and PHOTO_ID.match(photo)):
            continue
        raise ValueError("Use JPEG, PNG, or WebP photos.")
    return value


class ListingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=1, max_length=1000)
    category: Category = "other"
    condition: Condition = "good"
    price_paise: int = Field(ge=100, le=10_000_000)
    quantity: int = Field(default=1, ge=1, le=999)
    pickup_area: str = Field(default="", max_length=120)
    photos: list[str] = Field(default_factory=list)
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_MEDIA)

    @field_validator("title", "description", "pickup_area", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)

    @field_validator("photos", mode="before")
    @classmethod
    def check_photos(cls, value: object) -> object:
        return _check_photos(value, allow_ids=False)


class ListingPatch(BaseModel):
    """Photos may mix existing photo ids (kept, in the given order) with new data URLs."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=80)
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    category: Category | None = None
    condition: Condition | None = None
    price_paise: int | None = Field(default=None, ge=100, le=10_000_000)
    quantity: int | None = Field(default=None, ge=0, le=999)
    pickup_area: str | None = Field(default=None, max_length=120)
    photos: list[str] | None = None
    media: list[MediaId] | None = Field(default=None, max_length=MAX_MEDIA)
    status: Literal["active", "paused"] | None = None

    @field_validator("title", "description", "pickup_area", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)

    @field_validator("photos", mode="before")
    @classmethod
    def check_photos(cls, value: object) -> object:
        return _check_photos(value, allow_ids=True)


class Photo(BaseModel):
    id: str
    url: str


class ListingSummary(BaseModel):
    id: str
    title: str
    category: Category
    condition: Condition
    price_paise: int
    quantity: int
    status: ListingStatus
    ward_id: str | None
    ward_name: str
    seller_id: str
    seller_name: str
    cover_url: str | None
    rating_avg: float | None
    review_count: int
    open_orders: int = 0
    created_at: str


class ListingList(BaseModel):
    data: list[ListingSummary]


class Review(BaseModel):
    id: str
    reviewer_id: str
    reviewer_name: str
    rating: int
    comment: str
    created_at: str
    updated_at: str


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=600)

    @field_validator("comment", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)


class SellerSummary(BaseModel):
    id: str
    name: str
    rating_avg: float | None
    review_count: int
    active_listings: int
    completed_sales: int


class Viewer(BaseModel):
    is_seller: bool = False
    can_review: bool = False
    open_order_id: str | None = None
    my_review: Review | None = None


class ListingDetail(ListingSummary):
    description: str
    pickup_area: str
    photos: list[Photo]
    media: list[MediaItem] = []
    updated_at: str
    reviews: list[Review]
    seller: SellerSummary
    viewer: Viewer


class OrderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(default=1, ge=1, le=999)
    note: str = Field(default="", max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)


class OrderActionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: OrderAction
    note: str = Field(default="", max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)


class Order(BaseModel):
    id: str
    listing_id: str
    title: str
    cover_url: str | None
    price_paise: int
    quantity: int
    total_paise: int
    buyer_id: str
    buyer_name: str
    seller_id: str
    seller_name: str
    note: str
    seller_note: str
    status: OrderStatus
    reviewed: bool = False
    created_at: str
    updated_at: str


class OrderBook(BaseModel):
    buying: list[Order]
    selling: list[Order]

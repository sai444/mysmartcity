import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.media.schemas import MediaId, MediaItem

MAX_SHOP_MEDIA = 10
MAX_ITEM_MEDIA = 6

Category = Literal["grocery", "restaurant", "pharmacy", "services", "general"]
ShopStatus = Literal["pending", "approved", "rejected", "disabled"]


class CatalogItem(BaseModel):
    id: str
    name: str
    description: str
    price_paise: int
    is_available: bool
    image: str | None = None
    media: list[MediaItem] = []


_IMAGE_DATA_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$")


class CatalogItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=200)
    price_paise: int = Field(ge=0, le=10_000_000)
    is_available: bool = True
    image: str | None = Field(default=None, max_length=400_000)
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_ITEM_MEDIA)

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("image", mode="before")
    @classmethod
    def check_image(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip() or None
        if isinstance(value, str) and not _IMAGE_DATA_URL.match(value):
            raise ValueError("Use a JPEG, PNG, or WebP photo.")
        return value


class ServiceOffering(BaseModel):
    id: str
    name: str
    description: str
    price_paise: int | None
    duration_minutes: int | None
    is_available: bool


class ServiceOfferingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=200)
    price_paise: int | None = Field(default=None, ge=0, le=10_000_000)
    duration_minutes: int | None = Field(default=None, ge=5, le=1440)
    is_available: bool = True

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class BusinessCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=80)
    category: Category
    ward_id: str
    address_text: str = Field(min_length=3, max_length=160)
    phone: str | None = Field(default=None, max_length=20)
    opening_hours: str = Field(min_length=3, max_length=80)
    about: str = Field(min_length=8, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    catalog: list[CatalogItemIn] = Field(default_factory=list, max_length=40)
    services: list[ServiceOfferingIn] = Field(default_factory=list, max_length=40)
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_SHOP_MEDIA)

    @model_validator(mode="after")
    def has_listing(self) -> "BusinessCreate":
        if not self.catalog and not self.services:
            raise ValueError("List at least one catalog item or service.")
        return self

    @field_validator("name", "address_text", "opening_hours", "about", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def empty_phone(cls, value: object) -> object:
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return value

    @field_validator("ward_id", mode="before")
    @classmethod
    def strip_ward(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class BusinessProfile(BaseModel):
    id: str
    slug: str
    name: str
    category: str
    ward_id: str
    ward_name: str
    address_text: str
    phone: str | None
    opening_hours: str
    about: str
    latitude: float
    longitude: float
    profile_path: str
    owned: bool = False
    status: ShopStatus = "approved"
    review_note: str | None = None
    media: list[MediaItem] = []
    catalog: list[CatalogItem]
    services: list[ServiceOffering] = []


class BusinessList(BaseModel):
    data: list[BusinessProfile]


class ShopMediaIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media: list[MediaId] = Field(max_length=MAX_SHOP_MEDIA)


class ShopStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "disabled"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class AvailabilityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_available: bool

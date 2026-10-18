import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.media.schemas import MediaId, MediaItem

MAX_MEDIA = 12

PropertyType = Literal["flat", "house", "plot", "commercial", "farmland"]
ListingStatus = Literal["pending", "approved", "under_offer", "sold", "rejected", "disabled", "withdrawn"]
ListerRole = Literal["owner", "broker", "admin"]
OfferStatus = Literal["pending", "accepted", "declined", "withdrawn", "completed", "cancelled"]
BrokerStatus = Literal["pending", "approved", "rejected", "revoked"]

_IMAGE_DATA_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$")
_PHONE = re.compile(r"^[0-9+\- ]{7,20}$")


def _strip(value: object) -> object:
    if isinstance(value, str):
        return value.strip()
    return value


def _check_phone(value: str | None) -> str | None:
    if value is not None and not _PHONE.match(value):
        raise ValueError("Enter a phone number with digits only.")
    return value


class PropertyWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=4, max_length=100)
    property_type: PropertyType
    ward_id: str
    address_text: str = Field(min_length=3, max_length=160)
    area_sqft: int = Field(ge=50, le=10_000_000)
    bedrooms: int | None = Field(default=None, ge=0, le=20)
    price_paise: int = Field(ge=100_000, le=100_000_000_000_000)
    description: str = Field(min_length=10, max_length=1500)
    contact_phone: str = Field(min_length=7, max_length=20)
    list_as: Literal["owner", "broker", "admin"] = "owner"
    owner_name: str | None = Field(default=None, max_length=80)
    commission_pct: float | None = Field(default=None, ge=0, le=10)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    image: str | None = Field(default=None, max_length=400_000)
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_MEDIA)

    @field_validator("title", "address_text", "description", "contact_phone", "ward_id", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)

    @field_validator("owner_name", mode="before")
    @classmethod
    def empty_owner(cls, value: object) -> object:
        value = _strip(value)
        return value or None

    @field_validator("contact_phone")
    @classmethod
    def phone_digits(cls, value: str) -> str:
        return _check_phone(value) or value

    @field_validator("image", mode="before")
    @classmethod
    def check_image(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip() or None
        if isinstance(value, str) and not _IMAGE_DATA_URL.match(value):
            raise ValueError("Use a JPEG, PNG, or WebP photo.")
        return value

    @model_validator(mode="after")
    def broker_needs_owner(self) -> "PropertyWrite":
        if self.list_as == "broker" and not self.owner_name:
            raise ValueError("Brokers must name the property owner.")
        if self.list_as != "broker":
            self.commission_pct = None
        return self


class Property(BaseModel):
    id: str
    title: str
    property_type: PropertyType
    ward_id: str
    ward_name: str
    address_text: str
    area_sqft: int
    bedrooms: int | None
    price_paise: int
    description: str
    image: str | None
    media: list[MediaItem] = []
    lister_role: ListerRole
    lister_name: str
    agency_name: str | None
    owner_name: str | None
    commission_pct: float | None
    latitude: float
    longitude: float
    status: ListingStatus
    review_note: str | None
    sold_price_paise: int | None
    offer_count: int = 0
    created_at: str
    mine: bool = False
    contact_phone: str | None = None


class PropertyList(BaseModel):
    data: list[Property]


class Offer(BaseModel):
    id: str
    property_id: str
    buyer_name: str
    buyer_phone: str | None
    amount_paise: int
    message: str
    status: OfferStatus
    seller_note: str | None
    created_at: str
    updated_at: str


class OfferWithProperty(Offer):
    property: Property
    seller_phone: str | None = None


class OfferList(BaseModel):
    data: list[OfferWithProperty]


class ManagedProperty(Property):
    offers: list[Offer] = []


class ManagedPropertyList(BaseModel):
    data: list[ManagedProperty]


class OfferIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_paise: int = Field(ge=100_000, le=100_000_000_000_000)
    phone: str = Field(min_length=7, max_length=20)
    message: str = Field(default="", max_length=500)

    @field_validator("phone", "message", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)

    @field_validator("phone")
    @classmethod
    def phone_digits(cls, value: str) -> str:
        return _check_phone(value) or value


class OfferDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["accept", "decline"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        value = _strip(value)
        return value or None


class CompleteSale(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sold_price_paise: int | None = Field(default=None, ge=100_000, le=100_000_000_000_000)


class PropertyStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "disabled"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        value = _strip(value)
        return value or None


class BrokerApply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agency_name: str = Field(min_length=2, max_length=80)
    license_no: str = Field(min_length=4, max_length=40)
    phone: str = Field(min_length=7, max_length=20)
    about: str = Field(default="", max_length=400)

    @field_validator("agency_name", "license_no", "phone", "about", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return _strip(value)

    @field_validator("phone")
    @classmethod
    def phone_digits(cls, value: str) -> str:
        return _check_phone(value) or value


class Broker(BaseModel):
    user_id: str
    display_name: str
    agency_name: str
    license_no: str
    phone: str
    about: str
    status: BrokerStatus
    review_note: str | None
    created_at: str


class BrokerMe(BaseModel):
    broker: Broker | None


class BrokerList(BaseModel):
    data: list[Broker]


class BrokerStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "revoked"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        value = _strip(value)
        return value or None

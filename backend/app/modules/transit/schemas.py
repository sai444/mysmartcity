from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.media.schemas import MediaId, MediaItem

MAX_MEDIA = 8

Kind = Literal["bus", "metro", "auto", "taxi", "boat"]


class Vehicle(BaseModel):
    id: str
    name: str
    kind: str
    registration: str
    origin: str
    destination: str
    price_paise: int
    seats: int
    phone: str
    contact_name: str
    minutes: int
    departures: str
    notes: str
    is_active: bool
    media: list[MediaItem] = []


class VehicleList(BaseModel):
    data: list[Vehicle]


class VehicleWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=80)
    kind: Kind
    registration: str = Field(min_length=2, max_length=20)
    origin: str = Field(min_length=2, max_length=80)
    destination: str = Field(min_length=2, max_length=80)
    price_paise: int = Field(ge=0, le=100_000_00)
    seats: int = Field(ge=1, le=200)
    phone: str = Field(min_length=6, max_length=20)
    contact_name: str = Field(min_length=2, max_length=80)
    minutes: int = Field(ge=1, le=300)
    departures: str = Field(min_length=3, max_length=120)
    notes: str = Field(default="", max_length=300)
    is_active: bool = True
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_MEDIA)

    @field_validator("name", "registration", "origin", "destination", "phone", "contact_name", "departures", "notes", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def different_ends(self) -> "VehicleWrite":
        if self.origin.casefold() == self.destination.casefold():
            raise ValueError("Pick two different places.")
        return self


ChargeKind = Literal["all", "bus", "metro", "auto", "taxi", "boat"]
ChargeType = Literal["fixed", "per_km", "percent"]


class FareRule(BaseModel):
    kind: Kind
    base_paise: int
    included_km: float
    per_km_paise: int
    per_minute_paise: int
    min_paise: int
    night_surcharge_pct: int
    night_start: str
    night_end: str
    per_seat: bool
    speed_kmh: int


class FareRuleWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_paise: int = Field(ge=0, le=100_000_00)
    included_km: float = Field(ge=0, le=50)
    per_km_paise: int = Field(ge=0, le=10_000_00)
    per_minute_paise: int = Field(ge=0, le=10_000_00)
    min_paise: int = Field(ge=0, le=100_000_00)
    night_surcharge_pct: int = Field(ge=0, le=100)
    night_start: str = Field(pattern=r"^\d{2}:\d{2}$")
    night_end: str = Field(pattern=r"^\d{2}:\d{2}$")
    per_seat: bool = False
    speed_kmh: int = Field(ge=4, le=80)


class FareCharge(BaseModel):
    id: str
    kind: ChargeKind
    name: str
    amount: int
    charge_type: ChargeType
    is_active: bool


class FareChargeWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ChargeKind
    name: str = Field(min_length=2, max_length=80)
    amount: int = Field(ge=0, le=100_000_00)
    charge_type: ChargeType
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def percent_range(self) -> "FareChargeWrite":
        if self.charge_type == "percent" and self.amount > 100:
            raise ValueError("A percent charge must be between 0 and 100.")
        return self


class FareBook(BaseModel):
    rules: list[FareRule]
    charges: list[FareCharge]


class TripPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = Field(default="", max_length=160)

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class QuoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: TripPoint
    destination: TripPoint
    seats: int = Field(default=1, ge=1, le=8)
    at: str | None = None
    distance_km: float | None = Field(default=None, ge=0.05, le=500)


class MapsConfig(BaseModel):
    provider: Literal["google", "osm"]
    browser_key: str | None = None


class FareLine(BaseModel):
    label: str
    amount_paise: int


class KindQuote(BaseModel):
    kind: Kind
    fare_paise: int
    minutes: int
    per_seat: bool
    night: bool
    breakdown: list[FareLine]
    vehicles: list[Vehicle]


class Quote(BaseModel):
    distance_km: float
    origin: TripPoint
    destination: TripPoint
    seats: int
    quotes: list[KindQuote]


class PlaceHint(BaseModel):
    label: str
    latitude: float
    longitude: float


class PlaceHintList(BaseModel):
    data: list[PlaceHint]

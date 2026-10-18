from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.civic.schemas import CitySystem, Climate, ParkingLot, Ward
from app.modules.media.schemas import MediaId, MediaItem

MAX_REPORT_MEDIA = 4

ReportStatus = Literal["submitted", "in_progress", "resolved", "rejected"]
ReportCategory = Literal["Pothole", "Streetlight", "Water leak", "Garbage", "Drainage", "Missed pickup"]


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: ReportCategory
    place: str = Field(min_length=2, max_length=120)
    details: str = Field(min_length=8, max_length=1000)
    ward_id: str | None = None
    media: list[MediaId] = Field(default_factory=list, max_length=MAX_REPORT_MEDIA)

    _strip_text = field_validator("place", "details", mode="before")(_strip)


class Report(BaseModel):
    id: str
    user_name: str
    ward_id: str | None
    ward_name: str | None
    category: str
    place: str
    details: str
    media: list[MediaItem] = []
    status: ReportStatus
    admin_note: str | None
    created_at: str
    updated_at: str


class ReportList(BaseModel):
    data: list[Report]


class ReportPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReportStatus
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class NoticeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=4, max_length=120)
    body: str = Field(min_length=8, max_length=1000)
    severity: Literal["info", "warning", "emergency"]
    ward_id: str | None = None
    hours: int = Field(default=24, ge=1, le=24 * 30)

    _strip_text = field_validator("title", "body", mode="before")(_strip)

    @field_validator("ward_id", mode="before")
    @classmethod
    def empty_ward(cls, value: object) -> object:
        return None if value == "" else value


class AdminNotice(BaseModel):
    id: str
    ward_id: str | None
    title: str
    body: str
    severity: str
    starts_at: datetime
    ends_at: datetime


class AdminNoticeList(BaseModel):
    data: list[AdminNotice]


PulseKey = Literal["water", "power", "transit", "air"]
PulseState = Literal["steady", "watch", "busy", "halted"]
WasteType = Literal["wet", "dry", "mixed", "none"]
CitySection = Literal["pulse", "climate", "waste"]


class PulseRowIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: PulseKey
    state: PulseState
    detail: str = Field(min_length=2, max_length=60)

    _strip_text = field_validator("detail", mode="before")(_strip)


class PulseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    systems: list[PulseRowIn] = Field(min_length=1, max_length=4)


class ClimateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    temperature_c: float = Field(ge=-20, le=55)
    condition: Literal["clear", "cloudy", "rain", "storm", "heat"]
    humidity_pct: int = Field(ge=0, le=100)
    aqi: int = Field(ge=0, le=500)


class WasteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waste_type: WasteType
    window_label: str = Field(default="", max_length=40)

    @field_validator("window_label", mode="before")
    @classmethod
    def strip_window(cls, value: object) -> object:
        return _strip(value)

    @field_validator("window_label")
    @classmethod
    def needs_window(cls, value: str, info) -> str:
        if info.data.get("waste_type") != "none" and len(value) < 3:
            raise ValueError("Give the collection window, like 07:00–09:00.")
        return value


class ParkingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spaces_free: int = Field(ge=0, le=10000)
    is_open: bool


class WasteSetting(BaseModel):
    waste_type: WasteType
    window_label: str


FacilityKind = Literal["clinic", "park", "toilet", "ev_charger", "ward_office"]


class AdminWard(BaseModel):
    id: str
    name: str
    code: str
    latitude: float
    longitude: float
    active: bool
    facility_count: int
    parking_count: int


class AdminWardList(BaseModel):
    data: list[AdminWard]


class WardIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=60)
    code: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9-]+$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    _strip_text = field_validator("name", "code", mode="before")(_strip)

    @field_validator("code")
    @classmethod
    def upper_code(cls, value: str) -> str:
        return value.upper()


class WardPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=60)
    code: str | None = Field(default=None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9-]+$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    active: bool | None = None

    _strip_text = field_validator("name", "code", mode="before")(_strip)

    @field_validator("code")
    @classmethod
    def upper_code(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class FacilityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ward_id: str
    kind: FacilityKind
    name: str = Field(min_length=2, max_length=80)
    address_text: str = Field(min_length=2, max_length=160)
    opening_hours: str = Field(min_length=2, max_length=60)
    phone: str | None = Field(default=None, max_length=30)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    _strip_text = field_validator("name", "address_text", "opening_hours", mode="before")(_strip)

    @field_validator("phone", mode="before")
    @classmethod
    def empty_phone(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class ParkingLotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ward_id: str
    name: str = Field(min_length=2, max_length=80)
    address_text: str = Field(min_length=2, max_length=160)
    capacity: int = Field(ge=1, le=10000)
    spaces_free: int = Field(ge=0, le=10000)
    price_paise_per_hour: int = Field(ge=0, le=1_000_000)
    is_open: bool = True
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    _strip_text = field_validator("name", "address_text", mode="before")(_strip)


class WardControls(BaseModel):
    ward: Ward
    systems: list[CitySystem]
    climate: Climate | None
    waste: WasteSetting
    parking: list[ParkingLot]
    customized: list[CitySection]

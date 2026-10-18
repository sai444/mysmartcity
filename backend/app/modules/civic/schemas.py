from datetime import datetime

from pydantic import BaseModel, Field


class Ward(BaseModel):
    id: str
    name: str
    code: str


class ForecastDay(BaseModel):
    date: str
    condition: str
    temperature_max_c: float
    temperature_min_c: float
    rain_chance_pct: int | None = None


class Climate(BaseModel):
    temperature_c: float
    condition: str
    humidity_pct: int
    aqi: int
    aqi_category: str
    recorded_at: datetime
    feels_like_c: float | None = None
    wind_kmh: float | None = None
    rain_chance_pct: int | None = None
    source: str = "desk"
    latitude: float | None = None
    longitude: float | None = None
    forecast: list[ForecastDay] = Field(default_factory=list)


class Notice(BaseModel):
    id: str
    ward_id: str | None
    title: str
    body: str
    severity: str
    starts_at: datetime
    ends_at: datetime


class WasteWindow(BaseModel):
    weekday: int
    waste_type: str
    window_label: str


class ParkingLot(BaseModel):
    id: str
    ward_id: str
    name: str
    address_text: str
    capacity: int
    spaces_free: int
    price_paise_per_hour: int
    is_open: bool
    latitude: float
    longitude: float


class Facility(BaseModel):
    id: str
    ward_id: str
    kind: str
    name: str
    address_text: str
    opening_hours: str
    phone: str | None
    latitude: float
    longitude: float


class GeoPoint(BaseModel):
    latitude: float
    longitude: float


class MapPlace(BaseModel):
    id: str
    kind: str
    subtype: str
    name: str
    address_text: str
    detail: str
    latitude: float
    longitude: float
    href: str | None = None


class CityMap(BaseModel):
    center: GeoPoint
    zoom: int
    places: list[MapPlace]


class PageMeta(BaseModel):
    limit: int
    offset: int
    total: int


class CitySystem(BaseModel):
    key: str
    label: str
    state: str
    detail: str


class CityHome(BaseModel):
    ward: Ward
    systems: list[CitySystem]
    climate: Climate | None
    notices: list[Notice]
    waste_today: list[WasteWindow]
    parking_open_count: int
    facility_count: int
    due_bill_count: int | None = None


class WardList(BaseModel):
    data: list[Ward]
    meta: PageMeta


class NoticeList(BaseModel):
    data: list[Notice]
    meta: PageMeta


class WasteList(BaseModel):
    data: list[WasteWindow]


class ParkingList(BaseModel):
    data: list[ParkingLot]
    meta: PageMeta


class FacilityList(BaseModel):
    data: list[Facility]
    meta: PageMeta


class Health(BaseModel):
    status: str = Field(examples=["ok"])
    service: str

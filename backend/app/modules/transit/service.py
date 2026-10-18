import json
import math
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.identity.store import UserRecord
from app.modules.media.service import media_service
from app.modules.transit.schemas import (
    FareBook,
    FareCharge,
    FareChargeWrite,
    FareLine,
    FareRule,
    FareRuleWrite,
    KindQuote,
    MapsConfig,
    PlaceHint,
    PlaceHintList,
    Quote,
    QuoteIn,
    TripPoint,
    Vehicle,
    VehicleList,
    VehicleWrite,
)
from app.modules.transit.store import TransitStore

_CITY = ZoneInfo("Asia/Kolkata")
_NOMINATIM = "https://nominatim.openstreetmap.org"
_GOOGLE = "https://maps.googleapis.com"
_VIEWBOX = "77.40,13.20,77.80,12.85"
_EARTH_KM = 6371.0
_KIND_ORDER = ("auto", "taxi", "bus", "metro", "boat")


def _vehicle(row: dict) -> Vehicle:
    return Vehicle.model_validate({**row, "media": media_service.items(row["media"])})


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_KM * math.asin(min(1.0, math.sqrt(a)))


def _parse_clock(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def _is_night(when: datetime, start: str, end: str) -> bool:
    clock = when.astimezone(_CITY).time()
    begins, closes = _parse_clock(start), _parse_clock(end)
    if begins <= closes:
        return begins <= clock < closes
    return clock >= begins or clock < closes


def _ceil_rupee(paise: int) -> int:
    if paise <= 0:
        return 0
    return ((paise + 99) // 100) * 100


def _quote_kind(rule: dict, charges: list[dict], distance_km: float, when: datetime, seats: int) -> tuple[int, int, bool, list[FareLine]]:
    minutes = max(1, round(distance_km / max(rule["speed_kmh"], 1) * 60))
    extra_km = max(0.0, distance_km - float(rule["included_km"]))
    lines = [
        FareLine(label=f"Base ({rule['included_km']:g} km)", amount_paise=rule["base_paise"]),
    ]
    fare = rule["base_paise"]
    if extra_km > 0 and rule["per_km_paise"]:
        distance_fare = round(extra_km * rule["per_km_paise"])
        lines.append(FareLine(label=f"{extra_km:.1f} km beyond included", amount_paise=distance_fare))
        fare += distance_fare
    if rule["per_minute_paise"]:
        time_fare = minutes * rule["per_minute_paise"]
        lines.append(FareLine(label=f"{minutes} min", amount_paise=time_fare))
        fare += time_fare
    for charge in charges:
        if charge["kind"] not in ("all", rule["kind"]) or not charge["is_active"]:
            continue
        if charge["charge_type"] == "fixed":
            amount = charge["amount"]
        elif charge["charge_type"] == "per_km":
            amount = round(distance_km * charge["amount"])
        else:
            amount = round(fare * charge["amount"] / 100)
        if amount:
            lines.append(FareLine(label=charge["name"], amount_paise=amount))
            fare += amount
    night = rule["night_surcharge_pct"] > 0 and _is_night(when, rule["night_start"], rule["night_end"])
    if night:
        extra = round(fare * rule["night_surcharge_pct"] / 100)
        lines.append(FareLine(label=f"Night {rule['night_surcharge_pct']}%", amount_paise=extra))
        fare += extra
    if fare < rule["min_paise"]:
        bump = rule["min_paise"] - fare
        lines.append(FareLine(label="Minimum fare", amount_paise=bump))
        fare = rule["min_paise"]
    fare = _ceil_rupee(fare)
    if rule["per_seat"] and seats > 1:
        lines.append(FareLine(label=f"{seats} seats", amount_paise=fare * (seats - 1)))
        fare *= seats
    return fare, minutes, night, lines


class TransitService:
    def __init__(self) -> None:
        self._store: TransitStore | None = None

    @property
    def store(self) -> TransitStore:
        if self._store is None:
            self._store = TransitStore(settings.transit_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = TransitStore(path)

    def list_public(self) -> VehicleList:
        return VehicleList(data=[_vehicle(row) for row in self.store.list_rows(active_only=True)])

    def list_managed(self) -> VehicleList:
        return VehicleList(data=[_vehicle(row) for row in self.store.list_rows(active_only=False)])

    def create(self, user: UserRecord, body: VehicleWrite) -> Vehicle:
        vehicle_id = self.store.insert({**body.model_dump(), "media": media_service.refs(user.id, body.media)})
        return self._require(vehicle_id)

    def update(self, user: UserRecord, vehicle_id: str, body: VehicleWrite) -> Vehicle:
        row = self.store.get(vehicle_id)
        if row is None:
            raise ApiError(404, "not_found", "Vehicle not found.")
        media = media_service.refs(user.id, body.media, row["media"])
        if not self.store.update(vehicle_id, {**body.model_dump(), "media": media}):
            raise ApiError(404, "not_found", "Vehicle not found.")
        return self._require(vehicle_id)

    def delete(self, vehicle_id: str) -> None:
        if not self.store.delete(vehicle_id):
            raise ApiError(404, "not_found", "Vehicle not found.")

    def fares(self) -> FareBook:
        rules = [FareRule.model_validate(row) for row in self.store.list_rules()]
        rules.sort(key=lambda item: _KIND_ORDER.index(item.kind) if item.kind in _KIND_ORDER else 99)
        return FareBook(rules=rules, charges=[FareCharge.model_validate(row) for row in self.store.list_charges()])

    def update_rule(self, kind: str, body: FareRuleWrite) -> FareRule:
        if self.store.get_rule(kind) is None:
            raise ApiError(404, "not_found", "No fare rule for that vehicle kind.")
        if not self.store.update_rule(kind, body.model_dump()):
            raise ApiError(404, "not_found", "No fare rule for that vehicle kind.")
        return FareRule.model_validate(self.store.get_rule(kind))

    def add_charge(self, body: FareChargeWrite) -> FareCharge:
        charge_id = self.store.insert_charge(body.model_dump())
        row = self.store.get_charge(charge_id)
        if row is None:
            raise ApiError(500, "charge_not_stored", "The charge could not be saved.")
        return FareCharge.model_validate(row)

    def update_charge(self, charge_id: str, body: FareChargeWrite) -> FareCharge:
        if not self.store.update_charge(charge_id, body.model_dump()):
            raise ApiError(404, "not_found", "Charge not found.")
        return FareCharge.model_validate(self.store.get_charge(charge_id))

    def delete_charge(self, charge_id: str) -> None:
        if not self.store.delete_charge(charge_id):
            raise ApiError(404, "not_found", "Charge not found.")

    def maps_config(self) -> MapsConfig:
        key = _google_key()
        if key:
            return MapsConfig(provider="google", browser_key=key)
        return MapsConfig(provider="osm", browser_key=None)

    def quote(self, body: QuoteIn) -> Quote:
        if body.distance_km is not None:
            distance = float(body.distance_km)
        else:
            distance = haversine_km(
                body.origin.latitude,
                body.origin.longitude,
                body.destination.latitude,
                body.destination.longitude,
            )
        if distance < 0.05:
            raise ApiError(422, "same_place", "Pick two different places on the map.")
        distance_km = round(distance, 2)
        when = _parse_when(body.at)
        charges = self.store.list_charges()
        vehicles = [_vehicle(row) for row in self.store.list_rows(active_only=True)]
        quotes: list[KindQuote] = []
        for rule in self.store.list_rules():
            fare, minutes, night, lines = _quote_kind(rule, charges, distance_km, when, body.seats)
            quotes.append(
                KindQuote(
                    kind=rule["kind"],
                    fare_paise=fare,
                    minutes=minutes,
                    per_seat=bool(rule["per_seat"]),
                    night=night,
                    breakdown=lines,
                    vehicles=[item for item in vehicles if item.kind == rule["kind"]],
                )
            )
        quotes.sort(key=lambda item: _KIND_ORDER.index(item.kind) if item.kind in _KIND_ORDER else 99)
        origin = body.origin.model_copy(update={"label": body.origin.label or "Pickup"})
        destination = body.destination.model_copy(update={"label": body.destination.label or "Drop"})
        return Quote(distance_km=distance_km, origin=origin, destination=destination, seats=body.seats, quotes=quotes)

    def search_places(self, query: str) -> PlaceHintList:
        q = query.strip()
        if len(q) < 2:
            raise ApiError(422, "short_query", "Type at least two letters to search.")
        google_rows = _google_geocode(
            {
                "address": q,
                "region": "in",
                "language": "en",
                "bounds": "12.80,77.40|13.20,77.80",
            }
        )
        if google_rows:
            return PlaceHintList(data=google_rows)
        rows = _nominatim("/search", {"q": q, "limit": "6", "viewbox": _VIEWBOX, "bounded": "1"})
        return PlaceHintList(data=[_hint(row) for row in rows if _hint(row)])

    def reverse_place(self, latitude: float, longitude: float) -> PlaceHint:
        google_rows = _google_geocode(
            {
                "latlng": f"{latitude:.6f},{longitude:.6f}",
                "language": "en",
            }
        )
        if google_rows:
            return google_rows[0]
        rows = _nominatim("/reverse", {"lat": f"{latitude:.6f}", "lon": f"{longitude:.6f}"})
        if rows:
            found = _hint(rows[0])
            if found:
                return found
        return PlaceHint(label=f"{latitude:.5f}, {longitude:.5f}", latitude=latitude, longitude=longitude)

    def _require(self, vehicle_id: str) -> Vehicle:
        row = self.store.get(vehicle_id)
        if row is None:
            raise ApiError(500, "vehicle_not_stored", "The vehicle could not be saved.")
        return _vehicle(row)


def _parse_when(value: str | None) -> datetime:
    if not value:
        return datetime.now(_CITY)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ApiError(422, "bad_time", "Use an ISO date and time.") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=_CITY)
    return parsed.astimezone(_CITY)


def _google_key() -> str:
    return settings.google_maps_api_key.strip()


def _google_geocode(params: dict[str, str]) -> list[PlaceHint]:
    key = _google_key()
    if not key:
        return []
    query = urllib.parse.urlencode({**params, "key": key})
    request = urllib.request.Request(f"{_GOOGLE}/maps/api/geocode/json?{query}")
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return []
    if not isinstance(payload, dict) or payload.get("status") not in {"OK", "ZERO_RESULTS"}:
        return []
    hints: list[PlaceHint] = []
    for row in payload.get("results") or []:
        if not isinstance(row, dict):
            continue
        location = ((row.get("geometry") or {}).get("location") or {})
        try:
            latitude = float(location["lat"])
            longitude = float(location["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        label = str(row.get("formatted_address") or "").strip()
        if not label:
            continue
        if len(label) > 160:
            label = label[:157] + "…"
        hints.append(PlaceHint(label=label, latitude=latitude, longitude=longitude))
        if len(hints) >= 6:
            break
    return hints


def _nominatim(path: str, params: dict[str, str]) -> list[dict]:
    query = urllib.parse.urlencode({**params, "format": "jsonv2", "addressdetails": "0"})
    request = urllib.request.Request(
        f"{_NOMINATIM}{path}?{query}",
        headers={"User-Agent": "MyNagari/1.0 (city travel)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return []
    if isinstance(payload, dict):
        return [payload] if payload.get("lat") else []
    return payload if isinstance(payload, list) else []


def _hint(row: dict) -> PlaceHint | None:
    try:
        latitude = float(row["lat"])
        longitude = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    label = str(row.get("display_name") or row.get("name") or "").strip()
    if not label:
        return None
    if len(label) > 160:
        label = label[:157] + "…"
    return PlaceHint(label=label, latitude=latitude, longitude=longitude)


transit_service = TransitService()

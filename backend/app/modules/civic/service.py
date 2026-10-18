from datetime import date, datetime, timezone

from app.core.errors import ApiError
from app.core.pagination import page
from app.modules.civic.schemas import (
    CityHome,
    CityMap,
    CitySystem,
    Climate,
    Facility,
    FacilityList,
    GeoPoint,
    MapPlace,
    Notice,
    NoticeList,
    PageMeta,
    ParkingList,
    ParkingLot,
    Ward,
    WardList,
    WasteList,
    WasteWindow,
)
from app.modules.civic.controls import city_controls
from app.modules.civic.desk import desk_service
from app.modules.civic.directory import directory
from app.modules.civic.seed import CITY_CENTER
from app.modules.civic.weather import weather_client


class CityService:
    """Read model for city home. Replace the seed lookups with SQL LIMIT queries later."""

    def list_wards(self, limit: int = 20, offset: int = 0) -> WardList:
        rows, meta = page(directory.wards(), limit, offset)
        return WardList(data=[Ward.model_validate(row) for row in rows], meta=PageMeta.model_validate(meta))

    def get_home(self, ward_id: str, today: date | None = None, now: datetime | None = None) -> CityHome:
        ward_row = directory.ward(ward_id)
        ward = Ward.model_validate(ward_row)
        day = today or date.today()
        climate_row = self._climate_for(ward_id, ward_row["latitude"], ward_row["longitude"])
        notices = desk_service.active_notices(ward_id, now)
        waste = city_controls.waste(ward_id, day)
        lots = [lot for lot in city_controls.parking(ward_id) if lot["is_open"] and lot["spaces_free"] > 0]
        places = directory.facilities(ward_id)
        return CityHome(
            ward=ward,
            systems=[CitySystem.model_validate(row) for row in city_controls.pulse(ward_id)],
            climate=Climate.model_validate(climate_row) if climate_row else None,
            notices=[Notice.model_validate(notice) for notice in notices],
            waste_today=[WasteWindow.model_validate(row) for row in waste],
            parking_open_count=len(lots),
            facility_count=len(places),
            due_bill_count=None,
        )

    def get_climate(self, ward_id: str) -> Climate:
        row = self.weather_for_ward(ward_id)
        if row is None:
            raise ApiError(404, "climate_unavailable", "Climate is not available for this ward yet.")
        return row

    def weather_for_ward(self, ward_id: str) -> Climate | None:
        ward_row = directory.ward(ward_id)
        row = self._climate_for(ward_id, ward_row["latitude"], ward_row["longitude"])
        return Climate.model_validate(row) if row else None

    def weather_for_point(self, latitude: float, longitude: float, ward_id: str | None = None) -> Climate:
        live = weather_client.for_point(latitude, longitude)
        if live:
            return Climate.model_validate(live)
        if ward_id:
            fallback = city_controls.climate(ward_id)
            if fallback:
                return Climate.model_validate(
                    {**fallback, "latitude": latitude, "longitude": longitude, "source": fallback.get("source", "desk")}
                )
        raise ApiError(404, "climate_unavailable", "Live weather is not available for this point yet.")

    def _climate_for(self, ward_id: str, latitude: float, longitude: float) -> dict | None:
        live = weather_client.for_point(latitude, longitude)
        if live:
            return live
        stored = city_controls.climate(ward_id)
        if stored is None:
            return None
        return {**stored, "latitude": latitude, "longitude": longitude}

    def list_notices(self, ward_id: str, limit: int = 20, offset: int = 0, now: datetime | None = None) -> NoticeList:
        self._ward(ward_id)
        rows, meta = page(desk_service.active_notices(ward_id, now), limit, offset)
        return NoticeList(data=[Notice.model_validate(row) for row in rows], meta=PageMeta.model_validate(meta))

    def get_notice(self, notice_id: str, now: datetime | None = None) -> Notice:
        clock = now or datetime.now(timezone.utc)
        for notice in desk_service.active_notices(now=clock, any_ward=True):
            if notice["id"] == notice_id:
                return Notice.model_validate(notice)
        raise ApiError(404, "not_found", "Notice not found.")

    def list_waste(self, ward_id: str, today: date | None = None) -> WasteList:
        self._ward(ward_id)
        rows = city_controls.waste(ward_id, today or date.today())
        return WasteList(data=[WasteWindow.model_validate(row) for row in rows])

    def list_parking(self, ward_id: str, q: str = "", limit: int = 20, offset: int = 0) -> ParkingList:
        self._ward(ward_id)
        needle = q.strip().lower()
        rows = [
            lot
            for lot in city_controls.parking(ward_id)
            if lot["is_open"] and (not needle or needle in lot["name"].lower())
        ]
        sliced, meta = page(rows, limit, offset)
        return ParkingList(data=[ParkingLot.model_validate(row) for row in sliced], meta=PageMeta.model_validate(meta))

    def list_map(self, ward_id: str | None = None) -> CityMap:
        from app.modules.business.service import business_service

        open_wards = {ward["id"]: ward for ward in directory.wards()}
        if ward_id:
            self._ward(ward_id)
            center = {key: open_wards[ward_id][key] for key in ("latitude", "longitude")}
            zoom = 15
        else:
            center = CITY_CENTER
            zoom = 13

        places: list[MapPlace] = []
        for place in directory.facilities(ward_id):
            if place["ward_id"] not in open_wards:
                continue
            places.append(
                MapPlace(
                    id=place["id"],
                    kind="facility",
                    subtype=place["kind"],
                    name=place["name"],
                    address_text=place["address_text"],
                    detail=place["opening_hours"],
                    latitude=place["latitude"],
                    longitude=place["longitude"],
                )
            )
        for lot in city_controls.parking(ward_id):
            if not lot["is_open"] or lot["ward_id"] not in open_wards:
                continue
            rupees = lot["price_paise_per_hour"] // 100
            places.append(
                MapPlace(
                    id=lot["id"],
                    kind="parking",
                    subtype="parking",
                    name=lot["name"],
                    address_text=lot["address_text"],
                    detail=f"{lot['spaces_free']} free · ₹{rupees}/hour",
                    latitude=lot["latitude"],
                    longitude=lot["longitude"],
                )
            )
        for shop in business_service.list_public(ward_id):
            places.append(
                MapPlace(
                    id=shop["id"],
                    kind="business",
                    subtype=shop["category"],
                    name=shop["name"],
                    address_text=shop["address_text"],
                    detail=shop["opening_hours"],
                    latitude=shop["latitude"],
                    longitude=shop["longitude"],
                    href=f"/b/{shop['slug']}",
                )
            )
        from app.modules.property.service import property_service

        for listing in property_service.map_rows(ward_id):
            rupees = listing["price_paise"] // 100
            places.append(
                MapPlace(
                    id=listing["id"],
                    kind="property",
                    subtype=listing["property_type"],
                    name=listing["title"],
                    address_text=listing["address_text"],
                    detail=f"₹{rupees:,} · for sale",
                    latitude=listing["latitude"],
                    longitude=listing["longitude"],
                    href=f"/property/{listing['id']}",
                )
            )
        return CityMap(center=GeoPoint.model_validate(center), zoom=zoom, places=places)

    def list_facilities(
        self, ward_id: str, kind: str = "", q: str = "", limit: int = 20, offset: int = 0
    ) -> FacilityList:
        self._ward(ward_id)
        needle = q.strip().lower()
        rows = [
            place
            for place in directory.facilities(ward_id)
            if (not kind or place["kind"] == kind)
            and (not needle or needle in place["name"].lower())
        ]
        sliced, meta = page(rows, limit, offset)
        return FacilityList(
            data=[Facility.model_validate(row) for row in sliced], meta=PageMeta.model_validate(meta)
        )

    def ward(self, ward_id: str) -> Ward:
        return self._ward(ward_id)

    def _ward(self, ward_id: str) -> Ward:
        return Ward.model_validate(directory.ward(ward_id))


city_service = CityService()

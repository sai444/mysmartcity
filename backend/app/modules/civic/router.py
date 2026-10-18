from datetime import date

from fastapi import APIRouter, Query

from app.core.errors import ApiError
from app.modules.civic.schemas import (
    CityHome,
    CityMap,
    Climate,
    FacilityList,
    Notice,
    NoticeList,
    ParkingList,
    WardList,
    WasteList,
)
from app.modules.admin.service import admin_service
from app.modules.civic.desk import desk_service
from app.modules.civic.desk_schemas import Report, ReportIn, ReportList
from app.modules.civic.service import city_service
from app.modules.identity.router import CurrentUser

router = APIRouter(prefix="/city", tags=["city"])


@router.post("/reports", response_model=Report, status_code=201)
def file_report(body: ReportIn, user: CurrentUser) -> Report:
    admin_service.require("reports", "Issue reports are paused by the city admin.")
    ward_id = body.ward_id or user.ward_id
    return Report.model_validate(
        desk_service.file_report(user.id, user.display_name, ward_id, body.category, body.place, body.details, body.media)
    )


@router.get("/reports/mine", response_model=ReportList)
def my_reports(user: CurrentUser) -> ReportList:
    return ReportList(data=[Report.model_validate(row) for row in desk_service.reports_for(user.id)])


@router.get("/wards", response_model=WardList)
def list_wards(limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)) -> WardList:
    return city_service.list_wards(limit, offset)


@router.get("/home", response_model=CityHome)
def city_home(ward_id: str = Query(...)) -> CityHome:
    return city_service.get_home(ward_id, date.today())


@router.get("/climate", response_model=Climate)
def climate(ward_id: str = Query(...)) -> Climate:
    return city_service.get_climate(ward_id)


@router.get("/weather", response_model=Climate)
def weather(
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    ward_id: str | None = Query(None),
) -> Climate:
    if ward_id and latitude is None and longitude is None:
        return city_service.get_climate(ward_id)
    if latitude is None or longitude is None:
        raise ApiError(422, "validation_error", "Pass a ward, or both latitude and longitude.")
    return city_service.weather_for_point(latitude, longitude, ward_id)


@router.get("/notices", response_model=NoticeList)
def notices(
    ward_id: str = Query(...),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
) -> NoticeList:
    return city_service.list_notices(ward_id, limit, offset)


@router.get("/notices/{notice_id}", response_model=Notice)
def notice_detail(notice_id: str) -> Notice:
    return city_service.get_notice(notice_id)


@router.get("/waste", response_model=WasteList)
def waste(ward_id: str = Query(...)) -> WasteList:
    return city_service.list_waste(ward_id)


@router.get("/parking", response_model=ParkingList)
def parking(
    ward_id: str = Query(...),
    q: str = Query(""),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
) -> ParkingList:
    return city_service.list_parking(ward_id, q, limit, offset)


@router.get("/map", response_model=CityMap)
def city_map(ward_id: str | None = Query(None)) -> CityMap:
    return city_service.list_map(ward_id)


@router.get("/facilities", response_model=FacilityList)
def facilities(
    ward_id: str = Query(...),
    kind: str = Query(""),
    q: str = Query(""),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
) -> FacilityList:
    return city_service.list_facilities(ward_id, kind, q, limit, offset)

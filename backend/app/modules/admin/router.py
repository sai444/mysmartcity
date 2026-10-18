from datetime import date

from fastapi import APIRouter, Query

from app.modules.admin.schemas import (
    AdminUserList,
    AdminUserRow,
    AuditList,
    Feature,
    FeatureList,
    FeaturePatch,
    Overview,
    PublicFeatures,
    UserPatch,
)
from app.modules.admin.service import admin_service
from app.modules.business.service import business_service
from app.modules.civic.desk import desk_service
from app.modules.civic.controls import city_controls
from app.modules.civic.desk_schemas import (
    AdminNotice,
    AdminNoticeList,
    AdminWard,
    AdminWardList,
    CitySection,
    ClimateIn,
    FacilityIn,
    NoticeIn,
    ParkingLotIn,
    ParkingPatch,
    PulseIn,
    Report,
    ReportList,
    ReportPatch,
    ReportStatus,
    WardControls,
    WardIn,
    WardPatch,
    WasteIn,
)
from app.modules.civic.directory import directory
from app.modules.civic.schemas import (
    CitySystem,
    Climate,
    Facility,
    FacilityList,
    PageMeta,
    ParkingList,
    ParkingLot,
    Ward,
)
from app.modules.identity.router import AdminUser
from app.modules.identity.service import identity_service
from app.modules.ordering.service import order_service
from app.modules.property.service import property_service
from app.modules.services.service import local_service

features_router = APIRouter(prefix="/features", tags=["features"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

_REPORT_ACTION = {
    "submitted": "Reopened report",
    "in_progress": "Started work on report",
    "resolved": "Resolved report",
    "rejected": "Closed report",
}


@features_router.get("", response_model=PublicFeatures)
def public_features() -> PublicFeatures:
    return PublicFeatures(features=admin_service.flags())


@admin_router.get("/overview", response_model=Overview)
def overview(_admin: AdminUser) -> Overview:
    users = identity_service.list_users()
    features = admin_service.features()
    return Overview(
        users_total=len(users),
        users_disabled=sum(1 for user in users if user["status"] != "active"),
        admins=sum(1 for user in users if user["role"] == "admin"),
        shops=business_service.status_counts(),
        properties=property_service.status_counts(),
        brokers_pending=sum(1 for broker in property_service.list_brokers().data if broker.status == "pending"),
        features_on=sum(1 for feature in features if feature["enabled"]),
        features_total=len(features),
        reports_open=desk_service.open_report_count(),
        notices_active=len(desk_service.active_notices(any_ward=True)),
        orders_open=order_service.open_count(),
        services_pending=local_service.status_counts().get("pending", 0),
    )


@admin_router.get("/features", response_model=FeatureList)
def list_features(_admin: AdminUser) -> FeatureList:
    return FeatureList(data=[Feature.model_validate(row) for row in admin_service.features()])


@admin_router.patch("/features/{key}", response_model=Feature)
def toggle_feature(key: str, body: FeaturePatch, admin: AdminUser) -> Feature:
    feature = admin_service.set_flag(key, body.enabled)
    action = "Turned on" if body.enabled else "Turned off"
    admin_service.log(admin.id, admin.display_name, action, feature["label"])
    return Feature.model_validate(feature)


@admin_router.get("/users", response_model=AdminUserList)
def list_users(_admin: AdminUser) -> AdminUserList:
    return AdminUserList(data=[AdminUserRow.model_validate(row) for row in identity_service.list_users()])


@admin_router.patch("/users/{user_id}", response_model=AdminUserRow)
def update_user(user_id: str, body: UserPatch, admin: AdminUser) -> AdminUserRow:
    row = identity_service.update_user(admin, user_id, body.status, body.role)
    if body.status is not None:
        action = "Enabled user" if body.status == "active" else "Disabled user"
        admin_service.log(admin.id, admin.display_name, action, row["email"])
    if body.role is not None:
        action = "Made admin" if body.role == "admin" else "Made resident"
        admin_service.log(admin.id, admin.display_name, action, row["email"])
    return AdminUserRow.model_validate(row)


@admin_router.get("/reports", response_model=ReportList)
def list_reports(_admin: AdminUser, status: ReportStatus | None = Query(None)) -> ReportList:
    return ReportList(data=[Report.model_validate(row) for row in desk_service.all_reports(status)])


@admin_router.patch("/reports/{report_id}", response_model=Report)
def update_report(report_id: str, body: ReportPatch, admin: AdminUser) -> Report:
    row = desk_service.update_report(report_id, body.status, body.note)
    admin_service.log(admin.id, admin.display_name, _REPORT_ACTION[body.status], f"{row['category']} at {row['place']}")
    return Report.model_validate(row)


@admin_router.get("/notices", response_model=AdminNoticeList)
def list_notices(_admin: AdminUser) -> AdminNoticeList:
    return AdminNoticeList(data=[AdminNotice.model_validate(row) for row in desk_service.active_notices(any_ward=True)])


@admin_router.post("/notices", response_model=AdminNotice, status_code=201)
def publish_notice(body: NoticeIn, admin: AdminUser) -> AdminNotice:
    row = desk_service.publish_notice(admin.id, body.ward_id, body.title, body.body, body.severity, body.hours)
    admin_service.log(admin.id, admin.display_name, "Published notice", body.title)
    return AdminNotice.model_validate(row)


@admin_router.delete("/notices/{notice_id}", status_code=204)
def end_notice(notice_id: str, admin: AdminUser) -> None:
    title = next((row["title"] for row in desk_service.active_notices(any_ward=True) if row["id"] == notice_id), notice_id)
    desk_service.end_notice(notice_id)
    admin_service.log(admin.id, admin.display_name, "Ended notice", title)


_SECTION_LABEL = {"pulse": "city pulse", "climate": "climate", "waste": "waste collection"}


def _controls(ward_id: str) -> WardControls:
    ward = Ward.model_validate(directory.ward(ward_id, include_hidden=True))
    climate = city_controls.climate(ward_id)
    return WardControls(
        ward=ward,
        systems=[CitySystem.model_validate(row) for row in city_controls.pulse(ward_id)],
        climate=Climate.model_validate(climate) if climate else None,
        waste=city_controls.waste_setting(ward_id, date.today()),
        parking=[ParkingLot.model_validate(lot) for lot in city_controls.parking() if lot["ward_id"] == ward_id],
        customized=city_controls.customized(ward_id),
    )


@admin_router.get("/city/{ward_id}", response_model=WardControls)
def city_controls_for(ward_id: str, _admin: AdminUser) -> WardControls:
    return _controls(ward_id)


@admin_router.put("/city/{ward_id}/pulse", response_model=WardControls)
def set_pulse(ward_id: str, body: PulseIn, admin: AdminUser) -> WardControls:
    ward = Ward.model_validate(directory.ward(ward_id, include_hidden=True))
    city_controls.set_pulse(ward_id, [row.model_dump() for row in body.systems])
    admin_service.log(admin.id, admin.display_name, "Updated city pulse", ward.name)
    return _controls(ward_id)


@admin_router.put("/city/{ward_id}/climate", response_model=WardControls)
def set_climate(ward_id: str, body: ClimateIn, admin: AdminUser) -> WardControls:
    ward = Ward.model_validate(directory.ward(ward_id, include_hidden=True))
    city_controls.set_climate(ward_id, body.temperature_c, body.condition, body.humidity_pct, body.aqi)
    admin_service.log(admin.id, admin.display_name, "Updated climate", ward.name)
    return _controls(ward_id)


@admin_router.put("/city/{ward_id}/waste", response_model=WardControls)
def set_waste(ward_id: str, body: WasteIn, admin: AdminUser) -> WardControls:
    ward = Ward.model_validate(directory.ward(ward_id, include_hidden=True))
    city_controls.set_waste(ward_id, body.waste_type, body.window_label)
    admin_service.log(admin.id, admin.display_name, "Updated waste collection", ward.name)
    return _controls(ward_id)


@admin_router.delete("/city/{ward_id}/{section}", response_model=WardControls)
def reset_section(ward_id: str, section: CitySection, admin: AdminUser) -> WardControls:
    ward = Ward.model_validate(directory.ward(ward_id, include_hidden=True))
    city_controls.reset(ward_id, section)
    admin_service.log(admin.id, admin.display_name, f"Reset {_SECTION_LABEL[section]}", ward.name)
    return _controls(ward_id)


@admin_router.patch("/parking/{lot_id}", response_model=WardControls)
def set_parking(lot_id: str, body: ParkingPatch, admin: AdminUser) -> WardControls:
    lot = city_controls.set_parking(lot_id, body.spaces_free, body.is_open)
    action = "Updated parking" if body.is_open else "Closed parking"
    admin_service.log(admin.id, admin.display_name, action, lot["name"])
    return _controls(lot["ward_id"])


def _admin_ward(row: dict) -> AdminWard:
    return AdminWard(
        **{key: row[key] for key in ("id", "name", "code", "latitude", "longitude", "active")},
        facility_count=len(directory.facilities(row["id"])),
        parking_count=len(directory.lots(row["id"])),
    )


def _ward_in_use(ward_id: str) -> int:
    users = sum(1 for user in identity_service.list_users() if user.get("ward_id") == ward_id)
    shops = sum(1 for shop in business_service.list_managed().data if shop.ward_id == ward_id)
    return users + shops


@admin_router.get("/wards", response_model=AdminWardList)
def list_wards(_admin: AdminUser) -> AdminWardList:
    return AdminWardList(data=[_admin_ward(row) for row in directory.wards(include_hidden=True)])


@admin_router.post("/wards", response_model=AdminWard, status_code=201)
def create_ward(body: WardIn, admin: AdminUser) -> AdminWard:
    row = directory.create_ward(body.model_dump())
    admin_service.log(admin.id, admin.display_name, "Added ward", row["name"])
    return _admin_ward(row)


@admin_router.patch("/wards/{ward_id}", response_model=AdminWard)
def update_ward(ward_id: str, body: WardPatch, admin: AdminUser) -> AdminWard:
    before = directory.ward(ward_id, include_hidden=True)
    row = directory.update_ward(ward_id, body.model_dump(exclude_unset=True))
    if body.active is not None and body.active != before["active"]:
        action = "Opened ward" if body.active else "Hid ward"
    else:
        action = "Edited ward"
    admin_service.log(admin.id, admin.display_name, action, row["name"])
    return _admin_ward(row)


@admin_router.delete("/wards/{ward_id}", status_code=204)
def delete_ward(ward_id: str, admin: AdminUser) -> None:
    row = directory.delete_ward(ward_id, _ward_in_use(ward_id))
    admin_service.log(admin.id, admin.display_name, "Removed ward", row["name"])


@admin_router.get("/facilities", response_model=FacilityList)
def list_facilities(_admin: AdminUser, ward_id: str | None = Query(None)) -> FacilityList:
    rows = directory.facilities(ward_id)
    return FacilityList(data=[Facility.model_validate(row) for row in rows], meta=PageMeta(limit=len(rows), offset=0, total=len(rows)))


@admin_router.post("/facilities", response_model=Facility, status_code=201)
def create_facility(body: FacilityIn, admin: AdminUser) -> Facility:
    row = directory.save_facility(body.model_dump())
    admin_service.log(admin.id, admin.display_name, "Added place", row["name"])
    return Facility.model_validate(row)


@admin_router.put("/facilities/{facility_id}", response_model=Facility)
def update_facility(facility_id: str, body: FacilityIn, admin: AdminUser) -> Facility:
    row = directory.save_facility(body.model_dump(), facility_id)
    admin_service.log(admin.id, admin.display_name, "Edited place", row["name"])
    return Facility.model_validate(row)


@admin_router.delete("/facilities/{facility_id}", status_code=204)
def delete_facility(facility_id: str, admin: AdminUser) -> None:
    row = directory.delete_facility(facility_id)
    admin_service.log(admin.id, admin.display_name, "Removed place", row["name"])


@admin_router.get("/parking", response_model=ParkingList)
def list_parking(_admin: AdminUser, ward_id: str | None = Query(None)) -> ParkingList:
    rows = directory.lots(ward_id)
    return ParkingList(data=[ParkingLot.model_validate(row) for row in rows], meta=PageMeta(limit=len(rows), offset=0, total=len(rows)))


@admin_router.post("/parking", response_model=ParkingLot, status_code=201)
def create_parking(body: ParkingLotIn, admin: AdminUser) -> ParkingLot:
    row = directory.save_lot(body.model_dump())
    admin_service.log(admin.id, admin.display_name, "Added parking lot", row["name"])
    return ParkingLot.model_validate(row)


@admin_router.put("/parking/{lot_id}", response_model=ParkingLot)
def update_parking(lot_id: str, body: ParkingLotIn, admin: AdminUser) -> ParkingLot:
    row = directory.save_lot(body.model_dump(), lot_id)
    admin_service.log(admin.id, admin.display_name, "Edited parking lot", row["name"])
    return ParkingLot.model_validate(row)


@admin_router.delete("/parking/{lot_id}", status_code=204)
def delete_parking(lot_id: str, admin: AdminUser) -> None:
    row = directory.delete_lot(lot_id)
    admin_service.log(admin.id, admin.display_name, "Removed parking lot", row["name"])


@admin_router.get("/audit", response_model=AuditList)
def audit(_admin: AdminUser, limit: int = Query(50, ge=1, le=200)) -> AuditList:
    return AuditList(data=admin_service.recent(limit))

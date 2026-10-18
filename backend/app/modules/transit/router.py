from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.errors import ApiError
from app.modules.identity.router import CurrentUser
from app.modules.identity.store import UserRecord
from app.modules.transit.schemas import (
    FareBook,
    FareCharge,
    FareChargeWrite,
    FareRule,
    FareRuleWrite,
    Kind,
    MapsConfig,
    PlaceHint,
    PlaceHintList,
    Quote,
    QuoteIn,
    Vehicle,
    VehicleList,
    VehicleWrite,
)
from app.modules.transit.service import transit_service

router = APIRouter(prefix="/transit", tags=["transit"])


def require_admin(user: CurrentUser) -> UserRecord:
    if user.role != "admin":
        raise ApiError(403, "not_admin", "Sign in as a city admin to change vehicles.")
    return user


AdminUser = Annotated[UserRecord, Depends(require_admin)]


@router.get("/vehicles", response_model=VehicleList)
def public_vehicles() -> VehicleList:
    return transit_service.list_public()


@router.get("/vehicles/manage", response_model=VehicleList)
def managed_vehicles(_admin: AdminUser) -> VehicleList:
    return transit_service.list_managed()


@router.post("/vehicles", response_model=Vehicle, status_code=201)
def add_vehicle(body: VehicleWrite, admin: AdminUser) -> Vehicle:
    return transit_service.create(admin, body)


@router.patch("/vehicles/{vehicle_id}", response_model=Vehicle)
def update_vehicle(vehicle_id: str, body: VehicleWrite, admin: AdminUser) -> Vehicle:
    return transit_service.update(admin, vehicle_id, body)


@router.delete("/vehicles/{vehicle_id}", status_code=204)
def remove_vehicle(vehicle_id: str, _admin: AdminUser) -> None:
    transit_service.delete(vehicle_id)


@router.get("/fares", response_model=FareBook)
def fares() -> FareBook:
    return transit_service.fares()


@router.patch("/fares/{kind}", response_model=FareRule)
def update_fare(kind: Kind, body: FareRuleWrite, _admin: AdminUser) -> FareRule:
    return transit_service.update_rule(kind, body)


@router.post("/fares/charges", response_model=FareCharge, status_code=201)
def add_charge(body: FareChargeWrite, _admin: AdminUser) -> FareCharge:
    return transit_service.add_charge(body)


@router.patch("/fares/charges/{charge_id}", response_model=FareCharge)
def update_charge(charge_id: str, body: FareChargeWrite, _admin: AdminUser) -> FareCharge:
    return transit_service.update_charge(charge_id, body)


@router.delete("/fares/charges/{charge_id}", status_code=204)
def remove_charge(charge_id: str, _admin: AdminUser) -> None:
    transit_service.delete_charge(charge_id)


@router.get("/maps", response_model=MapsConfig)
def maps_config() -> MapsConfig:
    return transit_service.maps_config()


@router.post("/quote", response_model=Quote)
def quote_trip(body: QuoteIn) -> Quote:
    return transit_service.quote(body)


@router.get("/places", response_model=PlaceHintList)
def search_places(q: str = Query(min_length=2, max_length=80)) -> PlaceHintList:
    return transit_service.search_places(q)


@router.get("/places/reverse", response_model=PlaceHint)
def reverse_place(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> PlaceHint:
    return transit_service.reverse_place(latitude, longitude)

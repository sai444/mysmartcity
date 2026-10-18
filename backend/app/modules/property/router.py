from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.core.errors import ApiError
from app.modules.admin.service import admin_service
from app.modules.identity.router import AdminUser, CurrentUser, get_current_user
from app.modules.identity.store import UserRecord
from app.modules.property.schemas import (
    Broker,
    BrokerApply,
    BrokerList,
    BrokerMe,
    BrokerStatusIn,
    CompleteSale,
    ManagedProperty,
    ManagedPropertyList,
    OfferDecision,
    OfferIn,
    OfferList,
    OfferWithProperty,
    Property,
    PropertyList,
    PropertyStatusIn,
    PropertyType,
    PropertyWrite,
)
from app.modules.property.service import property_service

router = APIRouter(prefix="/properties", tags=["properties"])

_PAUSED = "Property listings are paused by the city admin."
_REVIEW_ACTION = {"approved": "Approved property", "rejected": "Rejected property", "disabled": "Disabled property"}
_BROKER_ACTION = {"approved": "Verified broker", "rejected": "Rejected broker", "revoked": "Revoked broker"}


def optional_user(authorization: Annotated[str | None, Header()] = None) -> UserRecord | None:
    if authorization is None:
        return None
    try:
        return get_current_user(authorization)
    except ApiError:
        return None


MaybeUser = Annotated[UserRecord | None, Depends(optional_user)]


def _log_if_admin(user: UserRecord, action: str, target: str) -> None:
    if user.role == "admin":
        admin_service.log(user.id, user.display_name, action, target)


@router.get("", response_model=PropertyList)
def browse(
    user: MaybeUser,
    ward_id: str | None = Query(None),
    property_type: PropertyType | None = Query(None),
) -> PropertyList:
    return property_service.list_public(ward_id, property_type, user)


@router.post("", response_model=ManagedProperty, status_code=201)
def list_property(body: PropertyWrite, user: CurrentUser) -> ManagedProperty:
    if user.role != "admin":
        admin_service.require("property", _PAUSED)
    created = property_service.create(user, body)
    action = "Listed property" if user.role == "admin" else "Requested property listing"
    admin_service.log(user.id, user.display_name, action, created.title)
    return created


@router.get("/mine", response_model=ManagedPropertyList)
def my_listings(user: CurrentUser) -> ManagedPropertyList:
    return property_service.list_mine(user)


@router.get("/manage", response_model=ManagedPropertyList)
def all_listings(admin: AdminUser) -> ManagedPropertyList:
    return property_service.list_all(admin)


@router.get("/offers/mine", response_model=OfferList)
def my_offers(user: CurrentUser) -> OfferList:
    return property_service.my_offers(user)


@router.post("/offers/{offer_id}/withdraw", response_model=OfferWithProperty)
def withdraw_offer(offer_id: str, user: CurrentUser) -> OfferWithProperty:
    return property_service.withdraw_offer(user, offer_id)


@router.get("/brokers/me", response_model=BrokerMe)
def broker_status(user: CurrentUser) -> BrokerMe:
    return property_service.broker_me(user)


@router.post("/brokers", response_model=BrokerMe, status_code=201)
def apply_broker(body: BrokerApply, user: CurrentUser) -> BrokerMe:
    if user.role == "admin":
        raise ApiError(409, "admin_lists_directly", "City admins list properties directly.")
    applied = property_service.apply_broker(user, body)
    admin_service.log(user.id, user.display_name, "Applied as broker", body.agency_name)
    return applied


@router.get("/brokers", response_model=BrokerList)
def list_brokers(_admin: AdminUser) -> BrokerList:
    return property_service.list_brokers()


@router.post("/brokers/{user_id}/status", response_model=Broker)
def review_broker(user_id: str, body: BrokerStatusIn, admin: AdminUser) -> Broker:
    broker = property_service.review_broker(user_id, body.status, body.note)
    admin_service.log(admin.id, admin.display_name, _BROKER_ACTION[body.status], broker.agency_name)
    return broker


@router.get("/{property_id}", response_model=Property)
def property_detail(property_id: str, user: MaybeUser) -> Property:
    return property_service.get_public(property_id, user)


@router.put("/{property_id}", response_model=ManagedProperty)
def edit_property(property_id: str, body: PropertyWrite, user: CurrentUser) -> ManagedProperty:
    updated = property_service.update(user, property_id, body)
    _log_if_admin(user, "Edited property", updated.title)
    return updated


@router.delete("/{property_id}", status_code=204)
def remove_property(property_id: str, user: CurrentUser) -> None:
    title = property_service.delete(user, property_id)
    _log_if_admin(user, "Removed property", title)


@router.post("/{property_id}/status", response_model=ManagedProperty)
def review_property(property_id: str, body: PropertyStatusIn, admin: AdminUser) -> ManagedProperty:
    updated = property_service.review(admin, property_id, body.status, body.note)
    admin_service.log(admin.id, admin.display_name, _REVIEW_ACTION[body.status], updated.title)
    return updated


@router.post("/{property_id}/withdraw", response_model=ManagedProperty)
def withdraw_property(property_id: str, user: CurrentUser) -> ManagedProperty:
    updated = property_service.withdraw(user, property_id)
    _log_if_admin(user, "Withdrew property", updated.title)
    return updated


@router.post("/{property_id}/relist", response_model=ManagedProperty)
def relist_property(property_id: str, user: CurrentUser) -> ManagedProperty:
    if user.role != "admin":
        admin_service.require("property", _PAUSED)
    return property_service.relist(user, property_id)


@router.post("/{property_id}/offers", response_model=OfferWithProperty, status_code=201)
def make_offer(property_id: str, body: OfferIn, user: CurrentUser) -> OfferWithProperty:
    admin_service.require("property", _PAUSED)
    return property_service.make_offer(user, property_id, body)


@router.post("/{property_id}/offers/{offer_id}/decision", response_model=ManagedProperty)
def decide_offer(property_id: str, offer_id: str, body: OfferDecision, user: CurrentUser) -> ManagedProperty:
    updated = property_service.decide(user, property_id, offer_id, body)
    _log_if_admin(user, "Accepted offer on" if body.action == "accept" else "Declined offer on", updated.title)
    return updated


@router.post("/{property_id}/release", response_model=ManagedProperty)
def release_offer(property_id: str, user: CurrentUser) -> ManagedProperty:
    updated = property_service.release(user, property_id)
    _log_if_admin(user, "Released offer on", updated.title)
    return updated


@router.post("/{property_id}/complete", response_model=ManagedProperty)
def complete_sale(property_id: str, body: CompleteSale, user: CurrentUser) -> ManagedProperty:
    updated = property_service.complete(user, property_id, body)
    admin_service.log(user.id, user.display_name, "Marked property sold", updated.title)
    return updated

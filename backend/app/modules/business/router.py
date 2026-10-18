from fastapi import APIRouter

from app.modules.admin.service import admin_service
from app.modules.business.schemas import (
    AvailabilityIn,
    BusinessCreate,
    BusinessList,
    BusinessProfile,
    CatalogItemIn,
    ServiceOfferingIn,
    ShopMediaIn,
    ShopStatusIn,
)
from app.modules.business.service import business_service
from app.modules.identity.router import AdminUser, CurrentUser

router = APIRouter(prefix="/businesses", tags=["businesses"])

_STATUS_ACTION = {"approved": "Approved shop", "rejected": "Rejected shop", "disabled": "Disabled shop"}


@router.get("/mine", response_model=BusinessList)
def managed_shops(_admin: AdminUser) -> BusinessList:
    return business_service.list_managed()


@router.post("", response_model=BusinessProfile, status_code=201)
def onboard(body: BusinessCreate, admin: AdminUser) -> BusinessProfile:
    shop = business_service.create(admin.id, body)
    admin_service.log(admin.id, admin.display_name, "Added shop", shop.name)
    return shop


@router.post("/requests", response_model=BusinessProfile, status_code=201)
def request_listing(body: BusinessCreate, user: CurrentUser) -> BusinessProfile:
    admin_service.require("shop_requests", "Shop listing requests are paused by the city admin.")
    shop = business_service.submit_request(user.id, body)
    admin_service.log(user.id, user.display_name, "Requested shop listing", shop.name)
    return shop


@router.get("/requests/mine", response_model=BusinessList)
def my_requests(user: CurrentUser) -> BusinessList:
    return business_service.list_owned(user.id)


@router.get("/{slug}", response_model=BusinessProfile)
def shop_profile(slug: str) -> BusinessProfile:
    return business_service.get_public(slug)


@router.delete("/{slug}", status_code=204)
def remove_shop(slug: str, admin: AdminUser) -> None:
    name = business_service.get_managed(slug).name
    business_service.delete_shop(slug)
    admin_service.log(admin.id, admin.display_name, "Removed shop", name)


@router.post("/{slug}/status", response_model=BusinessProfile)
def change_status(slug: str, body: ShopStatusIn, admin: AdminUser) -> BusinessProfile:
    shop = business_service.set_status(slug, body.status, body.note)
    admin_service.log(admin.id, admin.display_name, _STATUS_ACTION[body.status], shop.name)
    return shop


@router.patch("/{slug}/media", response_model=BusinessProfile)
def set_shop_media(slug: str, body: ShopMediaIn, admin: AdminUser) -> BusinessProfile:
    return business_service.set_media(admin.id, slug, body.media)


@router.post("/{slug}/items", response_model=BusinessProfile)
def add_catalog_item(slug: str, body: CatalogItemIn, admin: AdminUser) -> BusinessProfile:
    return business_service.add_item(admin.id, slug, body)


@router.patch("/{slug}/items/{item_id}", response_model=BusinessProfile)
def toggle_catalog_item(slug: str, item_id: str, body: AvailabilityIn, _admin: AdminUser) -> BusinessProfile:
    return business_service.set_availability(slug, "items", item_id, body.is_available)


@router.delete("/{slug}/items/{item_id}", status_code=204)
def remove_catalog_item(slug: str, item_id: str, _admin: AdminUser) -> None:
    business_service.remove_item(slug, item_id)


@router.post("/{slug}/services", response_model=BusinessProfile)
def add_service(slug: str, body: ServiceOfferingIn, _admin: AdminUser) -> BusinessProfile:
    return business_service.add_service(slug, body)


@router.patch("/{slug}/services/{service_id}", response_model=BusinessProfile)
def toggle_service(slug: str, service_id: str, body: AvailabilityIn, _admin: AdminUser) -> BusinessProfile:
    return business_service.set_availability(slug, "services", service_id, body.is_available)


@router.delete("/{slug}/services/{service_id}", status_code=204)
def remove_service(slug: str, service_id: str, _admin: AdminUser) -> None:
    business_service.remove_service(slug, service_id)

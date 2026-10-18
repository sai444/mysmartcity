from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.core.errors import ApiError
from app.modules.admin.service import admin_service
from app.modules.identity.router import AdminUser, CurrentUser, get_current_user
from app.modules.identity.store import UserRecord
from app.modules.services.schemas import (
    Category,
    CategoryIn,
    CategoryList,
    CategoryPatch,
    ServiceCatalog,
    ServiceIn,
    ServiceList,
    ServiceListing,
    ServicePatch,
    StatusIn,
    Subcategory,
    SubcategoryIn,
    SubcategoryList,
    SubcategoryPatch,
)
from app.modules.services.service import local_service

router = APIRouter(prefix="/services", tags=["services"])

_PAUSED = "Local services are paused by the city admin."
_REVIEW_ACTION = {"approved": "Approved service", "rejected": "Rejected service", "disabled": "Disabled service"}


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


@router.get("/catalog", response_model=ServiceCatalog)
def catalog() -> ServiceCatalog:
    return local_service.catalog()


@router.get("", response_model=ServiceList)
def browse(
    user: MaybeUser,
    category_id: str | None = Query(None),
    subcategory_id: str | None = Query(None),
    ward_id: str | None = Query(None),
    q: str | None = Query(None, max_length=80),
) -> ServiceList:
    return local_service.list_public(user, category_id=category_id, subcategory_id=subcategory_id, ward_id=ward_id, q=q)


@router.post("", response_model=ServiceListing, status_code=201)
def offer_service(body: ServiceIn, user: CurrentUser) -> ServiceListing:
    if user.role != "admin":
        admin_service.require("services", _PAUSED)
    created = local_service.create(user, body)
    action = "Listed service" if user.role == "admin" else "Requested service listing"
    admin_service.log(user.id, user.display_name, action, created.title)
    return created


@router.get("/mine", response_model=ServiceList)
def my_listings(user: CurrentUser) -> ServiceList:
    return local_service.list_mine(user)


@router.get("/manage", response_model=ServiceList)
def all_listings(admin: AdminUser, status: str | None = Query(None)) -> ServiceList:
    return local_service.list_all(admin, status)


@router.get("/categories", response_model=CategoryList)
def admin_categories(_admin: AdminUser) -> CategoryList:
    return local_service.list_categories(include_hidden=True)


@router.post("/categories", response_model=Category, status_code=201)
def create_category(body: CategoryIn, admin: AdminUser) -> Category:
    created = local_service.create_category(body)
    admin_service.log(admin.id, admin.display_name, "Added service category", created.name)
    return created


@router.patch("/categories/{category_id}", response_model=Category)
def edit_category(category_id: str, body: CategoryPatch, admin: AdminUser) -> Category:
    updated = local_service.update_category(category_id, body)
    action = "Opened service category" if body.active is True else "Hid service category" if body.active is False else "Edited service category"
    admin_service.log(admin.id, admin.display_name, action, updated.name)
    return updated


@router.get("/subcategories", response_model=SubcategoryList)
def admin_subcategories(_admin: AdminUser, category_id: str | None = Query(None)) -> SubcategoryList:
    return local_service.list_subcategories(category_id, include_hidden=True)


@router.post("/subcategories", response_model=Subcategory, status_code=201)
def create_subcategory(body: SubcategoryIn, admin: AdminUser) -> Subcategory:
    created = local_service.create_subcategory(body)
    admin_service.log(admin.id, admin.display_name, "Added service type", created.name)
    return created


@router.patch("/subcategories/{subcategory_id}", response_model=Subcategory)
def edit_subcategory(subcategory_id: str, body: SubcategoryPatch, admin: AdminUser) -> Subcategory:
    updated = local_service.update_subcategory(subcategory_id, body)
    action = "Opened service type" if body.active is True else "Hid service type" if body.active is False else "Updated service SLA"
    if body.response_hours is None and body.completion_hours is None and body.sla_note is None:
        action = "Edited service type"
    admin_service.log(admin.id, admin.display_name, action, updated.name)
    return updated


@router.get("/{listing_id}", response_model=ServiceListing)
def service_detail(listing_id: str, user: MaybeUser) -> ServiceListing:
    return local_service.get_public(listing_id, user)


@router.patch("/{listing_id}", response_model=ServiceListing)
def edit_service(listing_id: str, body: ServicePatch, user: CurrentUser) -> ServiceListing:
    updated = local_service.update(user, listing_id, body)
    _log_if_admin(user, "Edited service", updated.title)
    return updated


@router.delete("/{listing_id}", status_code=204)
def remove_service(listing_id: str, user: CurrentUser) -> None:
    title = local_service.delete(user, listing_id)
    _log_if_admin(user, "Removed service", title)


@router.post("/{listing_id}/status", response_model=ServiceListing)
def review_service(listing_id: str, body: StatusIn, admin: AdminUser) -> ServiceListing:
    updated = local_service.review(listing_id, body.status, body.note, admin)
    admin_service.log(admin.id, admin.display_name, _REVIEW_ACTION[body.status], updated.title)
    return updated

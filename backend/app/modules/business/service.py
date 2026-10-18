import re
from uuid import uuid4

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.business.schemas import (
    BusinessCreate,
    BusinessList,
    BusinessProfile,
    CatalogItem,
    CatalogItemIn,
    ServiceOffering,
    ServiceOfferingIn,
)
from app.modules.business.seed import DEMO_SHOPS
from app.modules.business.store import BusinessStore
from app.modules.civic.directory import directory
from app.modules.media.service import media_service


class BusinessService:
    def __init__(self) -> None:
        self._store: BusinessStore | None = None

    @property
    def store(self) -> BusinessStore:
        if self._store is None:
            self._store = BusinessStore(settings.business_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = BusinessStore(path)

    def list_public(self, ward_id: str | None = None) -> list[dict]:
        return [
            shop
            for shop in self._all_rows()
            if shop.get("status", "approved") == "approved" and (ward_id is None or shop["ward_id"] == ward_id)
        ]

    def list_managed(self) -> BusinessList:
        return BusinessList(data=[self._profile(row, owned=True) for row in self._all_rows()])

    def list_owned(self, owner_id: str) -> BusinessList:
        hidden = self.store.hidden_slugs()
        rows = [row for row in self.store.list_rows(owner_id=owner_id) if row["slug"] not in hidden]
        return BusinessList(data=[self._profile(row, owned=True) for row in rows])

    def status_counts(self) -> dict[str, int]:
        counts = {"pending": 0, "approved": 0, "rejected": 0, "disabled": 0}
        for row in self._all_rows():
            status = row.get("status", "approved")
            counts[status] = counts.get(status, 0) + 1
        return counts

    def get_public(self, slug: str, owner_id: str | None = None) -> BusinessProfile:
        row = self._find(slug)
        if row.get("status", "approved") != "approved":
            raise ApiError(404, "not_found", "Shop not found.")
        return self._profile(row, owned=row.get("owner_id") == owner_id and owner_id is not None)

    def catalog_item(self, slug: str, item_id: str) -> tuple[dict, dict]:
        shop = self._find(slug)
        if shop.get("status", "approved") != "approved":
            raise ApiError(409, "shop_unavailable", "This shop is not taking orders.")
        item = next((row for row in shop.get("catalog", []) if row["id"] == item_id), None)
        if item is None:
            raise ApiError(404, "not_found", "That item is not on this shop.")
        return shop, item

    def owner_shop_ids(self, owner_id: str) -> set[str]:
        return {row["id"] for row in self.store.list_rows(owner_id=owner_id) if row.get("status") == "approved"}

    def get_managed(self, slug: str) -> BusinessProfile:
        return self._profile(self._find(slug), owned=True)

    def submit_request(self, owner_id: str, body: BusinessCreate) -> BusinessProfile:
        if len([row for row in self.store.list_rows(owner_id=owner_id) if row["status"] == "pending"]) >= 3:
            raise ApiError(409, "too_many_requests", "You already have 3 shops waiting for approval.")
        return self.create(owner_id, body, status="pending")

    def set_status(self, slug: str, status: str, note: str | None) -> BusinessProfile:
        row = self._managed(slug)
        self.store.set_status(row["id"], status, note)
        return self.get_managed(slug)

    def set_availability(self, slug: str, kind: str, entry_id: str, available: bool) -> BusinessProfile:
        row = self._managed(slug)
        update = self.store.set_item_available if kind == "items" else self.store.set_service_available
        if not update(row["id"], entry_id, available):
            raise ApiError(404, "not_found", "That listing is not on this shop.")
        return self.get_managed(slug)

    def _all_rows(self) -> list[dict]:
        hidden = self.store.hidden_slugs()
        stored = [shop for shop in self.store.list_rows() if shop["slug"] not in hidden]
        seen = {shop["slug"] for shop in stored}
        demo = [shop for shop in DEMO_SHOPS if shop["slug"] not in hidden and shop["slug"] not in seen]
        return stored + demo

    def create(self, owner_id: str, body: BusinessCreate, status: str = "approved") -> BusinessProfile:
        self._require_ward(body.ward_id)
        slug = _unique_slug(body.name, self._taken_slugs())
        business_id = self.store.insert(
            owner_id=owner_id,
            slug=slug,
            name=body.name,
            category=body.category,
            ward_id=body.ward_id,
            address_text=body.address_text,
            phone=body.phone,
            opening_hours=body.opening_hours,
            about=body.about,
            latitude=body.latitude,
            longitude=body.longitude,
            catalog=[self._item_values(owner_id, item) for item in body.catalog],
            services=[service.model_dump() for service in body.services],
            status=status,
            media=media_service.refs(owner_id, body.media),
        )
        created = self.store.get_by_slug(slug)
        if created is None or created["id"] != business_id:
            raise ApiError(500, "shop_not_stored", "The shop could not be saved.")
        return self._profile(created, owned=True)

    def delete_shop(self, slug: str) -> None:
        self._find(slug)
        stored = self.store.get_by_slug(slug)
        if stored is not None:
            self.store.delete_business(stored["id"])
        self.store.hide(slug)

    def set_media(self, actor_id: str, slug: str, media_ids: list[str]) -> BusinessProfile:
        row = self._managed(slug)
        self.store.set_media(row["id"], media_service.refs(actor_id, media_ids, row.get("media")))
        return self.get_managed(slug)

    def add_item(self, actor_id: str, slug: str, item: CatalogItemIn) -> BusinessProfile:
        row = self._managed(slug)
        if self.store.count_items(row["id"]) >= 40:
            raise ApiError(409, "catalog_full", "This shop already has 40 catalog items.")
        self.store.add_item(row["id"], self._item_values(actor_id, item))
        return self.get_managed(slug)

    def _item_values(self, owner_id: str, item: CatalogItemIn) -> dict:
        return {**item.model_dump(), "media": media_service.refs(owner_id, item.media)}

    def remove_item(self, slug: str, item_id: str) -> None:
        row = self._managed(slug)
        self._require_remaining_listing(row["id"])
        if not self.store.delete_item(row["id"], item_id):
            raise ApiError(404, "not_found", "That catalog item is not on this shop.")

    def add_service(self, slug: str, service: ServiceOfferingIn) -> BusinessProfile:
        row = self._managed(slug)
        if self.store.count_services(row["id"]) >= 40:
            raise ApiError(409, "services_full", "This shop already lists 40 services.")
        self.store.add_service(row["id"], service.model_dump())
        return self.get_managed(slug)

    def remove_service(self, slug: str, service_id: str) -> None:
        row = self._managed(slug)
        self._require_remaining_listing(row["id"])
        if not self.store.delete_service(row["id"], service_id):
            raise ApiError(404, "not_found", "That service is not on this shop.")

    def _require_remaining_listing(self, business_id: str) -> None:
        if self.store.count_items(business_id) + self.store.count_services(business_id) <= 1:
            raise ApiError(409, "listing_required", "Keep at least one catalog item or service on the profile.")

    def _managed(self, slug: str) -> dict:
        self._find(slug)
        stored = self.store.get_by_slug(slug)
        if stored is not None:
            return stored
        demo = next(shop for shop in DEMO_SHOPS if shop["slug"] == slug)
        self.store.copy_shop(demo, owner_id="city")
        copied = self.store.get_by_slug(slug)
        if copied is None:
            raise ApiError(500, "shop_not_stored", "The shop could not be saved.")
        return copied

    def _find(self, slug: str) -> dict:
        if slug in self.store.hidden_slugs():
            raise ApiError(404, "not_found", "Shop not found.")
        stored = self.store.get_by_slug(slug)
        if stored is not None:
            return stored
        for shop in DEMO_SHOPS:
            if shop["slug"] == slug:
                return shop
        raise ApiError(404, "not_found", "Shop not found.")

    def _taken_slugs(self) -> set[str]:
        return {shop["slug"] for shop in DEMO_SHOPS} | self.store.slugs()

    def _require_ward(self, ward_id: str) -> None:
        if not directory.is_open_ward(ward_id):
            raise ApiError(
                422,
                "validation_error",
                "Choose a ward from the list.",
                [{"field": "ward_id", "message": "Choose a ward from the list."}],
            )

    def _profile(self, row: dict, owned: bool) -> BusinessProfile:
        ward_name = directory.ward_name(row["ward_id"], "Ward")
        return BusinessProfile(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            category=row["category"],
            ward_id=row["ward_id"],
            ward_name=ward_name,
            address_text=row["address_text"],
            phone=row["phone"],
            opening_hours=row["opening_hours"],
            about=row["about"],
            latitude=row["latitude"],
            longitude=row["longitude"],
            profile_path=f"/b/{row['slug']}",
            owned=owned,
            status=row.get("status", "approved"),
            review_note=row.get("review_note"),
            media=media_service.items(row.get("media")),
            catalog=[
                CatalogItem.model_validate({**item, "media": media_service.items(item.get("media"))})
                for item in row["catalog"]
            ],
            services=[ServiceOffering.model_validate(service) for service in row.get("services", [])],
        )


def _unique_slug(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "shop"
    if base not in taken:
        return base
    return f"{base}-{uuid4().hex[:6]}"


business_service = BusinessService()

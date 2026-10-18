from app.core.config import settings
from app.core.errors import ApiError
from app.modules.civic.directory import directory
from app.modules.identity.store import UserRecord
from app.modules.services.schemas import (
    CatalogCategory,
    Category,
    CategoryIn,
    CategoryList,
    CategoryPatch,
    ServiceCatalog,
    ServiceIn,
    ServiceList,
    ServiceListing,
    ServicePatch,
    Sla,
    Subcategory,
    SubcategoryIn,
    SubcategoryList,
    SubcategoryPatch,
)
from app.modules.services.store import ServiceStore

_EDITABLE = ("pending", "approved", "rejected", "disabled")
_MAX_PENDING = 5
_CATEGORY_FIELDS = {"name", "sort_order", "active"}
_SUBCATEGORY_FIELDS = {
    "category_id",
    "name",
    "response_hours",
    "completion_hours",
    "sla_note",
    "sort_order",
    "active",
}
_LISTING_FIELDS = {
    "title",
    "details",
    "subcategory_id",
    "price_paise",
    "ward_id",
    "area_text",
    "contact_name",
    "contact_phone",
}


class LocalService:
    def __init__(self) -> None:
        self._store: ServiceStore | None = None

    @property
    def store(self) -> ServiceStore:
        if self._store is None:
            self._store = ServiceStore(settings.services_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = ServiceStore(path)

    def catalog(self) -> ServiceCatalog:
        categories = [self._category(row) for row in self.store.list_categories()]
        grouped: dict[str, list[Subcategory]] = {row.id: [] for row in categories}
        for row in self.store.list_subcategories():
            grouped.setdefault(row["category_id"], []).append(self._subcategory(row))
        return ServiceCatalog(
            data=[
                CatalogCategory(id=row.id, name=row.name, subcategories=grouped.get(row.id, []))
                for row in categories
            ]
        )

    def list_public(
        self,
        user: UserRecord | None,
        *,
        category_id: str | None = None,
        subcategory_id: str | None = None,
        ward_id: str | None = None,
        q: str | None = None,
    ) -> ServiceList:
        rows = [
            row
            for row in self.store.list_listings(
                status="approved",
                category_id=category_id,
                subcategory_id=subcategory_id,
                ward_id=ward_id,
                q=q,
            )
            if row["category_active"] and row["subcategory_active"]
        ]
        return ServiceList(data=[self._listing(row, user, reveal_contact=True) for row in rows])

    def get_public(self, listing_id: str, user: UserRecord | None) -> ServiceListing:
        row = self._find(listing_id)
        manage = _can_manage(row, user)
        live = row["status"] == "approved" and row["category_active"] and row["subcategory_active"]
        if not live and not manage:
            raise ApiError(404, "not_found", "Service not found.")
        return self._listing(row, user, reveal_contact=live or manage)

    def list_mine(self, user: UserRecord) -> ServiceList:
        return ServiceList(data=[self._listing(row, user, reveal_contact=True) for row in self.store.list_listings(provider_id=user.id)])

    def list_all(self, user: UserRecord, status: str | None = None) -> ServiceList:
        return ServiceList(data=[self._listing(row, user, reveal_contact=True) for row in self.store.list_listings(status=status)])

    def status_counts(self) -> dict[str, int]:
        counts = {"pending": 0, "approved": 0, "rejected": 0, "disabled": 0}
        counts.update(self.store.status_counts())
        return counts

    def create(self, user: UserRecord, body: ServiceIn) -> ServiceListing:
        self._require_ward(body.ward_id)
        self._require_live_subcategory(body.subcategory_id)
        if user.role != "admin":
            pending = [row for row in self.store.list_listings(provider_id=user.id) if row["status"] == "pending"]
            if len(pending) >= _MAX_PENDING:
                raise ApiError(409, "too_many_requests", "You already have 5 services waiting for approval.")
        row = self.store.insert_listing(
            {
                **body.model_dump(),
                "provider_id": user.id,
                "provider_name": user.display_name,
                "status": "approved" if user.role == "admin" else "pending",
            }
        )
        return self._listing(row, user, reveal_contact=True)

    def update(self, user: UserRecord, listing_id: str, body: ServicePatch) -> ServiceListing:
        row = self._require_manager(listing_id, user)
        if row["status"] not in _EDITABLE:
            raise ApiError(409, "locked", "This service cannot be edited.")
        values = body.model_dump(exclude_unset=True)
        if "ward_id" in values:
            self._require_ward(values["ward_id"])
        if "subcategory_id" in values:
            self._require_live_subcategory(values["subcategory_id"])
        if user.role == "admin":
            if row["status"] in ("pending", "rejected"):
                values["status"] = "approved"
                values["review_note"] = None
        else:
            values["status"] = "pending"
            values["review_note"] = None
        updated = self.store.update_listing(listing_id, {key: value for key, value in values.items() if key in _LISTING_FIELDS or key in {"status", "review_note"}})
        return self._listing(updated or row, user, reveal_contact=True)

    def delete(self, user: UserRecord, listing_id: str) -> str:
        row = self._require_manager(listing_id, user)
        self.store.delete_listing(listing_id)
        return row["title"]

    def review(self, listing_id: str, status: str, note: str | None, user: UserRecord) -> ServiceListing:
        row = self._find(listing_id)
        allowed = {
            "approved": ("pending", "rejected", "disabled"),
            "rejected": ("pending",),
            "disabled": ("approved",),
        }
        if row["status"] not in allowed[status]:
            raise ApiError(409, "invalid_state", f"A {row['status']} service cannot be {status}.")
        updated = self.store.update_listing(listing_id, {"status": status, "review_note": note})
        return self._listing(updated or row, user, reveal_contact=True)

    def list_categories(self, *, include_hidden: bool = False) -> CategoryList:
        return CategoryList(data=[self._category(row) for row in self.store.list_categories(include_hidden=include_hidden)])

    def create_category(self, body: CategoryIn) -> Category:
        return self._category(self.store.insert_category(body.model_dump()))

    def update_category(self, category_id: str, body: CategoryPatch) -> Category:
        if self.store.get_category(category_id) is None:
            raise ApiError(404, "not_found", "Service category not found.")
        fields = {key: value for key, value in body.model_dump(exclude_unset=True).items() if key in _CATEGORY_FIELDS}
        row = self.store.update_category(category_id, fields)
        if row is None:
            raise ApiError(404, "not_found", "Service category not found.")
        return self._category(row)

    def list_subcategories(self, category_id: str | None = None, *, include_hidden: bool = False) -> SubcategoryList:
        return SubcategoryList(
            data=[self._subcategory(row) for row in self.store.list_subcategories(category_id, include_hidden=include_hidden)]
        )

    def create_subcategory(self, body: SubcategoryIn) -> Subcategory:
        self._require_category(body.category_id)
        return self._subcategory(self.store.insert_subcategory(body.model_dump()))

    def update_subcategory(self, subcategory_id: str, body: SubcategoryPatch) -> Subcategory:
        if self.store.get_subcategory(subcategory_id) is None:
            raise ApiError(404, "not_found", "Service type not found.")
        fields = {key: value for key, value in body.model_dump(exclude_unset=True).items() if key in _SUBCATEGORY_FIELDS}
        if "category_id" in fields:
            self._require_category(fields["category_id"])
        row = self.store.update_subcategory(subcategory_id, fields)
        if row is None:
            raise ApiError(404, "not_found", "Service type not found.")
        return self._subcategory(row)

    def _require_category(self, category_id: str) -> dict:
        row = self.store.get_category(category_id)
        if row is None:
            raise ApiError(
                422,
                "validation_error",
                "Choose a category from the list.",
                [{"field": "category_id", "message": "Choose a category from the list."}],
            )
        return row

    def _require_live_subcategory(self, subcategory_id: str) -> dict:
        row = self.store.get_subcategory(subcategory_id)
        category = self.store.get_category(row["category_id"]) if row else None
        if row is None or not row["active"] or category is None or not category["active"]:
            raise ApiError(
                422,
                "validation_error",
                "Choose a service type from the list.",
                [{"field": "subcategory_id", "message": "Choose a service type from the list."}],
            )
        return row

    def _require_ward(self, ward_id: str) -> None:
        if not directory.is_open_ward(ward_id):
            raise ApiError(
                422,
                "validation_error",
                "Choose a ward from the list.",
                [{"field": "ward_id", "message": "Choose a ward from the list."}],
            )

    def _find(self, listing_id: str) -> dict:
        row = self.store.get_listing(listing_id)
        if row is None:
            raise ApiError(404, "not_found", "Service not found.")
        return row

    def _require_manager(self, listing_id: str, user: UserRecord) -> dict:
        row = self._find(listing_id)
        if not _can_manage(row, user):
            raise ApiError(404, "not_found", "Service not found.")
        return row

    def _category(self, row: dict) -> Category:
        counts = self.store.subcategory_counts()
        return Category.model_validate(
            {
                **row,
                "active": bool(row["active"]),
                "subcategory_count": counts.get(row["id"], 0),
            }
        )

    def _subcategory(self, row: dict) -> Subcategory:
        return Subcategory.model_validate(
            {
                **row,
                "active": bool(row["active"]),
                "sla": Sla(
                    response_hours=row["response_hours"],
                    completion_hours=row["completion_hours"],
                    note=row["sla_note"] or "",
                ),
            }
        )

    def _listing(self, row: dict, user: UserRecord | None, *, reveal_contact: bool) -> ServiceListing:
        return ServiceListing.model_validate(
            {
                **row,
                "ward_name": directory.ward_name(row["ward_id"], "Ward"),
                "contact_phone": row["contact_phone"] if reveal_contact else None,
                "sla": Sla(
                    response_hours=row["response_hours"],
                    completion_hours=row["completion_hours"],
                    note=row["sla_note"] or "",
                ),
                "mine": user is not None and row["provider_id"] == user.id,
            }
        )


def _can_manage(row: dict, user: UserRecord | None) -> bool:
    return user is not None and (user.role == "admin" or row["provider_id"] == user.id)


local_service = LocalService()

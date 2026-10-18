from app.core.config import settings
from app.core.errors import ApiError
from app.modules.civic.directory import directory
from app.modules.identity.store import UserRecord
from app.modules.media.service import media_service
from app.modules.property.schemas import (
    Broker,
    BrokerApply,
    BrokerList,
    BrokerMe,
    CompleteSale,
    ManagedProperty,
    ManagedPropertyList,
    Offer,
    OfferDecision,
    OfferIn,
    OfferList,
    OfferWithProperty,
    Property,
    PropertyList,
    PropertyWrite,
)
from app.modules.property.store import PropertyStore

_PUBLIC = ("approved", "under_offer")
_EDITABLE = ("pending", "approved", "rejected", "withdrawn", "disabled")
_ACTIVE_OFFER = ("pending", "accepted")
_MAX_PENDING_LISTINGS = 5


class PropertyService:
    def __init__(self) -> None:
        self._store: PropertyStore | None = None

    @property
    def store(self) -> PropertyStore:
        if self._store is None:
            self._store = PropertyStore(settings.property_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = PropertyStore(path)

    def list_public(self, ward_id: str | None, property_type: str | None, user: UserRecord | None) -> PropertyList:
        rows = [
            row
            for row in self.store.list_rows(statuses=_PUBLIC)
            if (ward_id is None or row["ward_id"] == ward_id)
            and (property_type is None or row["property_type"] == property_type)
        ]
        return PropertyList(data=[self._property(row, user) for row in rows])

    def map_rows(self, ward_id: str | None) -> list[dict]:
        return [row for row in self.store.list_rows(statuses=_PUBLIC) if ward_id is None or row["ward_id"] == ward_id]

    def get_public(self, property_id: str, user: UserRecord | None) -> Property:
        row = self._find(property_id)
        if row["status"] not in _PUBLIC and not _can_manage(row, user):
            raise ApiError(404, "not_found", "Property not found.")
        return self._property(row, user)

    def list_mine(self, user: UserRecord) -> ManagedPropertyList:
        return ManagedPropertyList(data=[self._managed(row, user) for row in self.store.list_rows(seller_id=user.id)])

    def list_all(self, user: UserRecord) -> ManagedPropertyList:
        return ManagedPropertyList(data=[self._managed(row, user) for row in self.store.list_rows()])

    def status_counts(self) -> dict[str, int]:
        counts = {"pending": 0, "approved": 0, "under_offer": 0, "sold": 0, "rejected": 0, "disabled": 0, "withdrawn": 0}
        counts.update(self.store.status_counts())
        return counts

    def create(self, user: UserRecord, body: PropertyWrite) -> ManagedProperty:
        self._require_ward(body.ward_id)
        is_admin = user.role == "admin"
        if not is_admin:
            pending = [row for row in self.store.list_rows(seller_id=user.id) if row["status"] == "pending"]
            if len(pending) >= _MAX_PENDING_LISTINGS:
                raise ApiError(409, "too_many_requests", "You already have 5 properties waiting for approval.")
        values = self._lister_fields(user, body)
        values["media"] = media_service.refs(user.id, body.media)
        property_id = self.store.insert(user.id, values, "approved" if is_admin else "pending")
        return self._managed(self._find(property_id), user)

    def update(self, user: UserRecord, property_id: str, body: PropertyWrite) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        if row["status"] not in _EDITABLE:
            raise ApiError(409, "locked", "A property under offer or sold cannot be edited.")
        self._require_ward(body.ward_id)
        if row["seller_id"] == user.id:
            values = self._lister_fields(user, body)
        else:
            values = {
                **body.model_dump(),
                **{key: row[key] for key in ("lister_role", "lister_name", "agency_name", "owner_name", "commission_pct")},
            }
        values["media"] = media_service.refs(user.id, body.media, row["media"])
        if user.role == "admin":
            status = "approved" if row["status"] in ("pending", "rejected") else row["status"]
        else:
            status = "pending" if row["status"] != "withdrawn" else "withdrawn"
        self.store.update(property_id, values, status)
        return self._managed(self._find(property_id), user)

    def withdraw(self, user: UserRecord, property_id: str) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        if row["status"] not in ("pending", "approved", "rejected", "disabled"):
            raise ApiError(409, "invalid_state", "Release the accepted offer before withdrawing this property.")
        self.store.close_open_offers(property_id, "The seller withdrew the property.")
        self.store.set_status(property_id, "withdrawn", keep_note=True)
        return self._managed(self._find(property_id), user)

    def relist(self, user: UserRecord, property_id: str) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        if row["status"] != "withdrawn":
            raise ApiError(409, "invalid_state", "Only withdrawn properties can be listed again.")
        self.store.set_status(property_id, "approved" if user.role == "admin" else "pending")
        return self._managed(self._find(property_id), user)

    def delete(self, user: UserRecord, property_id: str) -> str:
        row = self._require_manager(property_id, user)
        if user.role != "admin" and row["status"] in ("under_offer", "sold"):
            raise ApiError(409, "locked", "Properties under offer or sold stay on record. Ask the city admin.")
        self.store.delete(property_id)
        return row["title"]

    def review(self, user: UserRecord, property_id: str, status: str, note: str | None) -> ManagedProperty:
        row = self._find(property_id)
        allowed = {
            "approved": ("pending", "rejected", "disabled"),
            "rejected": ("pending",),
            "disabled": ("approved", "under_offer"),
        }
        if row["status"] not in allowed[status]:
            raise ApiError(409, "invalid_state", f"A {row['status'].replace('_', ' ')} property cannot be {status}.")
        if status == "disabled":
            self.store.close_open_offers(property_id, "The city admin took this listing down.")
        self.store.set_status(property_id, status, note)
        return self._managed(self._find(property_id), user)

    def make_offer(self, user: UserRecord, property_id: str, body: OfferIn) -> OfferWithProperty:
        row = self._find(property_id)
        if row["status"] not in _PUBLIC:
            raise ApiError(404, "not_found", "Property not found.")
        if row["seller_id"] == user.id:
            raise ApiError(409, "own_listing", "You cannot make an offer on your own property.")
        if any(
            offer["buyer_id"] == user.id and offer["status"] in _ACTIVE_OFFER for offer in self.store.offers_for(property_id)
        ):
            raise ApiError(409, "offer_exists", "You already have an open offer on this property.")
        offer_id = self.store.insert_offer(property_id, user.id, user.display_name, body.phone, body.amount_paise, body.message)
        return self._offer_for_buyer(self._require_offer(offer_id), user)

    def my_offers(self, user: UserRecord) -> OfferList:
        rows = []
        for offer in self.store.offers_by(user.id):
            if self.store.get(offer["property_id"]) is not None:
                rows.append(self._offer_for_buyer(offer, user))
        return OfferList(data=rows)

    def withdraw_offer(self, user: UserRecord, offer_id: str) -> OfferWithProperty:
        offer = self._require_offer(offer_id)
        if offer["buyer_id"] != user.id:
            raise ApiError(404, "not_found", "Offer not found.")
        if offer["status"] == "accepted":
            self.store.release_offer(offer["property_id"], offer_id, "withdrawn")
        elif offer["status"] == "pending":
            self.store.set_offer_status(offer_id, "withdrawn")
        else:
            raise ApiError(409, "invalid_state", "This offer is already closed.")
        return self._offer_for_buyer(self._require_offer(offer_id), user)

    def decide(self, user: UserRecord, property_id: str, offer_id: str, body: OfferDecision) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        offer = self._require_offer(offer_id)
        if offer["property_id"] != property_id:
            raise ApiError(404, "not_found", "Offer not found.")
        if offer["status"] != "pending":
            raise ApiError(409, "invalid_state", "Only open offers can be accepted or declined.")
        if body.action == "accept":
            if row["status"] != "approved":
                raise ApiError(409, "invalid_state", "Another offer is already accepted. Release it first.")
            self.store.accept_offer(property_id, offer_id, body.note)
        else:
            self.store.set_offer_status(offer_id, "declined", body.note)
        return self._managed(self._find(property_id), user)

    def release(self, user: UserRecord, property_id: str) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        accepted = self._accepted_offer(property_id)
        if row["status"] != "under_offer" or accepted is None:
            raise ApiError(409, "invalid_state", "This property has no accepted offer to release.")
        self.store.release_offer(property_id, accepted["id"], "cancelled")
        return self._managed(self._find(property_id), user)

    def complete(self, user: UserRecord, property_id: str, body: CompleteSale) -> ManagedProperty:
        row = self._require_manager(property_id, user)
        if row["status"] not in ("approved", "under_offer"):
            raise ApiError(409, "invalid_state", "Only live properties can be marked sold.")
        accepted = self._accepted_offer(property_id)
        if row["status"] == "under_offer" and accepted is None:
            raise ApiError(409, "invalid_state", "This property has no accepted offer.")
        default_price = accepted["amount_paise"] if accepted else row["price_paise"]
        self.store.complete_sale(property_id, accepted["id"] if accepted else None, body.sold_price_paise or default_price)
        return self._managed(self._find(property_id), user)

    def broker_me(self, user: UserRecord) -> BrokerMe:
        row = self.store.get_broker(user.id)
        return BrokerMe(broker=Broker.model_validate(row) if row else None)

    def apply_broker(self, user: UserRecord, body: BrokerApply) -> BrokerMe:
        existing = self.store.get_broker(user.id)
        if existing is not None and existing["status"] == "approved":
            raise ApiError(409, "already_verified", "You are already a verified broker.")
        self.store.upsert_broker(user.id, user.display_name, body.model_dump())
        return self.broker_me(user)

    def list_brokers(self) -> BrokerList:
        return BrokerList(data=[Broker.model_validate(row) for row in self.store.list_brokers()])

    def review_broker(self, user_id: str, status: str, note: str | None) -> Broker:
        row = self.store.get_broker(user_id)
        if row is None:
            raise ApiError(404, "not_found", "Broker application not found.")
        allowed = {"approved": ("pending", "rejected", "revoked"), "rejected": ("pending",), "revoked": ("approved",)}
        if row["status"] not in allowed[status]:
            raise ApiError(409, "invalid_state", f"A {row['status']} broker cannot be {status}.")
        self.store.set_broker_status(user_id, status, note)
        updated = self.store.get_broker(user_id)
        return Broker.model_validate(updated)

    def _lister_fields(self, user: UserRecord, body: PropertyWrite) -> dict:
        values = body.model_dump()
        values.pop("list_as")
        if user.role == "admin":
            if body.list_as == "broker":
                raise ApiError(422, "validation_error", "City admins list as the city desk or for an owner.")
            owner_name = body.owner_name if body.list_as == "owner" else None
            return {
                **values,
                "lister_role": "admin",
                "lister_name": user.display_name,
                "agency_name": None,
                "owner_name": owner_name,
                "commission_pct": None,
            }
        if body.list_as == "admin":
            raise ApiError(422, "validation_error", "Only the city desk can list as admin.")
        if body.list_as == "broker":
            broker = self.store.get_broker(user.id)
            if broker is None or broker["status"] != "approved":
                raise ApiError(403, "not_broker", "Get verified as a broker before listing for an owner.")
            return {**values, "lister_role": "broker", "lister_name": user.display_name, "agency_name": broker["agency_name"]}
        return {
            **values,
            "lister_role": "owner",
            "lister_name": user.display_name,
            "agency_name": None,
            "owner_name": None,
            "commission_pct": None,
        }

    def _accepted_offer(self, property_id: str) -> dict | None:
        return next((offer for offer in self.store.offers_for(property_id) if offer["status"] == "accepted"), None)

    def _find(self, property_id: str) -> dict:
        row = self.store.get(property_id)
        if row is None:
            raise ApiError(404, "not_found", "Property not found.")
        return row

    def _require_manager(self, property_id: str, user: UserRecord) -> dict:
        row = self._find(property_id)
        if not _can_manage(row, user):
            raise ApiError(404, "not_found", "Property not found.")
        return row

    def _require_offer(self, offer_id: str) -> dict:
        offer = self.store.get_offer(offer_id)
        if offer is None:
            raise ApiError(404, "not_found", "Offer not found.")
        return offer

    def _require_ward(self, ward_id: str) -> None:
        if not directory.is_open_ward(ward_id):
            raise ApiError(
                422,
                "validation_error",
                "Choose a ward from the list.",
                [{"field": "ward_id", "message": "Choose a ward from the list."}],
            )

    def _property(self, row: dict, user: UserRecord | None) -> Property:
        manage = _can_manage(row, user)
        return Property.model_validate(
            {
                **row,
                "ward_name": directory.ward_name(row["ward_id"], "Ward"),
                "media": media_service.items(row["media"]),
                "mine": user is not None and row["seller_id"] == user.id,
                "contact_phone": row["contact_phone"] if manage else None,
            }
        )

    def _managed(self, row: dict, user: UserRecord) -> ManagedProperty:
        base = self._property(row, user).model_dump()
        offers = [Offer.model_validate(offer) for offer in self.store.offers_for(row["id"])]
        return ManagedProperty(**base, offers=offers)

    def _offer_for_buyer(self, offer: dict, user: UserRecord) -> OfferWithProperty:
        row = self._find(offer["property_id"])
        reveal = offer["status"] in ("accepted", "completed")
        return OfferWithProperty(
            **Offer.model_validate(offer).model_dump(),
            property=self._property(row, user),
            seller_phone=row["contact_phone"] if reveal else None,
        )


def _can_manage(row: dict, user: UserRecord | None) -> bool:
    return user is not None and (user.role == "admin" or row["seller_id"] == user.id)


property_service = PropertyService()

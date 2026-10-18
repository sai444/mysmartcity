import base64

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.civic.directory import directory
from app.modules.identity.store import UserRecord
from app.modules.market.schemas import (
    ListingDetail,
    ListingIn,
    ListingList,
    ListingPatch,
    ListingSummary,
    Order,
    OrderBook,
    Photo,
    Review,
    ReviewIn,
    SellerSummary,
    Viewer,
)
from app.modules.market.seed import DEMO_LISTINGS, DEMO_REVIEWS
from app.modules.market.store import MarketStore, NewPhoto
from app.modules.media.service import media_service

_PHOTO_PATH = "/api/v1/market/photos/"
_MAX_ACTIVE_LISTINGS = 30

# Which side of the order may take each action, and from which states.
_TRANSITIONS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "accept": ("seller", ("placed",), "accepted"),
    "decline": ("seller", ("placed", "accepted"), "declined"),
    "cancel": ("buyer", ("placed", "accepted"), "cancelled"),
    "complete": ("either", ("placed", "accepted"), "completed"),
}


def _photo_url(photo_id: str | None) -> str | None:
    return f"{_PHOTO_PATH}{photo_id}" if photo_id else None


def _decode_photo(data_url: str) -> NewPhoto:
    header, payload = data_url.split(",", 1)
    mime = header.removeprefix("data:").removesuffix(";base64")
    try:
        return mime, base64.b64decode(payload, validate=True)
    except ValueError as exc:
        raise ApiError(422, "validation_error", "One of the photos could not be read.") from exc


def _status(row: dict) -> str:
    if row["status"] == "paused":
        return "paused"
    return "active" if row["quantity"] > 0 else "sold_out"


def _rating(value: float | None) -> float | None:
    return round(value, 1) if value is not None else None


class MarketService:
    def __init__(self) -> None:
        self._store: MarketStore | None = None

    @property
    def store(self) -> MarketStore:
        if self._store is None:
            self._store = MarketStore(settings.market_db_path)
            self._seed()
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = MarketStore(path)
        self._seed()

    def _seed(self) -> None:
        store = self._store
        if store is None or store.flag("demo_seeded"):
            return
        for listing in DEMO_LISTINGS:
            store.insert_listing(listing, [], listing_id=listing["id"])
        for review in DEMO_REVIEWS:
            listing = store.get_listing(review["listing_id"])
            if listing:
                store.upsert_review(listing, review["reviewer_id"], review["reviewer_name"], review["rating"], review["comment"])
        store.set_flag("demo_seeded")

    # Browsing

    def browse(
        self, q: str | None, category: str | None, ward_id: str | None, sort: str, include_sold: bool
    ) -> ListingList:
        needle = (q or "").strip().lower()
        rows = []
        for row in self.store.list_listings():
            status = _status(row)
            if status == "paused" or (status == "sold_out" and not include_sold):
                continue
            if category and row["category"] != category:
                continue
            if ward_id and row["ward_id"] != ward_id:
                continue
            haystack = f"{row['title']} {row['description']} {row['seller_name']} {directory.ward_name(row['ward_id'], '')}"
            if needle and needle not in haystack.lower():
                continue
            rows.append(row)
        if sort == "price_low":
            rows.sort(key=lambda row: row["price_paise"])
        elif sort == "price_high":
            rows.sort(key=lambda row: -row["price_paise"])
        elif sort == "rating":
            rows.sort(key=lambda row: (-(row["rating_avg"] or 0), -row["review_count"]))
        rows.sort(key=lambda row: _status(row) == "sold_out")
        return ListingList(data=[self._summary(row, mine=False) for row in rows[:100]])

    def mine(self, seller_id: str) -> ListingList:
        return ListingList(data=[self._summary(row, mine=True) for row in self.store.list_listings(seller_id=seller_id)])

    def detail(self, listing_id: str, viewer: UserRecord | None) -> ListingDetail:
        row = self._visible(listing_id, viewer)
        reviews = [Review.model_validate(review) for review in self.store.reviews(listing_id)]
        is_seller = viewer is not None and viewer.id == row["seller_id"]
        seen = Viewer(is_seller=is_seller)
        if viewer is not None and not is_seller:
            seen.open_order_id = self.store.open_order_id(listing_id, viewer.id)
            seen.can_review = self.store.has_completed_order(listing_id, viewer.id)
            seen.my_review = next((review for review in reviews if review.reviewer_id == viewer.id), None)
        stats = self.store.seller_stats(row["seller_id"])
        return ListingDetail(
            **self._summary(row, mine=is_seller).model_dump(),
            description=row["description"],
            pickup_area=row["pickup_area"],
            photos=[Photo(id=photo_id, url=_photo_url(photo_id) or "") for photo_id in row["photo_ids"]],
            media=media_service.items(row["media"]),
            updated_at=row["updated_at"],
            reviews=reviews,
            seller=SellerSummary(
                id=row["seller_id"],
                name=row["seller_name"],
                rating_avg=_rating(stats["rating_avg"]),
                review_count=stats["review_count"],
                active_listings=stats["active_listings"],
                completed_sales=stats["completed_sales"],
            ),
            viewer=seen,
        )

    def photo(self, photo_id: str) -> tuple[str, bytes]:
        found = self.store.photo(photo_id)
        if found is None:
            raise ApiError(404, "not_found", "Photo not found.")
        return found

    # Selling

    def create(self, seller: UserRecord, body: ListingIn) -> ListingDetail:
        active = [row for row in self.store.list_listings(seller_id=seller.id) if _status(row) != "sold_out"]
        if len(active) >= _MAX_ACTIVE_LISTINGS:
            raise ApiError(409, "too_many_listings", f"You already have {_MAX_ACTIVE_LISTINGS} listings up. Pause or remove one first.")
        listing_id = self.store.insert_listing(
            {
                **body.model_dump(exclude={"photos", "media"}),
                "media": media_service.refs(seller.id, body.media),
                "seller_id": seller.id,
                "seller_name": seller.display_name,
                "ward_id": seller.ward_id,
            },
            [_decode_photo(photo) for photo in body.photos],
        )
        return self.detail(listing_id, seller)

    def update(self, seller: UserRecord, listing_id: str, body: ListingPatch) -> ListingDetail:
        row = self._owned(seller, listing_id)
        fields = body.model_dump(exclude_unset=True, exclude={"photos", "media"})
        if body.media is not None:
            fields["media"] = media_service.refs(seller.id, body.media, row["media"])
        for required in ("title", "description", "category", "condition", "price_paise", "quantity", "status"):
            if required in fields and fields[required] is None:
                del fields[required]
        if "pickup_area" in fields and fields["pickup_area"] is None:
            fields["pickup_area"] = ""
        photos: list[str | NewPhoto] | None = None
        if body.photos is not None:
            own = set(row["photo_ids"])
            photos = []
            for photo in body.photos:
                if photo.startswith("data:"):
                    photos.append(_decode_photo(photo))
                elif photo in own:
                    photos.append(photo)
                else:
                    raise ApiError(422, "validation_error", "One of the photos is not on this listing.")
        self.store.update_listing(listing_id, fields, photos)
        return self.detail(listing_id, seller)

    def remove(self, seller: UserRecord, listing_id: str) -> None:
        row = self._owned(seller, listing_id)
        if row["open_orders"]:
            raise ApiError(409, "open_orders", "Accept, finish, or decline the open orders on this listing first.")
        self.store.update_listing(listing_id, {"status": "removed"}, None)

    # Orders

    def place_order(self, buyer: UserRecord, listing_id: str, quantity: int, note: str) -> Order:
        row = self._visible(listing_id, buyer)
        if row["seller_id"] == buyer.id:
            raise ApiError(403, "own_listing", "You cannot buy your own listing.")
        if _status(row) != "active":
            raise ApiError(409, "unavailable", "This item is no longer available.")
        if self.store.open_order_id(listing_id, buyer.id):
            raise ApiError(409, "order_open", "You already have an open order for this item.")
        if quantity > row["quantity"]:
            raise ApiError(409, "not_enough_stock", f"Only {row['quantity']} left.")
        order_id = self.store.insert_order(row, buyer.id, buyer.display_name, quantity, note)
        if order_id is None:
            raise ApiError(409, "unavailable", "Someone bought this just before you. Check the quantity again.")
        return self._order(self.store.get_order(order_id) or {})

    def orders(self, user: UserRecord) -> OrderBook:
        return OrderBook(
            buying=[self._order(row) for row in self.store.list_orders(buyer_id=user.id)],
            selling=[self._order(row) for row in self.store.list_orders(seller_id=user.id)],
        )

    def act(self, user: UserRecord, order_id: str, action: str, note: str) -> Order:
        order = self.store.get_order(order_id)
        if order is None or user.id not in (order["buyer_id"], order["seller_id"]):
            raise ApiError(404, "not_found", "Order not found.")
        side, allowed_from, target = _TRANSITIONS[action]
        role = "seller" if user.id == order["seller_id"] else "buyer"
        if side not in (role, "either"):
            raise ApiError(403, "not_allowed", f"Only the {side} can {action} this order.")
        if order["status"] not in allowed_from:
            raise ApiError(409, "order_closed", "This order has already moved on. Refresh to see its status.")
        restock = target in ("declined", "cancelled")
        seller_note = note if role == "seller" and note else None
        if not self.store.set_order_status(order, target, seller_note, restock):
            raise ApiError(409, "order_closed", "This order has already moved on. Refresh to see its status.")
        return self._order(next(row for row in self.store.list_orders(buyer_id=order["buyer_id"]) if row["id"] == order_id))

    # Reviews

    def review(self, user: UserRecord, listing_id: str, body: ReviewIn) -> ListingDetail:
        row = self._visible(listing_id, user)
        if row["seller_id"] == user.id:
            raise ApiError(403, "own_listing", "You cannot review your own listing.")
        if not self.store.has_completed_order(listing_id, user.id):
            raise ApiError(403, "not_a_buyer", "You can review an item after you have received it.")
        self.store.upsert_review(row, user.id, user.display_name, body.rating, body.comment)
        return self.detail(listing_id, user)

    def delete_review(self, user: UserRecord, listing_id: str) -> None:
        if not self.store.delete_review(listing_id, user.id):
            raise ApiError(404, "not_found", "You have not reviewed this item.")

    # Helpers

    def _visible(self, listing_id: str, viewer: UserRecord | None) -> dict:
        row = self.store.get_listing(listing_id)
        if row is None or row["status"] == "removed":
            raise ApiError(404, "not_found", "Listing not found.")
        if row["status"] == "paused" and (viewer is None or viewer.id != row["seller_id"]):
            raise ApiError(404, "not_found", "This listing is paused by the seller.")
        return row

    def _owned(self, seller: UserRecord, listing_id: str) -> dict:
        row = self.store.get_listing(listing_id)
        if row is None or row["status"] == "removed" or row["seller_id"] != seller.id:
            raise ApiError(404, "not_found", "Listing not found.")
        return row

    def _summary(self, row: dict, mine: bool) -> ListingSummary:
        return ListingSummary(
            id=row["id"],
            title=row["title"],
            category=row["category"],
            condition=row["condition"],
            price_paise=row["price_paise"],
            quantity=row["quantity"],
            status=_status(row),
            ward_id=row["ward_id"],
            ward_name=directory.ward_name(row["ward_id"], "City"),
            seller_id=row["seller_id"],
            seller_name=row["seller_name"],
            cover_url=_photo_url(row["cover_id"]) or media_service.cover_url(row["media"]),
            rating_avg=_rating(row["rating_avg"]),
            review_count=row["review_count"],
            open_orders=row["open_orders"] if mine else 0,
            created_at=row["created_at"],
        )

    def _order(self, row: dict) -> Order:
        return Order(
            id=row["id"],
            listing_id=row["listing_id"],
            title=row["title"],
            cover_url=_photo_url(row.get("cover_id")) or media_service.cover_url(row.get("media")),
            price_paise=row["price_paise"],
            quantity=row["quantity"],
            total_paise=row["price_paise"] * row["quantity"],
            buyer_id=row["buyer_id"],
            buyer_name=row["buyer_name"],
            seller_id=row["seller_id"],
            seller_name=row["seller_name"],
            note=row["note"],
            seller_note=row["seller_note"],
            status=row["status"],
            reviewed=bool(row.get("reviewed")),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


market_service = MarketService()

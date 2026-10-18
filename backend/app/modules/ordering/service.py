from collections import defaultdict

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.admin.service import admin_service
from app.modules.business.service import business_service
from app.modules.identity.store import UserRecord
from app.modules.ordering.schemas import CheckoutIn, Order, OrderEvent, OrderLine, OrderList, StatusIn
from app.modules.ordering.store import OrderStore

_CHANNEL_CATEGORY = {"grocery": "grocery", "food": "restaurant"}
_FEES = {"grocery": 2500, "food": 2500}
_BUYER_CANCEL = ("placed", "accepted")
_MANAGER_CANCEL = ("placed", "accepted", "preparing")
_FORWARD: dict[str, tuple[str, str]] = {
    "accept": ("placed", "accepted"),
    "prepare": ("accepted", "preparing"),
    "dispatch": ("preparing", "out_for_delivery"),
    "deliver": ("out_for_delivery", "delivered"),
}
_MANAGER_NEXT: dict[str, list[str]] = {
    "placed": ["accept", "cancel"],
    "accepted": ["prepare", "cancel"],
    "preparing": ["dispatch", "cancel"],
    "out_for_delivery": ["deliver"],
}


class OrderService:
    def __init__(self) -> None:
        self._store: OrderStore | None = None

    @property
    def store(self) -> OrderStore:
        if self._store is None:
            self._store = OrderStore(settings.orders_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = OrderStore(path)

    def checkout(self, user: UserRecord, body: CheckoutIn) -> OrderList:
        admin_service.require(body.channel, "This section is paused by the city admin.")
        if body.idempotency_key:
            existing = self.store.get_by_key(user.id, body.idempotency_key)
            if existing is not None:
                return OrderList(data=[self._order(existing, user)])
        groups: dict[str, list] = defaultdict(list)
        for line in body.lines:
            groups[line.shop_slug].append(line)
        if body.channel == "food" and len(groups) > 1:
            raise ApiError(409, "cart_restaurant_conflict", "A food order comes from one restaurant.")
        created: list[Order] = []
        for index, (slug, lines) in enumerate(groups.items()):
            key = body.idempotency_key if index == 0 else (f"{body.idempotency_key}:{slug}" if body.idempotency_key else None)
            if key:
                existing = self.store.get_by_key(user.id, key)
                if existing is not None:
                    created.append(self._order(existing, user))
                    continue
            created.append(self._place_shop(user, body, slug, lines, key))
        return OrderList(data=created)

    def mine(self, user: UserRecord) -> OrderList:
        return OrderList(data=[self._order(row, user) for row in self.store.list_orders(buyer_id=user.id)])

    def incoming(self, user: UserRecord) -> OrderList:
        shop_ids = business_service.owner_shop_ids(user.id)
        if user.role == "admin":
            rows = self.store.list_orders()
        else:
            rows = self.store.list_orders(shop_ids=list(shop_ids))
        return OrderList(data=[self._order(row, user) for row in rows])

    def get(self, user: UserRecord, order_id: str) -> Order:
        return self._order(self._visible(user, order_id), user)

    def admin_list(self, status: str | None = None, channel: str | None = None) -> OrderList:
        return OrderList(data=[self._order(row, None, manager=True) for row in self.store.list_orders(status=status, channel=channel)])

    def open_count(self) -> int:
        return self.store.open_count()

    def buyer_cancel(self, user: UserRecord, order_id: str) -> Order:
        row = self._visible(user, order_id)
        if row["buyer_id"] != user.id:
            raise ApiError(403, "not_allowed", "Only the buyer can cancel this way.")
        updated = self.store.set_status(order_id, _BUYER_CANCEL, "cancelled", None, user.id, user.display_name)
        if updated is None:
            raise ApiError(409, "order_closed", "This order can no longer be cancelled.")
        return self._order(updated, user)

    def act(self, user: UserRecord, order_id: str, body: StatusIn) -> Order:
        row = self._visible(user, order_id)
        manager = user.role == "admin" or row["shop_id"] in business_service.owner_shop_ids(user.id)
        if not manager:
            raise ApiError(403, "not_allowed", "Only the shop or a city admin can move this order.")
        if body.action == "cancel":
            updated = self.store.set_status(order_id, _MANAGER_CANCEL, "cancelled", body.note, user.id, user.display_name)
        else:
            expected, target = _FORWARD[body.action]
            updated = self.store.set_status(order_id, (expected,), target, body.note, user.id, user.display_name)
        if updated is None:
            raise ApiError(409, "order_closed", "This order has already moved on. Refresh to see its status.")
        return self._order(updated, user)

    def _place_shop(self, user: UserRecord, body: CheckoutIn, slug: str, lines: list, key: str | None) -> Order:
        snapshotted: list[dict] = []
        shop_row: dict | None = None
        for line in lines:
            shop, item = business_service.catalog_item(slug, line.item_id)
            expected = _CHANNEL_CATEGORY[body.channel]
            if shop["category"] != expected:
                raise ApiError(409, "wrong_channel", f"Order {body.channel} items from a {expected} shop.")
            if shop_row is None:
                shop_row = shop
            elif shop["id"] != shop_row["id"]:
                raise ApiError(409, "cart_shop_conflict", "Those items are not from the same shop.")
            if not item["is_available"]:
                raise ApiError(409, "unavailable", f"{item['name']} is not available right now.")
            snapshotted.append(
                {
                    "item_id": item["id"],
                    "name": item["name"],
                    "qty": line.qty,
                    "unit_price_paise": item["price_paise"],
                }
            )
        if shop_row is None:
            raise ApiError(422, "validation_error", "Add at least one item.")
        row = self.store.insert(
            buyer_id=user.id,
            buyer_name=user.display_name,
            channel=body.channel,
            shop_id=shop_row["id"],
            shop_slug=shop_row["slug"],
            shop_name=shop_row["name"],
            address=body.address,
            note=body.note,
            payment=body.payment,
            fee_paise=_FEES[body.channel],
            lines=snapshotted,
            idempotency_key=key,
            actor_id=user.id,
            actor_name=user.display_name,
        )
        return self._order(row, user)

    def _visible(self, user: UserRecord, order_id: str) -> dict:
        row = self.store.get(order_id)
        if row is None:
            raise ApiError(404, "not_found", "Order not found.")
        if user.role == "admin" or row["buyer_id"] == user.id:
            return row
        if row["shop_id"] in business_service.owner_shop_ids(user.id):
            return row
        raise ApiError(404, "not_found", "Order not found.")

    def _order(self, row: dict, viewer: UserRecord | None, manager: bool = False) -> Order:
        is_manager = manager or (
            viewer is not None and (viewer.role == "admin" or row["shop_id"] in business_service.owner_shop_ids(viewer.id))
        )
        is_buyer = viewer is not None and viewer.id == row["buyer_id"]
        return Order(
            id=row["id"],
            channel=row["channel"],
            shop_id=row["shop_id"],
            shop_slug=row["shop_slug"],
            shop_name=row["shop_name"],
            buyer_id=row["buyer_id"],
            buyer_name=row["buyer_name"],
            status=row["status"],
            address=row["address"],
            note=row["note"],
            payment=row["payment"],
            subtotal_paise=row["subtotal_paise"],
            fee_paise=row["fee_paise"],
            total_paise=row["total_paise"],
            lines=[
                OrderLine(
                    item_id=line["item_id"],
                    name=line["name"],
                    qty=line["qty"],
                    unit_price_paise=line["unit_price_paise"],
                    line_total_paise=line["qty"] * line["unit_price_paise"],
                )
                for line in row["lines"]
            ],
            events=[OrderEvent.model_validate(event) for event in row["events"]],
            can_cancel=is_buyer and row["status"] in _BUYER_CANCEL,
            next_actions=_MANAGER_NEXT.get(row["status"], []) if is_manager else [],
            placed_at=row["placed_at"],
            updated_at=row["updated_at"],
        )


order_service = OrderService()

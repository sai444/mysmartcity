from fastapi import APIRouter, Query

from app.modules.admin.service import admin_service
from app.modules.identity.router import AdminUser, CurrentUser
from app.modules.ordering.schemas import CheckoutIn, Channel, Order, OrderList, OrderStatus, StatusIn
from app.modules.ordering.service import order_service

router = APIRouter(prefix="/orders", tags=["orders"])

_ACTION_LOG = {
    "accept": "Accepted order",
    "prepare": "Started preparing order",
    "dispatch": "Sent order out for delivery",
    "deliver": "Marked order delivered",
    "cancel": "Cancelled order",
}


@router.post("", response_model=OrderList, status_code=201)
def checkout(body: CheckoutIn, user: CurrentUser) -> OrderList:
    return order_service.checkout(user, body)


@router.get("", response_model=OrderList)
def my_orders(user: CurrentUser) -> OrderList:
    return order_service.mine(user)


@router.get("/incoming", response_model=OrderList)
def incoming_orders(user: CurrentUser) -> OrderList:
    return order_service.incoming(user)


@router.get("/{order_id}", response_model=Order)
def get_order(order_id: str, user: CurrentUser) -> Order:
    return order_service.get(user, order_id)


@router.post("/{order_id}/cancel", response_model=Order)
def cancel_order(order_id: str, user: CurrentUser) -> Order:
    return order_service.buyer_cancel(user, order_id)


@router.post("/{order_id}/status", response_model=Order)
def act_on_order(order_id: str, body: StatusIn, user: CurrentUser) -> Order:
    order = order_service.act(user, order_id, body)
    admin_service.log(user.id, user.display_name, _ACTION_LOG[body.action], f"{order.shop_name} · {order.id[:8]}")
    return order


admin_orders_router = APIRouter(prefix="/admin/orders", tags=["admin"])


@admin_orders_router.get("", response_model=OrderList)
def admin_list_orders(
    _admin: AdminUser,
    status: OrderStatus | None = Query(None),
    channel: Channel | None = Query(None),
) -> OrderList:
    return order_service.admin_list(status, channel)


@admin_orders_router.post("/{order_id}/status", response_model=Order)
def admin_act_on_order(order_id: str, body: StatusIn, admin: AdminUser) -> Order:
    order = order_service.act(admin, order_id, body)
    admin_service.log(admin.id, admin.display_name, _ACTION_LOG[body.action], f"{order.shop_name} · {order.id[:8]}")
    return order

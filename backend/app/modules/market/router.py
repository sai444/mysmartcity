from fastapi import APIRouter, Query, Response

from app.modules.admin.service import admin_service
from app.modules.identity.router import CurrentUser, OptionalUser
from app.modules.market.schemas import (
    Category,
    ListingDetail,
    ListingIn,
    ListingList,
    ListingPatch,
    Order,
    OrderActionIn,
    OrderBook,
    OrderIn,
    ReviewIn,
    Sort,
)
from app.modules.market.service import market_service

router = APIRouter(prefix="/market", tags=["market"])

_PAUSED = "The market is paused by the city admin."


@router.get("/listings", response_model=ListingList)
def browse(
    q: str | None = Query(default=None, max_length=80),
    category: Category | None = None,
    ward_id: str | None = None,
    sort: Sort = "newest",
    include_sold: bool = False,
) -> ListingList:
    return market_service.browse(q, category, ward_id, sort, include_sold)


@router.get("/listings/mine", response_model=ListingList)
def my_listings(user: CurrentUser) -> ListingList:
    return market_service.mine(user.id)


@router.post("/listings", response_model=ListingDetail, status_code=201)
def create_listing(body: ListingIn, user: CurrentUser) -> ListingDetail:
    admin_service.require("market", _PAUSED)
    listing = market_service.create(user, body)
    admin_service.log(user.id, user.display_name, "Listed market item", listing.title)
    return listing


@router.get("/listings/{listing_id}", response_model=ListingDetail)
def listing_detail(listing_id: str, viewer: OptionalUser) -> ListingDetail:
    return market_service.detail(listing_id, viewer)


@router.patch("/listings/{listing_id}", response_model=ListingDetail)
def update_listing(listing_id: str, body: ListingPatch, user: CurrentUser) -> ListingDetail:
    admin_service.require("market", _PAUSED)
    return market_service.update(user, listing_id, body)


@router.delete("/listings/{listing_id}", status_code=204)
def remove_listing(listing_id: str, user: CurrentUser) -> None:
    market_service.remove(user, listing_id)


@router.post("/listings/{listing_id}/orders", response_model=Order, status_code=201)
def place_order(listing_id: str, body: OrderIn, user: CurrentUser) -> Order:
    admin_service.require("market", _PAUSED)
    return market_service.place_order(user, listing_id, body.quantity, body.note)


@router.put("/listings/{listing_id}/review", response_model=ListingDetail)
def write_review(listing_id: str, body: ReviewIn, user: CurrentUser) -> ListingDetail:
    return market_service.review(user, listing_id, body)


@router.delete("/listings/{listing_id}/review", status_code=204)
def delete_review(listing_id: str, user: CurrentUser) -> None:
    market_service.delete_review(user, listing_id)


@router.get("/orders", response_model=OrderBook)
def my_orders(user: CurrentUser) -> OrderBook:
    return market_service.orders(user)


@router.post("/orders/{order_id}/status", response_model=Order)
def act_on_order(order_id: str, body: OrderActionIn, user: CurrentUser) -> Order:
    return market_service.act(user, order_id, body.action, body.note)


@router.get("/photos/{photo_id}")
def photo(photo_id: str) -> Response:
    mime, data = market_service.photo(photo_id)
    return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=31536000, immutable"})

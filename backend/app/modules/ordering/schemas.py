from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Channel = Literal["grocery", "food"]
OrderStatus = Literal["placed", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled"]
PaymentMethod = Literal["upi", "cod"]
OrderAction = Literal["accept", "prepare", "dispatch", "deliver", "cancel"]
OrderView = Literal["buying", "selling"]


class CheckoutLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(min_length=1, max_length=64)
    shop_slug: str = Field(min_length=1, max_length=80)
    qty: int = Field(ge=1, le=99)


class CheckoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel: Channel
    address: str = Field(min_length=3, max_length=240)
    note: str = Field(default="", max_length=240)
    payment: PaymentMethod = "upi"
    lines: list[CheckoutLineIn] = Field(min_length=1, max_length=40)
    idempotency_key: str | None = Field(default=None, max_length=80)

    @field_validator("address", "note", "idempotency_key", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("idempotency_key", mode="before")
    @classmethod
    def empty_key(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class StatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: OrderAction
    note: str | None = Field(default=None, max_length=240)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class OrderLine(BaseModel):
    item_id: str
    name: str
    qty: int
    unit_price_paise: int
    line_total_paise: int


class OrderEvent(BaseModel):
    status: OrderStatus
    note: str | None
    actor_name: str
    created_at: str


class Order(BaseModel):
    id: str
    channel: Channel
    shop_id: str
    shop_slug: str
    shop_name: str
    buyer_id: str
    buyer_name: str
    status: OrderStatus
    address: str
    note: str
    payment: PaymentMethod
    subtotal_paise: int
    fee_paise: int
    total_paise: int
    lines: list[OrderLine]
    events: list[OrderEvent]
    can_cancel: bool
    next_actions: list[OrderAction]
    placed_at: str
    updated_at: str


class OrderList(BaseModel):
    data: list[Order]

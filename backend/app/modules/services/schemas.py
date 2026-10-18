from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ListingStatus = Literal["pending", "approved", "rejected", "disabled"]


class Sla(BaseModel):
    response_hours: int | None
    completion_hours: int | None
    note: str


class Category(BaseModel):
    id: str
    name: str
    sort_order: int
    active: bool
    subcategory_count: int = 0


class CategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=60)
    sort_order: int = Field(default=0, ge=0, le=999)
    active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class CategoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=60)
    sort_order: int | None = Field(default=None, ge=0, le=999)
    active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class Subcategory(BaseModel):
    id: str
    category_id: str
    category_name: str
    name: str
    response_hours: int | None
    completion_hours: int | None
    sla_note: str
    sla: Sla
    sort_order: int
    active: bool


class SubcategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: str
    name: str = Field(min_length=2, max_length=60)
    response_hours: int | None = Field(default=None, ge=1, le=168)
    completion_hours: int | None = Field(default=None, ge=1, le=720)
    sla_note: str = Field(default="", max_length=200)
    sort_order: int = Field(default=0, ge=0, le=999)
    active: bool = True

    @field_validator("name", "sla_note", "category_id", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class SubcategoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=60)
    response_hours: int | None = Field(default=None, ge=1, le=168)
    completion_hours: int | None = Field(default=None, ge=1, le=720)
    sla_note: str | None = Field(default=None, max_length=200)
    sort_order: int | None = Field(default=None, ge=0, le=999)
    active: bool | None = None

    @field_validator("name", "sla_note", "category_id", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class CategoryList(BaseModel):
    data: list[Category]


class SubcategoryList(BaseModel):
    data: list[Subcategory]


class CatalogCategory(BaseModel):
    id: str
    name: str
    subcategories: list[Subcategory]


class ServiceCatalog(BaseModel):
    data: list[CatalogCategory]


class ServiceListing(BaseModel):
    id: str
    title: str
    details: str
    category_id: str
    category_name: str
    subcategory_id: str
    subcategory_name: str
    price_paise: int | None
    ward_id: str
    ward_name: str
    area_text: str
    contact_name: str
    contact_phone: str | None
    provider_name: str
    sla: Sla
    status: ListingStatus
    review_note: str | None
    mine: bool = False
    created_at: str
    updated_at: str


class ServiceList(BaseModel):
    data: list[ServiceListing]


class ServiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=80)
    details: str = Field(min_length=12, max_length=800)
    subcategory_id: str
    price_paise: int | None = Field(default=None, ge=0, le=10_000_000)
    ward_id: str
    area_text: str = Field(min_length=3, max_length=120)
    contact_name: str = Field(min_length=2, max_length=60)
    contact_phone: str = Field(min_length=8, max_length=20)

    @field_validator("title", "details", "subcategory_id", "ward_id", "area_text", "contact_name", "contact_phone", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ServicePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=80)
    details: str | None = Field(default=None, min_length=12, max_length=800)
    subcategory_id: str | None = None
    price_paise: int | None = Field(default=None, ge=0, le=10_000_000)
    ward_id: str | None = None
    area_text: str | None = Field(default=None, min_length=3, max_length=120)
    contact_name: str | None = Field(default=None, min_length=2, max_length=60)
    contact_phone: str | None = Field(default=None, min_length=8, max_length=20)

    @field_validator("title", "details", "subcategory_id", "ward_id", "area_text", "contact_name", "contact_phone", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class StatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "disabled"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note", mode="before")
    @classmethod
    def empty_note(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

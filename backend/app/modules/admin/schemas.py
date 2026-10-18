from typing import Literal

from pydantic import BaseModel, ConfigDict


class Feature(BaseModel):
    key: str
    group: str
    label: str
    description: str
    enabled: bool


class FeatureList(BaseModel):
    data: list[Feature]


class PublicFeatures(BaseModel):
    features: dict[str, bool]


class FeaturePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class AdminUserRow(BaseModel):
    id: str
    email: str
    display_name: str
    ward_id: str | None
    role: Literal["admin", "resident"]
    status: Literal["active", "disabled"]
    created_at: str


class AdminUserList(BaseModel):
    data: list[AdminUserRow]


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "disabled"] | None = None
    role: Literal["admin", "resident"] | None = None


class AuditEntry(BaseModel):
    actor_name: str
    action: str
    target: str
    created_at: str


class AuditList(BaseModel):
    data: list[AuditEntry]


class Overview(BaseModel):
    users_total: int
    users_disabled: int
    admins: int
    shops: dict[str, int]
    properties: dict[str, int]
    brokers_pending: int
    features_on: int
    features_total: int
    reports_open: int
    notices_active: int
    orders_open: int
    services_pending: int

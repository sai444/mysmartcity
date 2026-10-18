from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

MapStyle = Literal["auto", "street", "voyager", "light", "dark", "satellite", "terrain"]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str
    display_name: str = Field(min_length=1, max_length=80)
    ui_mode: Literal["modern", "normal"] = "modern"
    ward_id: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("ward_id", mode="before")
    @classmethod
    def empty_ward(cls, value: object) -> object:
        if value == "":
            return None
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Use at least 8 characters.")
        if len(value) > 128:
            raise ValueError("Use at most 128 characters.")
        return value


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    ward_id: str | None = None
    ui_mode: Literal["modern", "normal"] | None = None
    map_style: MapStyle | None = None

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("ward_id", mode="before")
    @classmethod
    def empty_ward(cls, value: object) -> object:
        if value == "":
            return None
        return value


class RegisterResponse(BaseModel):
    id: str
    email: str
    display_name: str
    access_token: str
    expires_in: int


class TokenResponse(BaseModel):
    access_token: str
    expires_in: int


class MeResponse(BaseModel):
    id: str
    email: str
    display_name: str
    ward_id: str | None
    ui_mode: Literal["modern", "normal"]
    role: Literal["admin", "resident"]
    map_style: MapStyle = "auto"
    avatar_url: str | None
    default_address: str | None

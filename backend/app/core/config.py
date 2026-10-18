from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MyNagari"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    jwt_secret: str = "dev-only-mynagari-jwt-secret-32b"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    cookie_secure: bool = False
    identity_db: str = ""
    business_db: str = ""
    admin_db: str = ""
    civic_db: str = ""
    transit_db: str = ""
    market_db: str = ""
    property_db: str = ""
    shorts_db: str = ""
    media_db: str = ""
    orders_db: str = ""
    services_db: str = ""
    minio_endpoint: str = ""
    minio_access_key: str = "mynagari"
    minio_secret_key: str = "mynagari-minio"
    minio_bucket: str = "mynagari"
    minio_secure: bool = False
    google_maps_api_key: str = ""

    def model_post_init(self, __context: object) -> None:
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def identity_db_path(self) -> str:
        if self.identity_db.strip():
            return self.identity_db
        return str(_BACKEND_ROOT / "data" / "identity.sqlite")

    @property
    def business_db_path(self) -> str:
        if self.business_db.strip():
            return self.business_db
        return str(_BACKEND_ROOT / "data" / "businesses.sqlite")

    @property
    def admin_db_path(self) -> str:
        if self.admin_db.strip():
            return self.admin_db
        return str(_BACKEND_ROOT / "data" / "admin.sqlite")

    @property
    def civic_db_path(self) -> str:
        if self.civic_db.strip():
            return self.civic_db
        return str(_BACKEND_ROOT / "data" / "civic.sqlite")

    @property
    def transit_db_path(self) -> str:
        if self.transit_db.strip():
            return self.transit_db
        return str(_BACKEND_ROOT / "data" / "transit.sqlite")

    @property
    def property_db_path(self) -> str:
        if self.property_db.strip():
            return self.property_db
        return str(_BACKEND_ROOT / "data" / "property.sqlite")

    @property
    def market_db_path(self) -> str:
        if self.market_db.strip():
            return self.market_db
        return str(_BACKEND_ROOT / "data" / "market.sqlite")

    @property
    def shorts_db_path(self) -> str:
        if self.shorts_db.strip():
            return self.shorts_db
        return str(_BACKEND_ROOT / "data" / "shorts.sqlite")

    @property
    def media_db_path(self) -> str:
        if self.media_db.strip():
            return self.media_db
        return str(_BACKEND_ROOT / "data" / "media.sqlite")

    @property
    def orders_db_path(self) -> str:
        if self.orders_db.strip():
            return self.orders_db
        return str(_BACKEND_ROOT / "data" / "orders.sqlite")

    @property
    def services_db_path(self) -> str:
        if self.services_db.strip():
            return self.services_db
        return str(_BACKEND_ROOT / "data" / "services.sqlite")


settings = Settings()

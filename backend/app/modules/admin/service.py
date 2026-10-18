from app.core.config import settings
from app.core.errors import ApiError
from app.modules.admin.store import AdminStore

FEATURES: list[dict[str, str]] = [
    {"key": "city", "group": "City", "label": "City home", "description": "Ward pulse, climate, and the service grid."},
    {"key": "map", "group": "City", "label": "City map", "description": "Facilities, parking, and shops on a map."},
    {"key": "notices", "group": "City", "label": "Notices", "description": "Ward notices and emergency alerts."},
    {"key": "waste", "group": "City", "label": "Waste collection", "description": "Today's collection windows."},
    {"key": "reports", "group": "City", "label": "Issue reports", "description": "Residents report potholes, lights, garbage."},
    {"key": "utilities", "group": "City", "label": "Utilities and bills", "description": "Bill list and payments."},
    {"key": "parking", "group": "City", "label": "Parking", "description": "Open lots and free spaces."},
    {"key": "facilities", "group": "City", "label": "Facilities", "description": "Hospitals, libraries, parks, offices."},
    {"key": "shop", "group": "Everyday", "label": "Shops", "description": "Shop directory and public shop profiles."},
    {"key": "grocery", "group": "Everyday", "label": "Grocery", "description": "Grocery catalog and home delivery."},
    {"key": "food", "group": "Everyday", "label": "Food", "description": "Restaurant menus and food orders."},
    {"key": "travel", "group": "Everyday", "label": "Travel", "description": "Local vehicles, fares, and contact numbers."},
    {"key": "market", "group": "Everyday", "label": "Market", "description": "Second-hand listings."},
    {
        "key": "services",
        "group": "Everyday",
        "label": "Local services",
        "description": "Plumbers, tutors, and other providers. Admin owns categories, SLA, and approval.",
    },
    {
        "key": "property",
        "group": "Everyday",
        "label": "Property",
        "description": "Buy or sell homes and land. Owners, verified brokers, and the city desk list; buyers make offers.",
    },
    {
        "key": "shorts",
        "group": "Everyday",
        "label": "Shorts",
        "description": "Short videos from residents, with sponsored ad shorts in the feed.",
    },
    {"key": "activity", "group": "Accounts", "label": "Activity", "description": "Residents' orders, bills, and bookings."},
    {"key": "registration", "group": "Accounts", "label": "New sign-ups", "description": "Let new residents create accounts."},
    {
        "key": "shop_requests",
        "group": "Accounts",
        "label": "Shop listing requests",
        "description": "Let residents submit their shop for admin approval.",
    },
]

_KEYS = {feature["key"] for feature in FEATURES}


class AdminService:
    def __init__(self) -> None:
        self._store: AdminStore | None = None

    @property
    def store(self) -> AdminStore:
        if self._store is None:
            self._store = AdminStore(settings.admin_db_path)
        return self._store

    def rebind(self, path: str) -> None:
        if self._store is not None:
            self._store.close()
        self._store = AdminStore(path)

    def flags(self) -> dict[str, bool]:
        stored = self.store.flags()
        return {key: stored.get(key, True) for key in _KEYS}

    def features(self) -> list[dict]:
        flags = self.flags()
        return [{**feature, "enabled": flags[feature["key"]]} for feature in FEATURES]

    def is_enabled(self, key: str) -> bool:
        return self.store.flags().get(key, True)

    def require(self, key: str, message: str) -> None:
        if not self.is_enabled(key):
            raise ApiError(403, "feature_disabled", message)

    def set_flag(self, key: str, enabled: bool) -> dict:
        if key not in _KEYS:
            raise ApiError(404, "not_found", "That feature does not exist.")
        self.store.set_flag(key, enabled)
        return next(feature for feature in self.features() if feature["key"] == key)

    def log(self, actor_id: str, actor_name: str, action: str, target: str) -> None:
        self.store.log(actor_id, actor_name, action, target)

    def recent(self, limit: int = 50) -> list[dict]:
        return self.store.recent(limit)


admin_service = AdminService()

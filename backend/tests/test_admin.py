from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

SHOP = {
    "name": "Ravi Repairs",
    "category": "services",
    "ward_id": W1,
    "address_text": "9 Market Lane",
    "opening_hours": "10:00–19:00",
    "about": "Phone and radio repairs.",
    "latitude": 12.9721,
    "longitude": 77.5951,
    "services": [{"name": "Screen swap", "price_paise": 90000}],
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    assert signed.status_code == 200
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident(email: str = "ravi@example.com") -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": "Ravi", "ward_id": W1},
    )
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def test_features_default_on_and_admin_can_toggle() -> None:
    public = client.get("/api/v1/features").json()["features"]
    assert public["map"] is True and public["registration"] is True

    resident = _resident()
    assert client.patch("/api/v1/admin/features/map", headers=resident, json={"enabled": False}).status_code == 403

    admin = _admin()
    turned = client.patch("/api/v1/admin/features/map", headers=admin, json={"enabled": False})
    assert turned.status_code == 200
    assert turned.json()["enabled"] is False
    assert client.get("/api/v1/features").json()["features"]["map"] is False
    assert client.patch("/api/v1/admin/features/nope", headers=admin, json={"enabled": False}).status_code == 404

    log = client.get("/api/v1/admin/audit", headers=admin).json()["data"]
    assert log[0]["action"] == "Turned off"
    assert log[0]["target"] == "City map"


def test_registration_can_be_paused() -> None:
    admin = _admin()
    client.patch("/api/v1/admin/features/registration", headers=admin, json={"enabled": False})
    refused = client.post(
        "/api/v1/auth/register",
        json={"email": "late@example.com", "password": "city-life-1", "display_name": "Late"},
    )
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "feature_disabled"


def test_resident_shop_request_waits_for_approval() -> None:
    resident = _resident()
    requested = client.post("/api/v1/businesses/requests", headers=resident, json=SHOP)
    assert requested.status_code == 201
    assert requested.json()["status"] == "pending"
    slug = requested.json()["slug"]

    assert client.get(f"/api/v1/businesses/{slug}").status_code == 404
    mapped = client.get("/api/v1/city/map", params={"ward_id": W1}).json()["places"]
    assert all(place["name"] != "Ravi Repairs" for place in mapped)

    mine = client.get("/api/v1/businesses/requests/mine", headers=resident).json()["data"]
    assert [shop["status"] for shop in mine] == ["pending"]

    admin = _admin()
    assert client.post(f"/api/v1/businesses/{slug}/status", headers=resident, json={"status": "approved"}).status_code == 403
    approved = client.post(f"/api/v1/businesses/{slug}/status", headers=admin, json={"status": "approved"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert client.get(f"/api/v1/businesses/{slug}").status_code == 200

    disabled = client.post(
        f"/api/v1/businesses/{slug}/status", headers=admin, json={"status": "disabled", "note": "Licence expired"}
    )
    assert disabled.json()["review_note"] == "Licence expired"
    assert client.get(f"/api/v1/businesses/{slug}").status_code == 404

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["shops"]["disabled"] == 1


def test_shop_requests_can_be_paused() -> None:
    admin = _admin()
    client.patch("/api/v1/admin/features/shop_requests", headers=admin, json={"enabled": False})
    refused = client.post("/api/v1/businesses/requests", headers=_resident(), json=SHOP)
    assert refused.status_code == 403


def test_admin_disables_seeded_shop_and_listing() -> None:
    admin = _admin()
    shop = client.get("/api/v1/businesses/neem-kirana").json()
    item_id = shop["catalog"][0]["id"]
    toggled = client.patch(
        f"/api/v1/businesses/neem-kirana/items/{item_id}", headers=admin, json={"is_available": False}
    )
    assert toggled.status_code == 200
    assert next(item for item in toggled.json()["catalog"] if item["id"] == item_id)["is_available"] is False

    client.post("/api/v1/businesses/neem-kirana/status", headers=admin, json={"status": "disabled"})
    assert client.get("/api/v1/businesses/neem-kirana").status_code == 404
    managed = client.get("/api/v1/businesses/mine", headers=admin).json()["data"]
    assert next(row for row in managed if row["slug"] == "neem-kirana")["status"] == "disabled"


def test_admin_manages_users() -> None:
    admin = _admin()
    _resident()
    users = client.get("/api/v1/admin/users", headers=admin).json()["data"]
    ravi = next(user for user in users if user["email"] == "ravi@example.com")
    me = next(user for user in users if user["email"] == "admin@example.com")

    disabled = client.patch(f"/api/v1/admin/users/{ravi['id']}", headers=admin, json={"status": "disabled"})
    assert disabled.json()["status"] == "disabled"
    blocked = client.post("/api/v1/auth/login", json={"email": "ravi@example.com", "password": "city-life-1"})
    assert blocked.status_code == 401

    self_lock = client.patch(f"/api/v1/admin/users/{me['id']}", headers=admin, json={"status": "disabled"})
    assert self_lock.status_code == 409

    promoted = client.patch(f"/api/v1/admin/users/{ravi['id']}", headers=admin, json={"role": "admin", "status": "active"})
    assert promoted.json()["role"] == "admin"

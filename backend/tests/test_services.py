from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service
from app.modules.services.seed import PLUMBING

client = TestClient(app)

LISTING = {
    "title": "Emergency tap fix",
    "details": "I fix leaking taps and flush valves the same day you call, including evenings.",
    "subcategory_id": PLUMBING,
    "price_paise": 35000,
    "ward_id": W1,
    "area_text": "Gandhi Nagar blocks A–C",
    "contact_name": "Kiran",
    "contact_phone": "98450 44011",
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident(email: str, name: str) -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": name, "ward_id": W1},
    )
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def test_catalog_and_public_listings_include_sla_and_contact() -> None:
    catalog = client.get("/api/v1/services/catalog").json()["data"]
    home = next(row for row in catalog if row["name"] == "Home")
    plumbing = next(row for row in home["subcategories"] if row["name"] == "Plumbing")
    assert plumbing["sla"]["response_hours"] == 2
    assert plumbing["sla"]["completion_hours"] == 24

    public = client.get("/api/v1/services").json()["data"]
    assert {row["title"] for row in public} == {"Leak and tap repair", "Fan, switch, and wiring check", "Class 6–10 maths at home"}
    leak = next(row for row in public if row["title"] == "Leak and tap repair")
    assert leak["category_name"] == "Home"
    assert leak["subcategory_name"] == "Plumbing"
    assert leak["price_paise"] == 45000
    assert leak["contact_phone"] == "98450 22011"
    assert leak["sla"]["note"].startswith("Urgent leaks")


def test_provider_listing_needs_admin_approval_and_sla_is_admin_owned() -> None:
    admin = _admin()
    provider = _resident("plumber@example.com", "Kiran")
    visitor = _resident("neighbour@example.com", "Neighbour")

    created = client.post("/api/v1/services", headers=provider, json=LISTING)
    assert created.status_code == 201
    listing = created.json()
    assert listing["status"] == "pending"
    assert listing["contact_phone"] == "98450 44011"
    listing_id = listing["id"]

    assert listing_id not in {row["id"] for row in client.get("/api/v1/services").json()["data"]}
    assert client.get(f"/api/v1/services/{listing_id}").status_code == 404
    mine = client.get("/api/v1/services/mine", headers=provider).json()["data"]
    assert mine[0]["id"] == listing_id

    assert client.post(f"/api/v1/services/{listing_id}/status", headers=provider, json={"status": "approved"}).status_code == 403
    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["services_pending"] == 1

    approved = client.post(f"/api/v1/services/{listing_id}/status", headers=admin, json={"status": "approved"})
    assert approved.status_code == 200
    live = client.get(f"/api/v1/services/{listing_id}", headers=visitor).json()
    assert live["status"] == "approved"
    assert live["contact_name"] == "Kiran"
    assert live["contact_phone"] == "98450 44011"
    assert live["sla"]["response_hours"] == 2

    sla = client.patch(
        f"/api/v1/services/subcategories/{PLUMBING}",
        headers=admin,
        json={"response_hours": 1, "completion_hours": 12, "sla_note": "Call back in one hour."},
    )
    assert sla.status_code == 200
    assert sla.json()["sla"]["response_hours"] == 1
    refreshed = client.get(f"/api/v1/services/{listing_id}").json()
    assert refreshed["sla"]["response_hours"] == 1
    assert refreshed["sla"]["note"] == "Call back in one hour."

    edited = client.patch(
        f"/api/v1/services/{listing_id}",
        headers=provider,
        json={"details": "Same-day tap, flush, and tank overflow work in Gandhi Nagar."},
    )
    assert edited.status_code == 200
    assert edited.json()["status"] == "pending"
    assert client.get(f"/api/v1/services/{listing_id}").status_code == 404


def test_admin_controls_categories_and_can_pause_listings() -> None:
    admin = _admin()
    provider = _resident("tutor@example.com", "Asha")

    created = client.post("/api/v1/services/categories", headers=admin, json={"name": "Pets", "sort_order": 4})
    assert created.status_code == 201
    category_id = created.json()["id"]
    sub = client.post(
        "/api/v1/services/subcategories",
        headers=admin,
        json={
            "category_id": category_id,
            "name": "Pet walking",
            "response_hours": 6,
            "completion_hours": 24,
            "sla_note": "A walker confirms the slot the same day.",
        },
    )
    assert sub.status_code == 201
    subcategory_id = sub.json()["id"]
    catalog = client.get("/api/v1/services/catalog").json()["data"]
    assert any(row["name"] == "Pets" for row in catalog)

    listing = client.post(
        "/api/v1/services",
        headers=provider,
        json={**LISTING, "title": "Evening dog walk", "subcategory_id": subcategory_id, "price_paise": 20000},
    )
    assert listing.status_code == 201
    client.post(f"/api/v1/services/{listing.json()['id']}/status", headers=admin, json={"status": "approved"})

    hidden = client.patch(f"/api/v1/services/categories/{category_id}", headers=admin, json={"active": False})
    assert hidden.json()["active"] is False
    assert all(row["name"] != "Pets" for row in client.get("/api/v1/services/catalog").json()["data"])
    assert listing.json()["id"] not in {row["id"] for row in client.get("/api/v1/services").json()["data"]}

    refused = client.post("/api/v1/services", headers=provider, json={**LISTING, "subcategory_id": subcategory_id})
    assert refused.status_code == 422

    client.patch("/api/v1/admin/features/services", headers=admin, json={"enabled": False})
    paused = client.post("/api/v1/services", headers=provider, json=LISTING)
    assert paused.status_code == 403
    live = client.post("/api/v1/services", headers=admin, json=LISTING)
    assert live.status_code == 201
    assert live.json()["status"] == "approved"

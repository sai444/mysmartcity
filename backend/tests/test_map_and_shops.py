from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

ACCOUNT = {
    "email": "shopkeeper@example.com",
    "password": "city-life-1",
    "display_name": "Ravi",
    "ui_mode": "modern",
    "ward_id": W1,
}


def _token() -> str:
    created = client.post("/api/v1/auth/register", json=ACCOUNT)
    assert created.status_code == 200
    return created.json()["access_token"]


def _admin_token() -> str:
    identity_service.store.seed_demo()
    signed = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "nagari-admin"},
    )
    assert signed.status_code == 200
    return signed.json()["access_token"]


def test_city_map_lists_places_and_seeded_shops() -> None:
    response = client.get("/api/v1/city/map", params={"ward_id": W1})
    assert response.status_code == 200
    body = response.json()
    assert body["zoom"] == 15
    kinds = {place["kind"] for place in body["places"]}
    assert kinds == {"facility", "parking", "business", "property"}
    home = next(place for place in body["places"] if place["name"] == "Independent house with garden")
    assert home["href"].startswith("/property/") and home["latitude"]
    shop = next(place for place in body["places"] if place["name"] == "Neem Kirana")
    assert shop["href"] == "/b/neem-kirana"
    assert shop["latitude"]
    assert shop["longitude"]


def test_public_shop_profile_includes_catalog() -> None:
    response = client.get("/api/v1/businesses/neem-kirana")
    assert response.status_code == 200
    body = response.json()
    assert body["profile_path"] == "/b/neem-kirana"
    assert body["ward_name"] == "Gandhi Nagar"
    assert body["opening_hours"] == "7:00–21:00"
    rice = next(item for item in body["catalog"] if item["name"] == "Sona masuri rice")
    assert rice["image"] and rice["image"].startswith("data:image/png")
    assert body["owned"] is False


def test_onboarding_issues_a_profile_the_map_can_show() -> None:
    resident = {"Authorization": f"Bearer {_token()}"}
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    refused = client.post(
        "/api/v1/businesses",
        json={
            "name": "Corner Provisions",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "2 Station Road",
            "phone": "080-4001-2299",
            "opening_hours": "8:00–20:00",
            "about": "A new grocery on Station Road.",
            "latitude": 12.9724,
            "longitude": 77.5948,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "is_available": True}],
        },
    )
    assert refused.status_code == 401

    resident_attempt = client.post(
        "/api/v1/businesses",
        headers=resident,
        json={
            "name": "Corner Provisions",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "2 Station Road",
            "opening_hours": "8:00–20:00",
            "about": "A new grocery on Station Road.",
            "latitude": 12.9724,
            "longitude": 77.5948,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "is_available": True}],
        },
    )
    assert resident_attempt.status_code == 403
    assert resident_attempt.json()["error"]["code"] == "not_admin"

    created = client.post(
        "/api/v1/businesses",
        headers=headers,
        json={
            "name": "Corner Provisions",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "2 Station Road",
            "phone": "",
            "opening_hours": "8:00–20:00",
            "about": "A new grocery on Station Road.",
            "latitude": 12.9724,
            "longitude": 77.5948,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "is_available": True}],
        },
    )
    assert created.status_code == 201
    shop = created.json()
    assert shop["slug"] == "corner-provisions"
    assert shop["profile_path"] == "/b/corner-provisions"
    assert shop["phone"] is None
    assert shop["owned"] is True
    assert shop["catalog"][0]["name"] == "Toor dal"

    public = client.get("/api/v1/businesses/corner-provisions")
    assert public.status_code == 200
    assert public.json()["catalog"][0]["price_paise"] == 14000

    mapped = client.get("/api/v1/city/map", params={"ward_id": W1})
    assert any(place["href"] == "/b/corner-provisions" for place in mapped.json()["places"])

    mine = client.get("/api/v1/businesses/mine", headers=headers)
    assert mine.status_code == 200
    assert mine.json()["data"][0]["slug"] == "corner-provisions"

    added = client.post(
        "/api/v1/businesses/corner-provisions/items",
        headers=headers,
        json={"name": "Jaggery", "description": "500 g", "price_paise": 5500, "is_available": True},
    )
    assert added.status_code == 200
    names = [item["name"] for item in added.json()["catalog"]]
    assert names == ["Toor dal", "Jaggery"]

    empty = client.post(
        "/api/v1/businesses",
        headers=headers,
        json={
            "name": "Empty Shelf",
            "category": "general",
            "ward_id": W1,
            "address_text": "1 Lane",
            "opening_hours": "9:00–17:00",
            "about": "Nothing listed yet.",
            "latitude": 12.97,
            "longitude": 77.59,
            "catalog": [],
        },
    )
    assert empty.status_code == 422


def test_catalog_items_carry_photos() -> None:
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    photo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="
    created = client.post(
        "/api/v1/businesses",
        headers=headers,
        json={
            "name": "Photo Provisions",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "4 Station Road",
            "opening_hours": "8:00–20:00",
            "about": "Groceries with pictures.",
            "latitude": 12.9724,
            "longitude": 77.5948,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "image": photo}],
        },
    )
    assert created.status_code == 201
    slug = created.json()["slug"]
    assert created.json()["catalog"][0]["image"] == photo

    added = client.post(
        f"/api/v1/businesses/{slug}/items",
        headers=headers,
        json={"name": "Jaggery", "description": "500 g", "price_paise": 5500, "image": photo},
    )
    assert added.status_code == 200
    public = client.get(f"/api/v1/businesses/{slug}").json()
    assert [item["image"] for item in public["catalog"]] == [photo, photo]

    bad = client.post(
        f"/api/v1/businesses/{slug}/items",
        headers=headers,
        json={"name": "Salt", "price_paise": 2000, "image": "https://example.com/salt.jpg"},
    )
    assert bad.status_code == 422


def test_public_profile_lists_seeded_services() -> None:
    body = client.get("/api/v1/businesses/market-medicals").json()
    services = {service["name"]: service for service in body["services"]}
    assert services["Blood pressure check"]["duration_minutes"] == 10
    assert services["Home delivery"]["price_paise"] is None
    assert client.get("/api/v1/businesses/neem-kirana").json()["services"] == []


def test_admin_removes_a_shop_from_the_map() -> None:
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    removed = client.delete("/api/v1/businesses/neem-kirana", headers=headers)
    assert removed.status_code == 204
    assert client.get("/api/v1/businesses/neem-kirana").status_code == 404
    mapped = client.get("/api/v1/city/map", params={"ward_id": W1})
    assert all(place["name"] != "Neem Kirana" for place in mapped.json()["places"])

    resident = {"Authorization": f"Bearer {_token()}"}
    refused = client.delete("/api/v1/businesses/lake-view-tiffin", headers=resident)
    assert refused.status_code == 403


def test_admin_manages_services() -> None:
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    created = client.post(
        "/api/v1/businesses",
        headers=headers,
        json={
            "name": "Sharp Cuts",
            "category": "services",
            "ward_id": W1,
            "address_text": "5 Temple Street",
            "opening_hours": "10:00–20:00",
            "about": "A barber shop off Temple Street.",
            "latitude": 12.971,
            "longitude": 77.595,
            "services": [{"name": "Haircut", "price_paise": 15000, "duration_minutes": 30}],
        },
    )
    assert created.status_code == 201
    shop = created.json()
    assert shop["catalog"] == []
    assert shop["services"][0]["name"] == "Haircut"
    assert shop["services"][0]["is_available"] is True
    haircut_id = shop["services"][0]["id"]

    last_listing = client.delete(f"/api/v1/businesses/sharp-cuts/services/{haircut_id}", headers=headers)
    assert last_listing.status_code == 409

    added = client.post(
        "/api/v1/businesses/sharp-cuts/services",
        headers=headers,
        json={"name": "Beard trim", "description": "With hot towel"},
    )
    assert added.status_code == 200
    assert [service["name"] for service in added.json()["services"]] == ["Haircut", "Beard trim"]
    assert added.json()["services"][1]["price_paise"] is None

    removed = client.delete(f"/api/v1/businesses/sharp-cuts/services/{haircut_id}", headers=headers)
    assert removed.status_code == 204
    assert [service["name"] for service in client.get("/api/v1/businesses/sharp-cuts").json()["services"]] == ["Beard trim"]

    bad_duration = client.post(
        "/api/v1/businesses/sharp-cuts/services",
        headers=headers,
        json={"name": "Instant", "duration_minutes": 1},
    )
    assert bad_duration.status_code == 422

    demo = client.post(
        "/api/v1/businesses/market-medicals/services",
        headers=headers,
        json={"name": "Takeover"},
    )
    assert demo.status_code == 200
    assert any(service["name"] == "Takeover" for service in demo.json()["services"])

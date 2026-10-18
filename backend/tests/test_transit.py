from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

ACCOUNT = {
    "email": "rider@example.com",
    "password": "city-life-1",
    "display_name": "Ravi",
    "ui_mode": "modern",
    "ward_id": W1,
}

VEHICLE = {
    "name": "Night taxi",
    "kind": "taxi",
    "registration": "KA01-TX-9",
    "origin": "Market Ward",
    "destination": "Lake View",
    "price_paise": 18000,
    "seats": 4,
    "phone": "98450-10009",
    "contact_name": "Sana",
    "minutes": 25,
    "departures": "22:00, 23:30",
    "notes": "Call 20 minutes ahead.",
    "is_active": True,
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    assert signed.status_code == 200
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def test_public_list_includes_seeded_vehicles() -> None:
    response = client.get("/api/v1/transit/vehicles")
    assert response.status_code == 200
    names = {row["name"] for row in response.json()["data"]}
    assert "City bus 14" in names
    bus = next(row for row in response.json()["data"] if row["name"] == "City bus 14")
    assert bus["phone"] == "080-4100-1401"
    assert bus["price_paise"] == 2500


def test_admin_adds_prices_and_removes_a_vehicle() -> None:
    created_user = client.post("/api/v1/auth/register", json=ACCOUNT)
    resident = {"Authorization": f"Bearer {created_user.json()['access_token']}"}
    refused = client.post("/api/v1/transit/vehicles", headers=resident, json=VEHICLE)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "not_admin"

    headers = _admin()
    created = client.post("/api/v1/transit/vehicles", headers=headers, json=VEHICLE)
    assert created.status_code == 201
    vehicle = created.json()
    assert vehicle["contact_name"] == "Sana"
    assert any(row["id"] == vehicle["id"] for row in client.get("/api/v1/transit/vehicles").json()["data"])

    updated = client.patch(
        f"/api/v1/transit/vehicles/{vehicle['id']}",
        headers=headers,
        json={**VEHICLE, "price_paise": 20000, "phone": "98450-10010", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["price_paise"] == 20000
    assert updated.json()["phone"] == "98450-10010"
    assert all(row["id"] != vehicle["id"] for row in client.get("/api/v1/transit/vehicles").json()["data"])

    same_place = client.post(
        "/api/v1/transit/vehicles",
        headers=headers,
        json={**VEHICLE, "destination": "Market Ward"},
    )
    assert same_place.status_code == 422

    removed = client.delete(f"/api/v1/transit/vehicles/{vehicle['id']}", headers=headers)
    assert removed.status_code == 204
    managed = client.get("/api/v1/transit/vehicles/manage", headers=headers)
    assert all(row["id"] != vehicle["id"] for row in managed.json()["data"])


GANDHI = {"latitude": 12.9716, "longitude": 77.5946, "label": "Gandhi Nagar"}
LAKE = {"latitude": 12.9828, "longitude": 77.6184, "label": "Lake View"}


def test_public_fares_include_seeded_km_rules() -> None:
    response = client.get("/api/v1/transit/fares")
    assert response.status_code == 200
    kinds = {row["kind"] for row in response.json()["rules"]}
    assert kinds == {"auto", "taxi", "bus", "metro", "boat"}
    auto = next(row for row in response.json()["rules"] if row["kind"] == "auto")
    assert auto["included_km"] == 1.5
    assert auto["per_km_paise"] == 1800
    names = {row["name"] for row in response.json()["charges"]}
    assert "Booking fee" in names


def test_quote_uses_distance_and_admin_charges() -> None:
    quote = client.post(
        "/api/v1/transit/quote",
        json={"origin": GANDHI, "destination": LAKE, "seats": 1, "at": "2026-10-17T12:00:00+05:30"},
    )
    assert quote.status_code == 200
    body = quote.json()
    assert 2.4 < body["distance_km"] < 3.2
    auto = next(row for row in body["quotes"] if row["kind"] == "auto")
    assert auto["fare_paise"] >= 4000
    labels = [line["label"] for line in auto["breakdown"]]
    assert any("Base" in label for label in labels)
    assert "Booking fee" in labels
    assert any(item["name"] == "Lake auto stand" for item in auto["vehicles"])

    same = client.post("/api/v1/transit/quote", json={"origin": GANDHI, "destination": GANDHI})
    assert same.status_code == 422
    assert same.json()["error"]["code"] == "same_place"


def test_admin_edits_km_rule_and_extra_charge() -> None:
    created_user = client.post("/api/v1/auth/register", json={**ACCOUNT, "email": "fare-user@example.com"})
    resident = {"Authorization": f"Bearer {created_user.json()['access_token']}"}
    refused = client.patch(
        "/api/v1/transit/fares/auto",
        headers=resident,
        json={
            "base_paise": 4000,
            "included_km": 1,
            "per_km_paise": 2000,
            "per_minute_paise": 0,
            "min_paise": 4000,
            "night_surcharge_pct": 0,
            "night_start": "22:00",
            "night_end": "05:00",
            "per_seat": False,
            "speed_kmh": 22,
        },
    )
    assert refused.status_code == 403

    headers = _admin()
    updated = client.patch(
        "/api/v1/transit/fares/auto",
        headers=headers,
        json={
            "base_paise": 4000,
            "included_km": 1,
            "per_km_paise": 2000,
            "per_minute_paise": 0,
            "min_paise": 4000,
            "night_surcharge_pct": 0,
            "night_start": "22:00",
            "night_end": "05:00",
            "per_seat": False,
            "speed_kmh": 22,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["base_paise"] == 4000
    assert updated.json()["per_km_paise"] == 2000

    created = client.post(
        "/api/v1/transit/fares/charges",
        headers=headers,
        json={"kind": "all", "name": "Toll", "amount": 1500, "charge_type": "fixed", "is_active": True},
    )
    assert created.status_code == 201
    charge = created.json()
    quote = client.post(
        "/api/v1/transit/quote",
        json={"origin": GANDHI, "destination": LAKE, "at": "2026-10-17T12:00:00+05:30"},
    )
    auto = next(row for row in quote.json()["quotes"] if row["kind"] == "auto")
    assert any(line["label"] == "Toll" for line in auto["breakdown"])

    paused = client.patch(
        f"/api/v1/transit/fares/charges/{charge['id']}",
        headers=headers,
        json={"kind": "all", "name": "Toll", "amount": 1500, "charge_type": "fixed", "is_active": False},
    )
    assert paused.status_code == 200
    assert paused.json()["is_active"] is False

    removed = client.delete(f"/api/v1/transit/fares/charges/{charge['id']}", headers=headers)
    assert removed.status_code == 204


def test_maps_config_and_road_distance_quote() -> None:
    maps = client.get("/api/v1/transit/maps")
    assert maps.status_code == 200
    body = maps.json()
    assert body["provider"] in {"google", "osm"}
    if body["provider"] == "osm":
        assert body["browser_key"] is None

    quote = client.post(
        "/api/v1/transit/quote",
        json={"origin": GANDHI, "destination": LAKE, "seats": 1, "distance_km": 5.0, "at": "2026-10-17T12:00:00+05:30"},
    )
    assert quote.status_code == 200
    assert quote.json()["distance_km"] == 5.0
    auto = next(row for row in quote.json()["quotes"] if row["kind"] == "auto")
    assert any("3.5 km" in line["label"] for line in auto["breakdown"])


def test_night_surcharge_and_per_seat() -> None:
    quote = client.post(
        "/api/v1/transit/quote",
        json={"origin": GANDHI, "destination": LAKE, "seats": 2, "at": "2026-10-17T23:15:00+05:30"},
    )
    assert quote.status_code == 200
    auto = next(row for row in quote.json()["quotes"] if row["kind"] == "auto")
    bus = next(row for row in quote.json()["quotes"] if row["kind"] == "bus")
    assert auto["night"] is True
    assert any("Night" in line["label"] for line in auto["breakdown"])
    assert bus["per_seat"] is True
    assert any("2 seats" in line["label"] for line in bus["breakdown"])

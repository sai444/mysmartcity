from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)


def _admin() -> dict:
    identity_service.store.seed_demo()
    token = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"}).json()
    return {"Authorization": f"Bearer {token['access_token']}"}


def test_admin_adds_ward_with_places_and_residents_see_it():
    headers = _admin()
    ward = client.post(
        "/api/v1/admin/wards",
        json={"name": "River Side", "code": "w04", "latitude": 12.99, "longitude": 77.6},
        headers=headers,
    )
    assert ward.status_code == 201
    ward_id = ward.json()["id"]
    assert ward.json()["code"] == "W04"

    clinic = client.post(
        "/api/v1/admin/facilities",
        json={
            "ward_id": ward_id,
            "kind": "clinic",
            "name": "River Clinic",
            "address_text": "3 Bank Road",
            "opening_hours": "9:00–17:00",
            "phone": "",
            "latitude": 12.991,
            "longitude": 77.601,
        },
        headers=headers,
    )
    assert clinic.status_code == 201
    lot = client.post(
        "/api/v1/admin/parking",
        json={
            "ward_id": ward_id,
            "name": "Bank Lot",
            "address_text": "Bank Road",
            "capacity": 20,
            "spaces_free": 5,
            "price_paise_per_hour": 1000,
            "latitude": 12.992,
            "longitude": 77.602,
        },
        headers=headers,
    )
    assert lot.status_code == 201

    names = [row["name"] for row in client.get("/api/v1/city/wards").json()["data"]]
    assert "River Side" in names
    home = client.get(f"/api/v1/city/home?ward_id={ward_id}").json()
    assert home["facility_count"] == 1
    assert home["parking_open_count"] == 1
    assert len(home["systems"]) == 4

    blocked = client.delete(f"/api/v1/admin/wards/{ward_id}", headers=headers)
    assert blocked.status_code == 409

    hidden = client.patch(f"/api/v1/admin/wards/{ward_id}", json={"active": False}, headers=headers)
    assert hidden.json()["active"] is False
    names = [row["name"] for row in client.get("/api/v1/city/wards").json()["data"]]
    assert "River Side" not in names
    assert client.get(f"/api/v1/city/home?ward_id={ward_id}").status_code == 404


def test_admin_updates_ward_name_code_and_map_centre():
    headers = _admin()
    created = client.post(
        "/api/v1/admin/wards",
        json={"name": "Hill Top", "code": "w05", "latitude": 12.95, "longitude": 77.58},
        headers=headers,
    )
    assert created.status_code == 201
    ward_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/admin/wards/{ward_id}",
        json={"name": "Hill Crest", "code": "w15", "latitude": 12.9512, "longitude": 77.5811},
        headers=headers,
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Hill Crest"
    assert body["code"] == "W15"
    assert body["latitude"] == 12.9512
    assert body["longitude"] == 77.5811

    public = {row["name"]: row for row in client.get("/api/v1/city/wards").json()["data"]}
    assert "Hill Crest" in public
    assert "Hill Top" not in public
    assert public["Hill Crest"]["code"] == "W15"

    mapped = client.get("/api/v1/city/map", params={"ward_id": ward_id}).json()
    assert mapped["center"]["latitude"] == 12.9512
    assert mapped["center"]["longitude"] == 77.5811


def test_duplicate_ward_code_and_capacity_rules():
    headers = _admin()
    dup = client.post(
        "/api/v1/admin/wards",
        json={"name": "Another", "code": "W01", "latitude": 12.9, "longitude": 77.5},
        headers=headers,
    )
    assert dup.status_code == 409
    lot = client.post(
        "/api/v1/admin/parking",
        json={
            "ward_id": W1,
            "name": "Tiny",
            "address_text": "Lane",
            "capacity": 2,
            "spaces_free": 5,
            "price_paise_per_hour": 0,
            "latitude": 12.97,
            "longitude": 77.59,
        },
        headers=headers,
    )
    assert lot.status_code == 422


def test_map_style_is_saved_on_the_profile():
    headers = _admin()
    assert client.get("/api/v1/users/me", headers=headers).json()["map_style"] == "auto"
    saved = client.patch("/api/v1/users/me", json={"map_style": "satellite"}, headers=headers)
    assert saved.json()["map_style"] == "satellite"
    assert client.get("/api/v1/users/me", headers=headers).json()["map_style"] == "satellite"
    assert client.patch("/api/v1/users/me", json={"map_style": "neon"}, headers=headers).status_code == 422


def test_residents_cannot_manage_wards():
    assert client.get("/api/v1/admin/wards").status_code == 401

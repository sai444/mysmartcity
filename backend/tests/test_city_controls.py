from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1, W2
from app.modules.identity.service import identity_service

client = TestClient(app)

PLAZA = "33333333-3333-4333-8333-333333333301"


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident() -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": "mina@example.com", "password": "city-life-1", "display_name": "Mina", "ward_id": W1},
    )
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _home(ward_id: str = W1) -> dict:
    return client.get("/api/v1/city/home", params={"ward_id": ward_id}).json()


def test_residents_cannot_edit_city_home() -> None:
    resident = _resident()
    body = {"systems": [{"key": "water", "state": "halted", "detail": "Main burst"}]}
    assert client.put(f"/api/v1/admin/city/{W1}/pulse", headers=resident, json=body).status_code == 403
    assert client.put(f"/api/v1/admin/city/{W1}/pulse", json=body).status_code == 401


def test_admin_edits_pulse_climate_and_waste() -> None:
    admin = _admin()

    pulse = client.put(
        f"/api/v1/admin/city/{W1}/pulse",
        headers=admin,
        json={"systems": [{"key": "water", "state": "halted", "detail": "Main burst on MG Road"}]},
    )
    assert pulse.status_code == 200
    water = next(row for row in _home()["systems"] if row["key"] == "water")
    assert water == {"key": "water", "label": "Water", "state": "halted", "detail": "Main burst on MG Road"}
    power = next(row for row in _home()["systems"] if row["key"] == "power")
    assert power["state"] == "steady"

    climate = client.put(
        f"/api/v1/admin/city/{W1}/climate",
        headers=admin,
        json={"temperature_c": 36.4, "condition": "heat", "humidity_pct": 30, "aqi": 230},
    )
    assert climate.status_code == 200
    reading = _home()["climate"]
    assert reading["temperature_c"] == 36.4
    assert reading["aqi_category"] == "severe"

    waste = client.put(
        f"/api/v1/admin/city/{W1}/waste", headers=admin, json={"waste_type": "dry", "window_label": "09:00–11:00"}
    )
    assert waste.status_code == 200
    assert _home()["waste_today"][0]["window_label"] == "09:00–11:00"

    paused = client.put(f"/api/v1/admin/city/{W1}/waste", headers=admin, json={"waste_type": "none"})
    assert paused.json()["waste"] == {"waste_type": "none", "window_label": ""}
    assert _home()["waste_today"] == []

    assert sorted(paused.json()["customized"]) == ["climate", "pulse", "waste"]
    assert _home(W2)["climate"]["temperature_c"] == 27.0

    reset = client.delete(f"/api/v1/admin/city/{W1}/climate", headers=admin)
    assert "climate" not in reset.json()["customized"]
    assert _home()["climate"]["temperature_c"] == 31.5

    log = client.get("/api/v1/admin/audit", headers=admin).json()["data"]
    assert log[0]["action"] == "Reset climate"
    assert log[0]["target"] == "Gandhi Nagar"


def test_waste_window_required_unless_paused() -> None:
    admin = _admin()
    refused = client.put(f"/api/v1/admin/city/{W1}/waste", headers=admin, json={"waste_type": "wet", "window_label": ""})
    assert refused.status_code == 422


def test_admin_updates_parking() -> None:
    admin = _admin()
    assert _home()["parking_open_count"] == 1

    full = client.patch(f"/api/v1/admin/parking/{PLAZA}", headers=admin, json={"spaces_free": 0, "is_open": True})
    assert full.status_code == 200
    assert _home()["parking_open_count"] == 0

    too_many = client.patch(f"/api/v1/admin/parking/{PLAZA}", headers=admin, json={"spaces_free": 500, "is_open": True})
    assert too_many.status_code == 422

    client.patch(f"/api/v1/admin/parking/{PLAZA}", headers=admin, json={"spaces_free": 10, "is_open": False})
    lots = client.get("/api/v1/city/parking", params={"ward_id": W1}).json()["data"]
    assert all(lot["id"] != PLAZA for lot in lots)

    assert client.patch("/api/v1/admin/parking/nope", headers=admin, json={"spaces_free": 1, "is_open": True}).status_code == 404

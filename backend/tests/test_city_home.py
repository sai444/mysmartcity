from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["x-request-id"]


def test_city_home_includes_climate_and_services() -> None:
    response = client.get("/api/v1/city/home", params={"ward_id": W1})
    assert response.status_code == 200
    body = response.json()
    assert body["ward"]["name"] == "Gandhi Nagar"
    assert body["climate"]["temperature_c"] == 31.5
    assert body["climate"]["aqi_category"] == "moderate"
    assert [row["key"] for row in body["systems"]] == ["water", "power", "transit", "air"]
    assert body["systems"][0]["state"] == "steady"
    assert body["notices"]
    assert body["waste_today"]
    assert body["parking_open_count"] >= 1
    assert body["facility_count"] >= 1
    assert body["due_bill_count"] is None


def test_unknown_ward() -> None:
    response = client.get("/api/v1/city/home", params={"ward_id": "missing"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_pagination_cap() -> None:
    response = client.get("/api/v1/city/wards", params={"limit": 1, "offset": 0})
    body = response.json()
    assert len(body["data"]) == 1
    assert body["meta"]["total"] == 3


def test_waste_follows_weekday() -> None:
    monday = date(2026, 10, 12)
    assert monday.weekday() == 0
    from app.modules.civic.service import city_service

    home = city_service.get_home(W1, today=monday, now=datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc))
    assert home.waste_today[0].window_label == "07:00–09:00"

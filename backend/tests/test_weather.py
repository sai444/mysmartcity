from datetime import datetime

from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.civic.weather import clear_cache, condition_from_code, reading_from_payloads

client = TestClient(app)

FORECAST = {
    "current": {
        "time": "2026-10-17T21:00",
        "temperature_2m": 24.6,
        "relative_humidity_2m": 71,
        "apparent_temperature": 26.2,
        "weather_code": 2,
        "wind_speed_10m": 9.4,
    },
    "daily": {
        "time": ["2026-10-17", "2026-10-18", "2026-10-19"],
        "weather_code": [2, 61, 0],
        "temperature_2m_max": [28.4, 26.1, 31.0],
        "temperature_2m_min": [21.2, 20.0, 22.5],
        "precipitation_probability_max": [10, 80, 5],
    },
}

AIR = {"current": {"time": "2026-10-17T21:00", "us_aqi": 54}}


def _live(monkeypatch) -> None:
    def fake_fetch(url: str, timeout: float = 4):
        return AIR if "air-quality" in url else FORECAST

    clear_cache()
    monkeypatch.setattr("app.modules.civic.weather.fetch_json", fake_fetch)


def test_condition_codes() -> None:
    assert condition_from_code(0, 30) == "clear"
    assert condition_from_code(0, 36) == "heat"
    assert condition_from_code(3, 28) == "cloudy"
    assert condition_from_code(61, 24) == "rain"
    assert condition_from_code(95, 24) == "storm"


def test_reading_from_open_meteo_payload() -> None:
    reading = reading_from_payloads(FORECAST, AIR, 12.9716, 77.5946)
    assert reading is not None
    assert reading["temperature_c"] == 24.6
    assert reading["condition"] == "cloudy"
    assert reading["humidity_pct"] == 71
    assert reading["aqi"] == 54
    assert reading["aqi_category"] == "moderate"
    assert reading["source"] == "live"
    assert reading["feels_like_c"] == 26.2
    assert reading["forecast"][0]["rain_chance_pct"] == 10
    assert reading["forecast"][1]["condition"] == "rain"
    assert isinstance(reading["recorded_at"], datetime)


def test_city_home_uses_live_weather(monkeypatch) -> None:
    _live(monkeypatch)
    body = client.get("/api/v1/city/home", params={"ward_id": W1}).json()
    climate = body["climate"]
    assert climate["temperature_c"] == 24.6
    assert climate["source"] == "live"
    assert climate["latitude"] == 12.9716
    assert len(climate["forecast"]) == 3
    assert climate["forecast"][2]["temperature_max_c"] == 31.0


def test_weather_by_lat_long(monkeypatch) -> None:
    _live(monkeypatch)
    response = client.get("/api/v1/city/weather", params={"latitude": 12.9828, "longitude": 77.6184})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "live"
    assert body["wind_kmh"] == 9.4
    assert body["recorded_at"]


def test_weather_by_ward(monkeypatch) -> None:
    _live(monkeypatch)
    response = client.get("/api/v1/city/weather", params={"ward_id": W1})
    assert response.status_code == 200
    assert response.json()["source"] == "live"


def test_weather_falls_back_when_api_is_down() -> None:
    response = client.get("/api/v1/city/weather", params={"ward_id": W1})
    assert response.status_code == 200
    body = response.json()
    assert body["temperature_c"] == 31.5
    assert body["source"] == "desk"


def test_weather_point_unavailable_without_fallback() -> None:
    response = client.get("/api/v1/city/weather", params={"latitude": 0.1, "longitude": 0.1})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "climate_unavailable"


def test_weather_requires_a_point() -> None:
    response = client.get("/api/v1/city/weather")
    assert response.status_code == 422

"""Live weather from Open-Meteo. No API key. Failures return None so the desk seed can fill in."""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.modules.civic.controls import aqi_category

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
CACHE_SECONDS = 600
_USER_AGENT = "MyNagari/1.0 (city weather)"

_CACHE: dict[tuple[float, float], tuple[float, dict]] = {}
_LOCK = threading.Lock()


def fetch_json(url: str, timeout: float = 4) -> dict | None:
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()


def condition_from_code(code: int, temperature_c: float) -> str:
    if code in {95, 96, 99}:
        return "storm"
    if code in {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86}:
        return "rain"
    if code in {2, 3, 45, 48}:
        return "heat" if temperature_c >= 35 else "cloudy"
    return "heat" if temperature_c >= 35 else "clear"


def _round_point(latitude: float, longitude: float) -> tuple[float, float]:
    return (round(latitude, 3), round(longitude, 3))


def _query(url: str, params: dict[str, str]) -> str:
    return f"{url}?{urllib.parse.urlencode(params)}"


def _number(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: object) -> int | None:
    number = _number(value)
    return None if number is None else int(round(number))


def _parse_time(value: object) -> datetime:
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def reading_from_payloads(forecast: dict, air: dict | None, latitude: float, longitude: float) -> dict | None:
    current = forecast.get("current")
    if not isinstance(current, dict):
        return None
    temperature = _number(current.get("temperature_2m"))
    humidity = _int(current.get("relative_humidity_2m"))
    code = _int(current.get("weather_code"))
    if temperature is None or humidity is None or code is None:
        return None
    humidity = min(100, max(0, humidity))
    aqi = 50
    if isinstance(air, dict) and isinstance(air.get("current"), dict):
        aqi_value = _int(air["current"].get("us_aqi"))
        if aqi_value is not None:
            aqi = min(500, max(0, aqi_value))

    daily = forecast.get("daily") if isinstance(forecast.get("daily"), dict) else {}
    days: list[dict] = []
    times = daily.get("time") if isinstance(daily, dict) else None
    if isinstance(times, list):
        highs = daily.get("temperature_2m_max") if isinstance(daily.get("temperature_2m_max"), list) else []
        lows = daily.get("temperature_2m_min") if isinstance(daily.get("temperature_2m_min"), list) else []
        codes = daily.get("weather_code") if isinstance(daily.get("weather_code"), list) else []
        rain = daily.get("precipitation_probability_max") if isinstance(daily.get("precipitation_probability_max"), list) else []
        for index, day in enumerate(times[:7]):
            if not isinstance(day, str):
                continue
            high = _number(highs[index] if index < len(highs) else None)
            low = _number(lows[index] if index < len(lows) else None)
            day_code = _int(codes[index] if index < len(codes) else None) or 0
            if high is None or low is None:
                continue
            days.append(
                {
                    "date": day[:10],
                    "condition": condition_from_code(day_code, high),
                    "temperature_max_c": round(high, 1),
                    "temperature_min_c": round(low, 1),
                    "rain_chance_pct": _int(rain[index] if index < len(rain) else None),
                }
            )

    rain_chance = days[0]["rain_chance_pct"] if days else None
    feels = _number(current.get("apparent_temperature"))
    wind = _number(current.get("wind_speed_10m"))
    return {
        "temperature_c": round(temperature, 1),
        "condition": condition_from_code(code, temperature),
        "humidity_pct": humidity,
        "aqi": aqi,
        "aqi_category": aqi_category(aqi),
        "recorded_at": _parse_time(current.get("time")),
        "feels_like_c": None if feels is None else round(feels, 1),
        "wind_kmh": None if wind is None else round(wind, 1),
        "rain_chance_pct": rain_chance,
        "source": "live",
        "latitude": round(latitude, 5),
        "longitude": round(longitude, 5),
        "forecast": days,
    }


class WeatherClient:
    def for_point(self, latitude: float, longitude: float) -> dict | None:
        key = _round_point(latitude, longitude)
        now = time.monotonic()
        with _LOCK:
            cached = _CACHE.get(key)
            if cached and now - cached[0] < CACHE_SECONDS:
                return dict(cached[1])

        forecast_url = _query(
            FORECAST_URL,
            {
                "latitude": f"{key[0]:.4f}",
                "longitude": f"{key[1]:.4f}",
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                "timezone": "auto",
                "forecast_days": "7",
            },
        )
        air_url = _query(
            AIR_URL,
            {
                "latitude": f"{key[0]:.4f}",
                "longitude": f"{key[1]:.4f}",
                "current": "us_aqi",
                "timezone": "auto",
            },
        )
        with ThreadPoolExecutor(max_workers=2) as pool:
            forecast_future = pool.submit(fetch_json, forecast_url)
            air_future = pool.submit(fetch_json, air_url)
            forecast = forecast_future.result()
            air = air_future.result()
        if not forecast:
            return None
        reading = reading_from_payloads(forecast, air, latitude, longitude)
        if reading is None:
            return None
        with _LOCK:
            _CACHE[key] = (now, reading)
        return dict(reading)


weather_client = WeatherClient()

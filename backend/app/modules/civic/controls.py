from datetime import date, datetime, timezone

from app.modules.civic.desk import desk_service
from app.modules.civic.directory import directory
from app.modules.civic.seed import CLIMATE, PULSE, waste_for

DEFAULT_PULSE = [
    {"key": "water", "label": "Water", "state": "steady", "detail": "No update yet"},
    {"key": "power", "label": "Power", "state": "steady", "detail": "No update yet"},
    {"key": "transit", "label": "Transit", "state": "steady", "detail": "No update yet"},
    {"key": "air", "label": "Air", "state": "steady", "detail": "No update yet"},
]


def aqi_category(aqi: int) -> str:
    if aqi <= 50:
        return "good"
    if aqi <= 100:
        return "moderate"
    if aqi <= 200:
        return "poor"
    return "severe"


class CityControls:
    """Admin edits layered over the seed catalog. A ward with no saved edit shows the seed values."""

    def pulse(self, ward_id: str) -> list[dict]:
        base = [dict(row) for row in PULSE.get(ward_id, DEFAULT_PULSE)]
        stored = desk_service.store.setting(ward_id, "pulse")
        if stored is None:
            return base
        edits = {row["key"]: row for row in stored["systems"]}
        return [{**row, "state": edits[row["key"]]["state"], "detail": edits[row["key"]]["detail"]} if row["key"] in edits else row for row in base]

    def climate(self, ward_id: str) -> dict | None:
        stored = desk_service.store.setting(ward_id, "climate")
        if stored is None:
            return CLIMATE.get(ward_id)
        return {**stored, "recorded_at": datetime.fromisoformat(stored["recorded_at"])}

    def waste(self, ward_id: str, day: date) -> list[dict]:
        stored = desk_service.store.setting(ward_id, "waste")
        if stored is None:
            return waste_for(ward_id, day)
        if stored["waste_type"] == "none":
            return []
        return [
            {
                "ward_id": ward_id,
                "weekday": day.weekday(),
                "waste_type": stored["waste_type"],
                "window_label": stored["window_label"],
            }
        ]

    def waste_setting(self, ward_id: str, day: date) -> dict:
        rows = self.waste(ward_id, day)
        if not rows:
            return {"waste_type": "none", "window_label": ""}
        return {"waste_type": rows[0]["waste_type"], "window_label": rows[0]["window_label"]}

    def parking(self, ward_id: str | None = None) -> list[dict]:
        return directory.lots(ward_id)

    def customized(self, ward_id: str) -> list[str]:
        return sorted(desk_service.store.settings_for(ward_id))

    def set_pulse(self, ward_id: str, systems: list[dict]) -> None:
        current = {row["key"]: {"key": row["key"], "state": row["state"], "detail": row["detail"]} for row in self.pulse(ward_id)}
        for row in systems:
            current[row["key"]] = row
        desk_service.store.set_setting(ward_id, "pulse", {"systems": list(current.values())})

    def set_climate(self, ward_id: str, temperature_c: float, condition: str, humidity_pct: int, aqi: int) -> None:
        desk_service.store.set_setting(
            ward_id,
            "climate",
            {
                "temperature_c": round(temperature_c, 1),
                "condition": condition,
                "humidity_pct": humidity_pct,
                "aqi": aqi,
                "aqi_category": aqi_category(aqi),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def set_waste(self, ward_id: str, waste_type: str, window_label: str) -> None:
        label = "" if waste_type == "none" else window_label
        desk_service.store.set_setting(ward_id, "waste", {"waste_type": waste_type, "window_label": label})

    def reset(self, ward_id: str, section: str) -> None:
        desk_service.store.clear_setting(ward_id, section)

    def set_parking(self, lot_id: str, spaces_free: int, is_open: bool) -> dict:
        return directory.set_lot_status(lot_id, spaces_free, is_open)


city_controls = CityControls()

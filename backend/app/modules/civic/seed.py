"""Immutable city catalog. Workers can share this module because nothing here is mutated."""

from datetime import date, datetime, timezone

W1 = "11111111-1111-4111-8111-111111111101"
W2 = "11111111-1111-4111-8111-111111111102"
W3 = "11111111-1111-4111-8111-111111111103"

WARDS = [
    {"id": W1, "name": "Gandhi Nagar", "code": "W01"},
    {"id": W2, "name": "Lake View", "code": "W02"},
    {"id": W3, "name": "Market Ward", "code": "W03"},
]

# Centers sit on OpenStreetMap around central Bengaluru so new pins have a real street grid.
WARD_GEO = {
    W1: {"latitude": 12.9716, "longitude": 77.5946},
    W2: {"latitude": 12.9828, "longitude": 77.6184},
    W3: {"latitude": 12.9634, "longitude": 77.5772},
}
CITY_CENTER = {"latitude": 12.9716, "longitude": 77.5946}

PULSE = {
    W1: [
        {"key": "water", "label": "Water", "state": "steady", "detail": "Supply on"},
        {"key": "power", "label": "Power", "state": "steady", "detail": "Grid stable"},
        {"key": "transit", "label": "Transit", "state": "busy", "detail": "Crowded until 10:00"},
        {"key": "air", "label": "Air", "state": "watch", "detail": "AQI moderate"},
    ],
    W2: [
        {"key": "water", "label": "Water", "state": "watch", "detail": "Low pressure near the lake"},
        {"key": "power", "label": "Power", "state": "steady", "detail": "Grid stable"},
        {"key": "transit", "label": "Transit", "state": "steady", "detail": "Boats running"},
        {"key": "air", "label": "Air", "state": "steady", "detail": "AQI good"},
    ],
    W3: [
        {"key": "water", "label": "Water", "state": "halted", "detail": "Paused 23:00–04:00"},
        {"key": "power", "label": "Power", "state": "steady", "detail": "Grid stable"},
        {"key": "transit", "label": "Transit", "state": "busy", "detail": "Market roads slow"},
        {"key": "air", "label": "Air", "state": "watch", "detail": "AQI poor"},
    ],
}

CLIMATE = {
    W1: {
        "temperature_c": 31.5,
        "condition": "clear",
        "humidity_pct": 58,
        "aqi": 72,
        "aqi_category": "moderate",
        "recorded_at": datetime(2026, 10, 16, 8, 0, tzinfo=timezone.utc),
    },
    W2: {
        "temperature_c": 27.0,
        "condition": "rain",
        "humidity_pct": 84,
        "aqi": 48,
        "aqi_category": "good",
        "recorded_at": datetime(2026, 10, 16, 8, 10, tzinfo=timezone.utc),
    },
    W3: {
        "temperature_c": 34.0,
        "condition": "heat",
        "humidity_pct": 41,
        "aqi": 168,
        "aqi_category": "poor",
        "recorded_at": datetime(2026, 10, 16, 8, 5, tzinfo=timezone.utc),
    },
}

NOTICES = [
    {
        "id": "22222222-2222-4222-8222-222222222201",
        "ward_id": None,
        "title": "Heat advisory until 6 PM",
        "body": "Drink water and limit outdoor work between noon and 4 PM. Public taps at ward offices stay open.",
        "severity": "warning",
        "starts_at": datetime(2026, 10, 16, 0, 0, tzinfo=timezone.utc),
        "ends_at": datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc),
    },
    {
        "id": "22222222-2222-4222-8222-222222222202",
        "ward_id": W2,
        "title": "Lake road closed for drain cleaning",
        "body": "Lake View ring road is closed from the park gate to the ward office until Sunday morning.",
        "severity": "info",
        "starts_at": datetime(2026, 10, 16, 0, 0, tzinfo=timezone.utc),
        "ends_at": datetime(2026, 10, 19, 6, 0, tzinfo=timezone.utc),
    },
    {
        "id": "22222222-2222-4222-8222-222222222203",
        "ward_id": W3,
        "title": "Water supply pause tonight",
        "body": "Market Ward supply stops from 11 PM to 4 AM for a valve repair. Store drinking water this evening.",
        "severity": "emergency",
        "starts_at": datetime(2026, 10, 16, 0, 0, tzinfo=timezone.utc),
        "ends_at": datetime(2026, 10, 17, 6, 0, tzinfo=timezone.utc),
    },
]

WASTE = []
for ward_id, waste_type, window in (
    (W1, "mixed", "07:00–09:00"),
    (W2, "wet", "06:30–08:30"),
    (W3, "dry", "08:00–10:00"),
):
    for weekday in range(7):
        WASTE.append(
            {
                "ward_id": ward_id,
                "weekday": weekday,
                "waste_type": waste_type,
                "window_label": window,
            }
        )

PARKING = [
    {
        "id": "33333333-3333-4333-8333-333333333301",
        "ward_id": W1,
        "name": "Gandhi Nagar Plaza",
        "address_text": "12 Station Road",
        "capacity": 80,
        "spaces_free": 24,
        "price_paise_per_hour": 2000,
        "is_open": True,
        "latitude": 12.9719,
        "longitude": 77.5938,
    },
    {
        "id": "33333333-3333-4333-8333-333333333302",
        "ward_id": W1,
        "name": "Library Lot",
        "address_text": "4 Reading Lane",
        "capacity": 30,
        "spaces_free": 0,
        "price_paise_per_hour": 1500,
        "is_open": True,
        "latitude": 12.9694,
        "longitude": 77.5922,
    },
    {
        "id": "33333333-3333-4333-8333-333333333303",
        "ward_id": W2,
        "name": "Lake Promenade",
        "address_text": "Lake View road",
        "capacity": 50,
        "spaces_free": 18,
        "price_paise_per_hour": 2500,
        "is_open": True,
        "latitude": 12.9836,
        "longitude": 77.6196,
    },
    {
        "id": "33333333-3333-4333-8333-333333333304",
        "ward_id": W3,
        "name": "Market Yard",
        "address_text": "Central market",
        "capacity": 120,
        "spaces_free": 40,
        "price_paise_per_hour": 3000,
        "is_open": True,
        "latitude": 12.9626,
        "longitude": 77.5764,
    },
]

FACILITIES = [
    {
        "id": "44444444-4444-4444-8444-444444444401",
        "ward_id": W1,
        "kind": "clinic",
        "name": "Gandhi Nagar Clinic",
        "address_text": "8 Health Street",
        "opening_hours": "8:00–20:00",
        "phone": "080-4000-1101",
        "latitude": 12.9734,
        "longitude": 77.5926,
    },
    {
        "id": "44444444-4444-4444-8444-444444444402",
        "ward_id": W1,
        "kind": "park",
        "name": "Neem Park",
        "address_text": "Park Road",
        "opening_hours": "5:00–21:00",
        "phone": None,
        "latitude": 12.9702,
        "longitude": 77.5964,
    },
    {
        "id": "44444444-4444-4444-8444-444444444403",
        "ward_id": W1,
        "kind": "ev_charger",
        "name": "Plaza EV Point",
        "address_text": "Gandhi Nagar Plaza",
        "opening_hours": "24 hours",
        "phone": None,
        "latitude": 12.9712,
        "longitude": 77.5952,
    },
    {
        "id": "44444444-4444-4444-8444-444444444404",
        "ward_id": W2,
        "kind": "park",
        "name": "Lakeside Park",
        "address_text": "Promenade",
        "opening_hours": "5:00–21:00",
        "phone": None,
        "latitude": 12.9842,
        "longitude": 77.6168,
    },
    {
        "id": "44444444-4444-4444-8444-444444444405",
        "ward_id": W2,
        "kind": "toilet",
        "name": "Promenade Toilet",
        "address_text": "Near the boat jetty",
        "opening_hours": "6:00–22:00",
        "phone": None,
        "latitude": 12.9816,
        "longitude": 77.6176,
    },
    {
        "id": "44444444-4444-4444-8444-444444444406",
        "ward_id": W3,
        "kind": "ward_office",
        "name": "Market Ward Office",
        "address_text": "1 Civic Square",
        "opening_hours": "10:00–17:00",
        "phone": "080-4000-1103",
        "latitude": 12.9644,
        "longitude": 77.5756,
    },
    {
        "id": "44444444-4444-4444-8444-444444444407",
        "ward_id": W3,
        "kind": "clinic",
        "name": "Market Clinic",
        "address_text": "22 Bazaar Lane",
        "opening_hours": "9:00–18:00",
        "phone": "080-4000-1104",
        "latitude": 12.9622,
        "longitude": 77.5786,
    },
]


def waste_for(ward_id: str, today: date) -> list[dict]:
    weekday = today.weekday()
    return [row for row in WASTE if row["ward_id"] == ward_id and row["weekday"] == weekday]

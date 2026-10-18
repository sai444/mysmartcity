from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypisom" + bytes(range(256)) * 4
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64

PROPERTY = {
    "title": "2 BHK by the lake",
    "property_type": "flat",
    "ward_id": W1,
    "address_text": "4 Lake Road",
    "area_sqft": 900,
    "bedrooms": 2,
    "price_paise": 5_000_000_000,
    "description": "Bright corner flat with a balcony.",
    "contact_phone": "98450 33333",
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident(email: str) -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": email.split("@")[0], "ward_id": W1},
    )
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _upload(headers: dict[str, str], data: bytes, name: str = "file.bin", mime: str = "application/octet-stream"):
    return client.post("/api/v1/media", headers=headers, files={"file": (name, data, mime)})


def test_upload_sniffs_type_and_serves_ranges() -> None:
    owner = _resident("uploader@example.com")
    assert _upload({}, PNG).status_code == 401

    rejected = _upload(owner, b"hello, not an image", "photo.jpg", "image/jpeg")
    assert rejected.status_code == 422
    assert _upload(owner, HEIC, "photo.heic", "image/heic").status_code == 422

    image = _upload(owner, PNG, "photo.jpg", "image/jpeg")
    assert image.status_code == 201
    assert image.json()["kind"] == "image"
    served = client.get(image.json()["url"])
    assert served.headers["content-type"] == "image/png" and served.content == PNG

    video = _upload(owner, MP4, "clip.mp4", "video/mp4").json()
    assert video["kind"] == "video"
    part = client.get(video["url"], headers={"Range": "bytes=0-9"})
    assert part.status_code == 206
    assert part.headers["content-range"] == f"bytes 0-9/{len(MP4)}" and part.content == MP4[:10]
    assert client.get(video["url"], headers={"Range": "bytes=99999-"}).status_code == 416
    assert client.get("/api/v1/media/" + "0" * 32).status_code == 404


def test_records_only_accept_the_uploaders_own_media() -> None:
    owner = _resident("seller@example.com")
    other = _resident("other@example.com")
    photo = _upload(owner, PNG).json()
    clip = _upload(owner, MP4).json()

    stolen = client.post("/api/v1/properties", headers=other, json={**PROPERTY, "media": [photo["id"]]})
    assert stolen.status_code == 422

    created = client.post("/api/v1/properties", headers=owner, json={**PROPERTY, "media": [clip["id"], photo["id"]]})
    assert created.status_code == 201, created.text
    assert [(item["id"], item["kind"]) for item in created.json()["media"]] == [(clip["id"], "video"), (photo["id"], "image")]

    edited = client.put(f"/api/v1/properties/{created.json()['id']}", headers=owner, json={**PROPERTY, "media": [photo["id"]]})
    assert [item["id"] for item in edited.json()["media"]] == [photo["id"]]

    listing = client.post(
        "/api/v1/market/listings",
        headers=owner,
        json={"title": "Bicycle", "description": "Barely used.", "price_paise": 250000, "media": [clip["id"], photo["id"]]},
    ).json()
    assert listing["cover_url"] == photo["url"]
    assert [item["kind"] for item in listing["media"]] == ["video", "image"]

    report = client.post(
        "/api/v1/city/reports",
        headers=owner,
        json={"category": "Pothole", "place": "Lake Road", "details": "Deep pothole near the bus stop.", "media": [photo["id"]]},
    )
    assert report.status_code == 201 and report.json()["media"][0]["url"] == photo["url"]


def test_admin_attaches_media_to_vehicles_and_shops() -> None:
    admin = _admin()
    photo = _upload(admin, PNG).json()
    vehicle = client.post(
        "/api/v1/transit/vehicles",
        headers=admin,
        json={
            "name": "City cab",
            "kind": "taxi",
            "registration": "KA01-CB-1",
            "origin": "Market Ward",
            "destination": "Lake View",
            "price_paise": 15000,
            "seats": 4,
            "phone": "98450-10010",
            "contact_name": "Sana",
            "minutes": 20,
            "departures": "On call",
            "media": [photo["id"]],
        },
    )
    assert vehicle.status_code == 201, vehicle.text
    assert vehicle.json()["media"][0]["id"] == photo["id"]

    shop = client.post(
        "/api/v1/businesses",
        headers=admin,
        json={
            "name": "Lake Bakery",
            "category": "restaurant",
            "ward_id": W1,
            "address_text": "1 Lake Road",
            "opening_hours": "7am to 9pm",
            "about": "Fresh bread every morning.",
            "latitude": 12.97,
            "longitude": 77.59,
            "media": [photo["id"]],
            "catalog": [{"name": "Sourdough", "price_paise": 12000, "media": [photo["id"]]}],
        },
    )
    assert shop.status_code == 201, shop.text
    assert shop.json()["media"][0]["id"] == photo["id"]
    assert shop.json()["catalog"][0]["media"][0]["kind"] == "image"

    extra = _upload(admin, PNG, "front.jpg", "image/jpeg").json()
    updated = client.patch(
        f"/api/v1/businesses/{shop.json()['slug']}/media",
        headers=admin,
        json={"media": [extra["id"], photo["id"]]},
    )
    assert updated.status_code == 200
    assert [item["id"] for item in updated.json()["media"]] == [extra["id"], photo["id"]]

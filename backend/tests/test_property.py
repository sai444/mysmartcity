from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

LISTING = {
    "title": "3 BHK near Neem Park",
    "property_type": "flat",
    "ward_id": W1,
    "address_text": "8 Park Road, Gandhi Nagar",
    "area_sqft": 1450,
    "bedrooms": 3,
    "price_paise": 9_500_000_000,
    "description": "Second floor, two balconies, covered parking.",
    "contact_phone": "98450 11111",
    "latitude": 12.972,
    "longitude": 77.595,
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident(email: str, name: str) -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": name, "ward_id": W1},
    )
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _offer_id(listing: dict, buyer: str) -> str:
    return next(offer["id"] for offer in listing["offers"] if offer["buyer_name"] == buyer)


def test_owner_listing_review_offer_and_sale() -> None:
    admin = _admin()
    owner = _resident("owner@example.com", "Owner")
    buyer = _resident("buyer@example.com", "Buyer")
    backup = _resident("backup@example.com", "Backup")

    seeded = client.get("/api/v1/properties").json()["data"]
    assert len(seeded) == 3 and all(row["contact_phone"] is None for row in seeded)
    assert all(row["image"] and row["image"].startswith("data:image/png") for row in seeded)

    created = client.post("/api/v1/properties", headers=owner, json=LISTING)
    assert created.status_code == 201
    listing = created.json()
    assert listing["status"] == "pending" and listing["lister_role"] == "owner"
    pid = listing["id"]
    assert client.get(f"/api/v1/properties/{pid}").status_code == 404
    assert client.post(f"/api/v1/properties/{pid}/offers", headers=buyer, json={"amount_paise": 9_000_000_000, "phone": "98450 22222"}).status_code == 404

    assert client.post(f"/api/v1/properties/{pid}/status", headers=owner, json={"status": "approved"}).status_code == 403
    rejected = client.post(f"/api/v1/properties/{pid}/status", headers=admin, json={"status": "rejected", "note": "Add the floor"})
    assert rejected.json()["review_note"] == "Add the floor"
    edited = client.put(f"/api/v1/properties/{pid}", headers=owner, json={**LISTING, "description": "Second floor of four, two balconies."})
    assert edited.json()["status"] == "pending" and edited.json()["review_note"] is None
    client.post(f"/api/v1/properties/{pid}/status", headers=admin, json={"status": "approved"})
    assert client.get(f"/api/v1/properties/{pid}").json()["contact_phone"] is None

    own = client.post(f"/api/v1/properties/{pid}/offers", headers=owner, json={"amount_paise": 9_000_000_000, "phone": "98450 11111"})
    assert own.status_code == 409
    offer = client.post(f"/api/v1/properties/{pid}/offers", headers=buyer, json={"amount_paise": 9_000_000_000, "phone": "98450 22222", "message": "Can visit Sunday"})
    assert offer.status_code == 201 and offer.json()["seller_phone"] is None
    assert client.post(f"/api/v1/properties/{pid}/offers", headers=buyer, json={"amount_paise": 9_100_000_000, "phone": "98450 22222"}).status_code == 409
    client.post(f"/api/v1/properties/{pid}/offers", headers=backup, json={"amount_paise": 8_800_000_000, "phone": "98450 33333"})

    mine = client.get("/api/v1/properties/mine", headers=owner).json()["data"][0]
    assert mine["offer_count"] == 2 and mine["offers"][0]["buyer_phone"]
    accepted = client.post(
        f"/api/v1/properties/{pid}/offers/{_offer_id(mine, 'Buyer')}/decision",
        headers=owner,
        json={"action": "accept", "note": "Agreed"},
    ).json()
    assert accepted["status"] == "under_offer"
    assert client.post(
        f"/api/v1/properties/{pid}/offers/{_offer_id(mine, 'Backup')}/decision", headers=owner, json={"action": "accept"}
    ).status_code == 409

    buyer_view = client.get("/api/v1/properties/offers/mine", headers=buyer).json()["data"][0]
    assert buyer_view["status"] == "accepted" and buyer_view["seller_phone"] == "98450 11111"

    released = client.post(f"/api/v1/properties/{pid}/release", headers=owner).json()
    assert released["status"] == "approved"
    assert next(o for o in released["offers"] if o["buyer_name"] == "Buyer")["status"] == "cancelled"
    client.post(f"/api/v1/properties/{pid}/offers/{_offer_id(mine, 'Backup')}/decision", headers=owner, json={"action": "accept"})

    sold = client.post(f"/api/v1/properties/{pid}/complete", headers=owner, json={}).json()
    assert sold["status"] == "sold" and sold["sold_price_paise"] == 8_800_000_000
    assert next(o for o in sold["offers"] if o["buyer_name"] == "Backup")["status"] == "completed"
    assert client.delete(f"/api/v1/properties/{pid}", headers=owner).status_code == 409
    assert pid not in {row["id"] for row in client.get("/api/v1/properties").json()["data"]}

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["properties"]["sold"] == 1


def test_broker_needs_verification_and_buyer_can_withdraw() -> None:
    admin = _admin()
    broker = _resident("broker@example.com", "Kiran")
    buyer = _resident("buyer2@example.com", "Buyer")
    as_broker = {**LISTING, "list_as": "broker", "owner_name": "S. Rao", "commission_pct": 2}

    assert client.post("/api/v1/properties", headers=broker, json=as_broker).status_code == 403
    assert client.post("/api/v1/properties", headers=broker, json={**LISTING, "list_as": "broker"}).status_code == 422

    applied = client.post(
        "/api/v1/properties/brokers",
        headers=broker,
        json={"agency_name": "Kiran Estates", "license_no": "RERA-KA-1234", "phone": "98450 44444"},
    )
    assert applied.json()["broker"]["status"] == "pending"
    assert client.get("/api/v1/admin/overview", headers=admin).json()["brokers_pending"] == 1
    broker_id = client.get("/api/v1/properties/brokers", headers=admin).json()["data"][0]["user_id"]
    verified = client.post(f"/api/v1/properties/brokers/{broker_id}/status", headers=admin, json={"status": "approved"})
    assert verified.json()["status"] == "approved"

    listing = client.post("/api/v1/properties", headers=broker, json=as_broker).json()
    assert listing["lister_role"] == "broker" and listing["agency_name"] == "Kiran Estates"
    assert listing["owner_name"] == "S. Rao" and listing["commission_pct"] == 2
    pid = listing["id"]
    client.post(f"/api/v1/properties/{pid}/status", headers=admin, json={"status": "approved"})

    offer = client.post(f"/api/v1/properties/{pid}/offers", headers=buyer, json={"amount_paise": 9_400_000_000, "phone": "98450 55555"}).json()
    client.post(f"/api/v1/properties/{pid}/offers/{offer['id']}/decision", headers=admin, json={"action": "accept"})
    withdrawn = client.post(f"/api/v1/properties/offers/{offer['id']}/withdraw", headers=buyer).json()
    assert withdrawn["status"] == "withdrawn" and withdrawn["property"]["status"] == "approved"

    disabled = client.post(f"/api/v1/properties/{pid}/status", headers=admin, json={"status": "disabled", "note": "Duplicate"})
    assert disabled.json()["status"] == "disabled"
    log = client.get("/api/v1/admin/audit", headers=admin).json()["data"]
    assert log[0]["action"] == "Disabled property"


def test_admin_lists_live_and_feature_flag_pauses_residents() -> None:
    admin = _admin()
    resident = _resident("late@example.com", "Late")

    live = client.post("/api/v1/properties", headers=admin, json=LISTING).json()
    assert live["status"] == "approved" and live["lister_role"] == "admin"
    assert live["latitude"] == 12.972 and live["longitude"] == 77.595
    for_owner = client.post(
        "/api/v1/properties",
        headers=admin,
        json={**LISTING, "title": "Plot for Meena", "list_as": "owner", "owner_name": "Meena"},
    ).json()
    assert for_owner["lister_role"] == "admin" and for_owner["owner_name"] == "Meena"
    mapped = client.get("/api/v1/city/map", params={"ward_id": W1}).json()["places"]
    assert any(place["id"] == live["id"] and place["kind"] == "property" for place in mapped)
    assert client.post("/api/v1/properties", headers=resident, json={**LISTING, "list_as": "admin"}).status_code == 422

    client.patch("/api/v1/admin/features/property", headers=admin, json={"enabled": False})
    paused = client.post("/api/v1/properties", headers=resident, json=LISTING)
    assert paused.status_code == 403 and paused.json()["error"]["code"] == "feature_disabled"

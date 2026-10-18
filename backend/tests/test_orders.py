from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

RICE = "66666666-6666-4666-8666-666666666601"
IDLI = "66666666-6666-4666-8666-666666666611"

GROCERY = {
    "channel": "grocery",
    "address": "12 Park Road, Gandhi Nagar",
    "note": "Ring the bell",
    "payment": "upi",
    "lines": [{"item_id": RICE, "shop_slug": "neem-kirana", "qty": 2}],
}

FOOD = {
    "channel": "food",
    "address": "12 Park Road, Gandhi Nagar",
    "payment": "cod",
    "lines": [{"item_id": IDLI, "shop_slug": "lake-view-tiffin", "qty": 1}],
}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    assert signed.status_code == 200
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident(email: str = "buyer@example.com", name: str = "Buyer") -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": name, "ward_id": W1},
    )
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _place(headers: dict[str, str], body: dict | None = None) -> dict:
    placed = client.post("/api/v1/orders", headers=headers, json=body or GROCERY)
    assert placed.status_code == 201, placed.text
    data = placed.json()["data"]
    assert data
    return data[0]


def test_resident_places_and_tracks_until_admin_delivers() -> None:
    buyer = _resident()
    admin = _admin()
    order = _place(buyer)
    assert order["status"] == "placed"
    assert order["shop_name"] == "Neem Kirana"
    assert order["total_paise"] == 6200 * 2 + 2500
    assert order["can_cancel"] is True
    assert order["next_actions"] == []
    assert [event["status"] for event in order["events"]] == ["placed"]

    mine = client.get("/api/v1/orders", headers=buyer).json()["data"]
    assert mine[0]["id"] == order["id"]

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["orders_open"] == 1

    desk = client.get("/api/v1/admin/orders", headers=admin).json()["data"]
    assert desk[0]["id"] == order["id"]
    assert desk[0]["next_actions"] == ["accept", "cancel"]

    accepted = client.post(f"/api/v1/admin/orders/{order['id']}/status", headers=admin, json={"action": "accept"})
    assert accepted.json()["status"] == "accepted"
    preparing = client.post(f"/api/v1/admin/orders/{order['id']}/status", headers=admin, json={"action": "prepare"})
    assert preparing.json()["status"] == "preparing"
    assert client.post(f"/api/v1/orders/{order['id']}/cancel", headers=buyer).status_code == 409

    dispatched = client.post(f"/api/v1/admin/orders/{order['id']}/status", headers=admin, json={"action": "dispatch"})
    assert dispatched.json()["status"] == "out_for_delivery"
    delivered = client.post(
        f"/api/v1/admin/orders/{order['id']}/status",
        headers=admin,
        json={"action": "deliver", "note": "Left at the gate"},
    )
    assert delivered.json()["status"] == "delivered"
    assert delivered.json()["events"][-1]["note"] == "Left at the gate"
    assert client.get("/api/v1/admin/overview", headers=admin).json()["orders_open"] == 0

    tracked = client.get(f"/api/v1/orders/{order['id']}", headers=buyer).json()
    assert [event["status"] for event in tracked["events"]] == [
        "placed",
        "accepted",
        "preparing",
        "out_for_delivery",
        "delivered",
    ]


def test_buyer_can_cancel_before_packing() -> None:
    buyer = _resident()
    order = _place(buyer)
    cancelled = client.post(f"/api/v1/orders/{order['id']}/cancel", headers=buyer)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert client.post(f"/api/v1/orders/{order['id']}/cancel", headers=buyer).status_code == 409


def test_shop_owner_accepts_their_order() -> None:
    owner = _resident("owner@example.com", "Owner")
    buyer = _resident("guest@example.com", "Guest")
    admin = _admin()
    created = client.post(
        "/api/v1/businesses/requests",
        headers=owner,
        json={
            "name": "Owner Kirana",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "8 Lake Road",
            "opening_hours": "8:00–20:00",
            "about": "A family grocery that takes home delivery orders.",
            "latitude": 12.971,
            "longitude": 77.595,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "is_available": True}],
        },
    )
    assert created.status_code == 201
    shop = created.json()
    client.post(f"/api/v1/businesses/{shop['slug']}/status", headers=admin, json={"status": "approved"})
    live = client.get(f"/api/v1/businesses/{shop['slug']}").json()
    item_id = live["catalog"][0]["id"]

    order = _place(
        buyer,
        {
            "channel": "grocery",
            "address": "9 Lake Road",
            "payment": "cod",
            "lines": [{"item_id": item_id, "shop_slug": shop["slug"], "qty": 1}],
        },
    )
    assert client.post(f"/api/v1/orders/{order['id']}/status", headers=buyer, json={"action": "accept"}).status_code == 403

    incoming = client.get("/api/v1/orders/incoming", headers=owner).json()["data"]
    assert incoming[0]["id"] == order["id"]
    accepted = client.post(f"/api/v1/orders/{order['id']}/status", headers=owner, json={"action": "accept"})
    assert accepted.json()["status"] == "accepted"
    preparing = client.post(f"/api/v1/orders/{order['id']}/status", headers=owner, json={"action": "prepare"})
    assert preparing.json()["status"] == "preparing"


def test_food_order_and_unavailable_item() -> None:
    buyer = _resident()
    admin = _admin()
    food = _place(buyer, FOOD)
    assert food["channel"] == "food"
    assert food["shop_name"] == "Lake View Tiffin"

    mixed = client.post(
        "/api/v1/orders",
        headers=buyer,
        json={
            "channel": "food",
            "address": "12 Park Road",
            "payment": "upi",
            "lines": [
                {"item_id": IDLI, "shop_slug": "lake-view-tiffin", "qty": 1},
                {"item_id": RICE, "shop_slug": "neem-kirana", "qty": 1},
            ],
        },
    )
    assert mixed.status_code == 409
    assert mixed.json()["error"]["code"] == "cart_restaurant_conflict"

    client.patch(
        f"/api/v1/businesses/neem-kirana/items/{RICE}",
        headers=admin,
        json={"is_available": False},
    )
    refused = client.post("/api/v1/orders", headers=buyer, json=GROCERY)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "unavailable"


def test_grocery_from_two_shops_becomes_two_orders() -> None:
    owner = _resident("second-shop@example.com", "Second")
    buyer = _resident("two-shops@example.com", "Two Shops")
    admin = _admin()
    created = client.post(
        "/api/v1/businesses/requests",
        headers=owner,
        json={
            "name": "Station Kirana",
            "category": "grocery",
            "ward_id": W1,
            "address_text": "2 Station Road",
            "opening_hours": "8:00–20:00",
            "about": "A second grocery that also delivers.",
            "latitude": 12.972,
            "longitude": 77.594,
            "catalog": [{"name": "Toor dal", "description": "1 kg", "price_paise": 14000, "is_available": True}],
        },
    )
    assert created.status_code == 201
    shop = created.json()
    client.post(f"/api/v1/businesses/{shop['slug']}/status", headers=admin, json={"status": "approved"})
    item_id = client.get(f"/api/v1/businesses/{shop['slug']}").json()["catalog"][0]["id"]

    placed = client.post(
        "/api/v1/orders",
        headers=buyer,
        json={
            "channel": "grocery",
            "address": "12 Park Road",
            "payment": "cod",
            "lines": [
                {"item_id": RICE, "shop_slug": "neem-kirana", "qty": 1},
                {"item_id": item_id, "shop_slug": shop["slug"], "qty": 1},
            ],
        },
    )
    assert placed.status_code == 201, placed.text
    orders = placed.json()["data"]
    assert len(orders) == 2
    assert {row["shop_slug"] for row in orders} == {"neem-kirana", shop["slug"]}
    assert all(row["fee_paise"] == 2500 for row in orders)


def test_checkout_is_idempotent() -> None:
    buyer = _resident()
    body = {**GROCERY, "idempotency_key": "cart-1"}
    first = _place(buyer, body)
    second = _place(buyer, body)
    assert first["id"] == second["id"]
    assert len(client.get("/api/v1/orders", headers=buyer).json()["data"]) == 1


def test_resident_cannot_list_admin_orders() -> None:
    buyer = _resident()
    assert client.get("/api/v1/admin/orders", headers=buyer).status_code == 403
    assert client.post("/api/v1/orders", json=GROCERY).status_code == 401

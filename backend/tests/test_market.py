import base64

from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1, W2

client = TestClient(app)

PHOTO = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0fake-jpeg").decode()
PHOTO_TWO = "data:image/png;base64," + base64.b64encode(b"\x89PNGfake-png").decode()


def _auth(email: str, name: str, ward: str = W1) -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "city-life-1", "display_name": name, "ui_mode": "modern", "ward_id": ward},
    )
    assert created.status_code == 200, created.text
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _listing(headers: dict[str, str], **overrides) -> dict:
    body = {
        "title": "Cycle with basket",
        "description": "Kids cycle, 16 inch wheels. New tyres.",
        "category": "kids",
        "condition": "good",
        "price_paise": 250000,
        "quantity": 1,
        "pickup_area": "Temple Street",
        "photos": [PHOTO],
        **overrides,
    }
    created = client.post("/api/v1/market/listings", json=body, headers=headers)
    assert created.status_code == 201, created.text
    return created.json()


def test_browse_shows_seeded_listings_with_reviews() -> None:
    listings = client.get("/api/v1/market/listings").json()["data"]
    titles = {item["title"] for item in listings}
    assert {"Steel water drum", "Study table", "Ceiling fan", "Homemade mango pickle"} <= titles
    pickle = next(item for item in listings if item["title"] == "Homemade mango pickle")
    assert pickle["review_count"] == 2
    assert pickle["rating_avg"] == 4.5

    detail = client.get(f"/api/v1/market/listings/{pickle['id']}").json()
    assert detail["seller"]["name"] == "Imran"
    assert [review["reviewer_name"] for review in detail["reviews"]]
    assert detail["viewer"] == {"is_seller": False, "can_review": False, "open_order_id": None, "my_review": None}


def test_browse_filters_and_sorts() -> None:
    cheap_first = client.get("/api/v1/market/listings", params={"sort": "price_low"}).json()["data"]
    prices = [item["price_paise"] for item in cheap_first]
    assert prices == sorted(prices)
    furniture = client.get("/api/v1/market/listings", params={"category": "furniture"}).json()["data"]
    assert [item["title"] for item in furniture] == ["Study table"]
    searched = client.get("/api/v1/market/listings", params={"q": "lake view"}).json()["data"]
    assert [item["title"] for item in searched] == ["Study table"]


def test_seller_lists_edits_photos_and_pauses() -> None:
    seller = _auth("seller@example.com", "Ravi")
    listing = _listing(seller, photos=[PHOTO, PHOTO_TWO])
    assert listing["ward_name"] == "Gandhi Nagar"
    assert listing["viewer"]["is_seller"] is True
    first, second = listing["photos"]
    assert listing["cover_url"] == first["url"]

    image = client.get(first["url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content == b"\xff\xd8\xff\xe0fake-jpeg"

    edited = client.patch(
        f"/api/v1/market/listings/{listing['id']}",
        json={"price_paise": 200000, "photos": [second["id"], PHOTO]},
        headers=seller,
    )
    assert edited.status_code == 200, edited.text
    body = edited.json()
    assert body["price_paise"] == 200000
    assert body["photos"][0]["id"] == second["id"]
    assert len(body["photos"]) == 2
    assert client.get(first["url"]).status_code == 404

    paused = client.patch(f"/api/v1/market/listings/{listing['id']}", json={"status": "paused"}, headers=seller)
    assert paused.json()["status"] == "paused"
    browse_ids = {item["id"] for item in client.get("/api/v1/market/listings").json()["data"]}
    assert listing["id"] not in browse_ids
    assert client.get(f"/api/v1/market/listings/{listing['id']}").status_code == 404
    mine = client.get("/api/v1/market/listings/mine", headers=seller).json()["data"]
    assert [item["status"] for item in mine] == ["paused"]


def test_other_users_cannot_edit_or_use_foreign_photos() -> None:
    seller = _auth("seller@example.com", "Ravi")
    other = _auth("other@example.com", "Sunil", W2)
    listing = _listing(seller)
    theirs = _listing(other, title="Bookshelf")
    assert client.patch(f"/api/v1/market/listings/{listing['id']}", json={"price_paise": 100}, headers=other).status_code == 404
    stolen = client.patch(
        f"/api/v1/market/listings/{listing['id']}",
        json={"photos": [theirs["photos"][0]["id"]]},
        headers=seller,
    )
    assert stolen.status_code == 422


def test_rejects_bad_photos() -> None:
    seller = _auth("seller@example.com", "Ravi")
    bad = client.post(
        "/api/v1/market/listings",
        json={"title": "Lamp", "description": "Desk lamp", "price_paise": 30000, "photos": ["https://example.com/a.jpg"]},
        headers=seller,
    )
    assert bad.status_code == 422
    too_many = client.post(
        "/api/v1/market/listings",
        json={"title": "Lamp", "description": "Desk lamp", "price_paise": 30000, "photos": [PHOTO] * 5},
        headers=seller,
    )
    assert too_many.status_code == 422


def test_full_order_and_review_flow() -> None:
    seller = _auth("seller@example.com", "Ravi")
    buyer = _auth("buyer@example.com", "Asha", W2)
    listing = _listing(seller, quantity=3)

    assert client.post(f"/api/v1/market/listings/{listing['id']}/orders", json={}, headers=seller).status_code == 403
    early_review = client.put(f"/api/v1/market/listings/{listing['id']}/review", json={"rating": 5}, headers=buyer)
    assert early_review.status_code == 403

    placed = client.post(
        f"/api/v1/market/listings/{listing['id']}/orders",
        json={"quantity": 2, "note": "Can I pick up Sunday?"},
        headers=buyer,
    )
    assert placed.status_code == 201, placed.text
    order = placed.json()
    assert order["status"] == "placed"
    assert order["total_paise"] == 500000
    assert client.get(f"/api/v1/market/listings/{listing['id']}").json()["quantity"] == 1
    again = client.post(f"/api/v1/market/listings/{listing['id']}/orders", json={}, headers=buyer)
    assert again.status_code == 409

    assert client.delete(f"/api/v1/market/listings/{listing['id']}", headers=seller).status_code == 409
    assert client.post(f"/api/v1/market/orders/{order['id']}/status", json={"action": "accept"}, headers=buyer).status_code == 403

    accepted = client.post(
        f"/api/v1/market/orders/{order['id']}/status",
        json={"action": "accept", "note": "Sunday after 5 works."},
        headers=seller,
    )
    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["seller_note"] == "Sunday after 5 works."

    book = client.get("/api/v1/market/orders", headers=seller).json()
    assert [row["id"] for row in book["selling"]] == [order["id"]]
    assert book["buying"] == []

    received = client.post(f"/api/v1/market/orders/{order['id']}/status", json={"action": "complete"}, headers=buyer)
    assert received.json()["status"] == "completed"
    assert client.post(f"/api/v1/market/orders/{order['id']}/status", json={"action": "cancel"}, headers=buyer).status_code == 409

    reviewed = client.put(
        f"/api/v1/market/listings/{listing['id']}/review",
        json={"rating": 4, "comment": "Works well."},
        headers=buyer,
    )
    assert reviewed.status_code == 200, reviewed.text
    detail = reviewed.json()
    assert detail["review_count"] == 1
    assert detail["viewer"]["my_review"]["rating"] == 4
    assert detail["seller"]["completed_sales"] == 1

    updated = client.put(f"/api/v1/market/listings/{listing['id']}/review", json={"rating": 2}, headers=buyer).json()
    assert updated["rating_avg"] == 2.0
    assert updated["review_count"] == 1
    assert client.get("/api/v1/market/orders", headers=buyer).json()["buying"][0]["reviewed"] is True

    assert client.put(f"/api/v1/market/listings/{listing['id']}/review", json={"rating": 5}, headers=seller).status_code == 403
    assert client.delete(f"/api/v1/market/listings/{listing['id']}/review", headers=buyer).status_code == 204


def test_decline_restocks_and_sold_out_hides() -> None:
    seller = _auth("seller@example.com", "Ravi")
    buyer = _auth("buyer@example.com", "Asha", W2)
    listing = _listing(seller)
    order = client.post(f"/api/v1/market/listings/{listing['id']}/orders", json={}, headers=buyer).json()

    browse_ids = {item["id"] for item in client.get("/api/v1/market/listings").json()["data"]}
    assert listing["id"] not in browse_ids
    with_sold = client.get("/api/v1/market/listings", params={"include_sold": True}).json()["data"]
    assert next(item for item in with_sold if item["id"] == listing["id"])["status"] == "sold_out"

    declined = client.post(f"/api/v1/market/orders/{order['id']}/status", json={"action": "decline"}, headers=seller)
    assert declined.json()["status"] == "declined"
    assert client.get(f"/api/v1/market/listings/{listing['id']}").json()["status"] == "active"

    assert client.delete(f"/api/v1/market/listings/{listing['id']}", headers=seller).status_code == 204
    assert client.get(f"/api/v1/market/listings/{listing['id']}").status_code == 404

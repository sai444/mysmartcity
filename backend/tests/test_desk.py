from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1, W2
from app.modules.identity.service import identity_service

client = TestClient(app)


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _resident() -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"email": "asha2@example.com", "password": "city-life-1", "display_name": "Asha", "ward_id": W1},
    )
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def test_report_flows_from_resident_to_admin_and_back() -> None:
    resident = _resident()
    assert client.post("/api/v1/city/reports", json={"category": "Pothole", "place": "x", "details": "y"}).status_code == 401

    filed = client.post(
        "/api/v1/city/reports",
        headers=resident,
        json={"category": "Pothole", "place": "Park Road", "details": "Deep pothole near the bus stop."},
    )
    assert filed.status_code == 201
    report = filed.json()
    assert report["status"] == "submitted"
    assert report["ward_name"] == "Gandhi Nagar"

    admin = _admin()
    queue = client.get("/api/v1/admin/reports", headers=admin, params={"status": "submitted"}).json()["data"]
    assert [row["id"] for row in queue] == [report["id"]]
    assert client.get("/api/v1/admin/overview", headers=admin).json()["reports_open"] == 1

    assert client.patch(f"/api/v1/admin/reports/{report['id']}", headers=resident, json={"status": "resolved"}).status_code == 403
    resolved = client.patch(
        f"/api/v1/admin/reports/{report['id']}", headers=admin, json={"status": "resolved", "note": "Filled on Monday"}
    )
    assert resolved.json()["status"] == "resolved"

    mine = client.get("/api/v1/city/reports/mine", headers=resident).json()["data"]
    assert mine[0]["status"] == "resolved"
    assert mine[0]["admin_note"] == "Filled on Monday"


def test_reports_respect_the_feature_switch() -> None:
    admin = _admin()
    client.patch("/api/v1/admin/features/reports", headers=admin, json={"enabled": False})
    refused = client.post(
        "/api/v1/city/reports",
        headers=_resident(),
        json={"category": "Garbage", "place": "Lane 4", "details": "Bins overflowing since Friday."},
    )
    assert refused.status_code == 403


def test_admin_publishes_and_ends_notices() -> None:
    admin = _admin()
    published = client.post(
        "/api/v1/admin/notices",
        headers=admin,
        json={"title": "Tree cutting on Lake Road", "body": "Expect delays near the park gate.", "severity": "info", "ward_id": W2, "hours": 6},
    )
    assert published.status_code == 201
    notice_id = published.json()["id"]

    lake = client.get("/api/v1/city/notices", params={"ward_id": W2}).json()["data"]
    assert any(row["id"] == notice_id for row in lake)
    gandhi = client.get("/api/v1/city/notices", params={"ward_id": W1}).json()["data"]
    assert all(row["id"] != notice_id for row in gandhi)
    assert client.get(f"/api/v1/city/notices/{notice_id}").status_code == 200

    assert client.delete(f"/api/v1/admin/notices/{notice_id}", headers=admin).status_code == 204
    assert client.get(f"/api/v1/city/notices/{notice_id}").status_code == 404

    seeded = client.get("/api/v1/admin/notices", headers=admin).json()["data"]
    if seeded:
        seed_id = seeded[0]["id"]
        assert client.delete(f"/api/v1/admin/notices/{seed_id}", headers=admin).status_code == 204
        assert all(row["id"] != seed_id for row in client.get("/api/v1/admin/notices", headers=admin).json()["data"])

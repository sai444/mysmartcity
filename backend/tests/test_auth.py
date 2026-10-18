from fastapi.testclient import TestClient

from app.main import app
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

ACCOUNT = {
    "email": "resident@example.com",
    "password": "city-life-1",
    "display_name": "Asha",
    "ui_mode": "normal",
    "ward_id": W1,
}


def test_register_login_me_and_logout() -> None:
    created = client.post("/api/v1/auth/register", json=ACCOUNT)
    assert created.status_code == 200
    body = created.json()
    assert body["email"] == "resident@example.com"
    assert body["display_name"] == "Asha"
    assert body["access_token"]
    cookie = created.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "mynagari_refresh" in cookie

    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    profile = me.json()
    assert profile["ward_id"] == W1
    assert profile["ui_mode"] == "normal"
    assert profile["role"] == "resident"
    assert profile["default_address"] is None

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    refused = client.post("/api/v1/auth/refresh")
    assert refused.status_code == 401

    signed_in = client.post(
        "/api/v1/auth/login",
        json={"email": "Resident@Example.com", "password": ACCOUNT["password"]},
    )
    assert signed_in.status_code == 200
    assert signed_in.json()["expires_in"] > 0


def test_login_failure_stays_on_the_form_message() -> None:
    client.post("/api/v1/auth/register", json=ACCOUNT)
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": ACCOUNT["email"], "password": "not-the-password"},
    )
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "invalid_credentials"
    assert wrong.json()["error"]["message"] == "Email or password is incorrect."


def test_duplicate_email_and_short_password() -> None:
    assert client.post("/api/v1/auth/register", json=ACCOUNT).status_code == 200
    again = client.post("/api/v1/auth/register", json=ACCOUNT)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "email_taken"

    short = client.post("/api/v1/auth/register", json={**ACCOUNT, "email": "other@example.com", "password": "short"})
    assert short.status_code == 422
    details = short.json()["error"]["details"]
    assert details[0]["field"] == "password"


def test_refresh_rotates_the_cookie() -> None:
    created = client.post("/api/v1/auth/register", json=ACCOUNT)
    original = created.cookies["mynagari_refresh"]
    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    replay = TestClient(app).post("/api/v1/auth/refresh", cookies={"mynagari_refresh": original})
    assert replay.status_code == 401


def test_me_requires_a_token() -> None:
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_demo_admin_and_resident_sign_in(tmp_path) -> None:
    identity_service.rebind(str(tmp_path / "demo.sqlite"), seed_demo=True)
    admin = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "nagari-admin"},
    )
    assert admin.status_code == 200
    admin_me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {admin.json()['access_token']}"})
    assert admin_me.json()["display_name"] == "Meera Iyer"
    assert admin_me.json()["role"] == "admin"
    assert admin_me.json()["ward_id"] == W1

    resident = client.post(
        "/api/v1/auth/login",
        json={"email": "asha@example.com", "password": "nagari-home"},
    )
    assert resident.status_code == 200
    resident_me = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {resident.json()['access_token']}"},
    )
    assert resident_me.json()["role"] == "resident"
    assert resident_me.json()["display_name"] == "Asha Rao"


def test_profile_patch_saves_view_mode() -> None:
    created = client.post("/api/v1/auth/register", json=ACCOUNT)
    token = created.json()["access_token"]
    patched = client.patch(
        "/api/v1/users/me",
        json={"ui_mode": "modern"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patched.status_code == 200
    assert patched.json()["ui_mode"] == "modern"

from fastapi.testclient import TestClient

from app.main import app
from app.modules.admin.service import admin_service
from app.modules.civic.seed import W1
from app.modules.identity.service import identity_service

client = TestClient(app)

ACCOUNT = {
    "email": "filmer@example.com",
    "password": "city-life-1",
    "display_name": "Divya",
    "ui_mode": "modern",
    "ward_id": W1,
}

MP4 = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 4


def _resident() -> dict[str, str]:
    created = client.post("/api/v1/auth/register", json=ACCOUNT)
    assert created.status_code == 200
    return {"Authorization": f"Bearer {created.json()['access_token']}"}


def _admin() -> dict[str, str]:
    identity_service.store.seed_demo()
    signed = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "nagari-admin"})
    assert signed.status_code == 200
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def _upload(headers: dict[str, str], caption: str = "Rain on Park Road", data: bytes = MP4, mime: str = "video/mp4"):
    return client.post(
        "/api/v1/shorts",
        headers=headers,
        data={"caption": caption},
        files={"video": ("clip.mp4", data, mime)},
    )


def test_seeded_feed_mixes_ads_after_every_three_posts() -> None:
    feed = client.get("/api/v1/shorts/feed")
    assert feed.status_code == 200
    kinds = [row["kind"] for row in feed.json()["data"]]
    assert kinds == ["user", "user", "user", "ad", "user", "user"]
    assert feed.json()["data"][0]["media_kind"] == "image"
    ad = feed.json()["data"][3]
    assert ad["sponsor"]
    assert ad["cta_url"].startswith("/")
    clip = client.get(ad["video_url"], headers={"Range": "bytes=0-3"})
    assert clip.status_code == 206
    assert clip.content == b"\x1a\x45\xdf\xa3"


def test_resident_posts_likes_and_streams_a_short() -> None:
    assert _upload({}).status_code == 401
    headers = _resident()

    created = _upload(headers)
    assert created.status_code == 201
    short = created.json()
    assert short["kind"] == "user"
    assert short["author_name"] == "Divya"
    assert short["is_mine"] is True
    assert short["video_url"].startswith("/api/v1/shorts/videos/")
    assert client.get("/api/v1/shorts/feed").json()["data"][0]["id"] == short["id"]

    full = client.get(short["video_url"])
    assert full.status_code == 200
    assert full.content == MP4
    assert full.headers["content-type"] == "video/mp4"
    assert full.headers["accept-ranges"] == "bytes"

    part = client.get(short["video_url"], headers={"Range": "bytes=4-11"})
    assert part.status_code == 206
    assert part.content == b"ftypmp42"
    assert part.headers["content-range"] == f"bytes 4-11/{len(MP4)}"
    tail = client.get(short["video_url"], headers={"Range": "bytes=-4"})
    assert tail.content == MP4[-4:]
    assert client.get(short["video_url"], headers={"Range": f"bytes={len(MP4)}-"}).status_code == 416

    liked = client.put(f"/api/v1/shorts/{short['id']}/like", headers=headers)
    assert liked.json()["like_count"] == 1 and liked.json()["liked"] is True
    again = client.put(f"/api/v1/shorts/{short['id']}/like", headers=headers)
    assert again.json()["like_count"] == 1
    unliked = client.delete(f"/api/v1/shorts/{short['id']}/like", headers=headers)
    assert unliked.json()["like_count"] == 0

    assert client.post(f"/api/v1/shorts/{short['id']}/view").status_code == 204
    assert client.post(f"/api/v1/shorts/{short['id']}/click").status_code == 409
    mine = client.get("/api/v1/shorts/mine", headers=headers).json()["data"]
    assert [row["views"] for row in mine] == [1]

    assert client.delete(f"/api/v1/shorts/{short['id']}", headers=headers).status_code == 204
    assert client.get(short["video_url"]).status_code == 404


def test_upload_rejects_junk_files() -> None:
    headers = _resident()
    fake = _upload(headers, data=b"<html><script>alert(1)</script></html>")
    assert fake.status_code == 422
    assert fake.json()["error"]["details"][0]["field"] == "video"
    no_caption = _upload(headers, caption=" ")
    assert no_caption.status_code == 422


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_resident_posts_a_photo_short() -> None:
    headers = _resident()
    created = client.post(
        "/api/v1/shorts",
        headers=headers,
        data={"caption": "Rice bags at Neem Kirana"},
        files={"image": ("rice.png", PNG, "image/png")},
    )
    assert created.status_code == 201
    short = created.json()
    assert short["media_kind"] == "image"
    photo = client.get(short["video_url"])
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/png"
    assert photo.content == PNG


def test_only_admins_post_ads_and_moderate() -> None:
    resident = _resident()
    post = _upload(resident).json()
    form = {"caption": "Weekend thali at half price", "sponsor": "Annapurna Mess", "cta_label": "See menu", "cta_url": "/food"}
    files = {"video": ("ad.mp4", MP4, "video/mp4")}

    refused = client.post("/api/v1/shorts/ads", headers=resident, data=form, files=files)
    assert refused.status_code == 403
    assert client.delete("/api/v1/shorts/demo-short-lake", headers=resident).status_code == 403

    admin = _admin()
    bad_link = client.post("/api/v1/shorts/ads", headers=admin, data={**form, "cta_url": "javascript:alert(1)"}, files=files)
    assert bad_link.status_code == 422
    created = client.post("/api/v1/shorts/ads", headers=admin, data=form, files=files)
    assert created.status_code == 201
    ad = created.json()
    assert ad["kind"] == "ad" and ad["sponsor"] == "Annapurna Mess"

    assert client.post(f"/api/v1/shorts/{ad['id']}/click").status_code == 204
    managed = {row["id"]: row for row in client.get("/api/v1/shorts/manage", headers=admin).json()["data"]}
    assert managed[ad["id"]]["clicks"] == 1

    hidden = client.patch(f"/api/v1/shorts/{post['id']}", headers=admin, json={"status": "hidden"})
    assert hidden.status_code == 200
    assert all(row["id"] != post["id"] for row in client.get("/api/v1/shorts/feed").json()["data"])
    assert client.post(f"/api/v1/shorts/{post['id']}/view").status_code == 404


def test_posting_respects_the_feature_switch() -> None:
    admin = _admin()
    flags = client.get("/api/v1/features").json()["features"]
    assert flags["shorts"] is True

    admin_service.set_flag("shorts", False)
    paused = _upload(admin)
    assert paused.status_code == 403
    assert paused.json()["error"]["code"] == "feature_disabled"

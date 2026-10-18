from app.core.config import settings
from app.modules.media.objects import LocalObjects, object_store, reset_object_store


def test_local_run_keeps_blobs_out_of_minio() -> None:
    reset_object_store()
    assert settings.minio_endpoint == ""
    store = object_store()
    assert isinstance(store, LocalObjects)
    assert store.enabled is False

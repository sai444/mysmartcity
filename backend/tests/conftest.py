import pytest

from app.modules.admin.service import admin_service
from app.modules.business.service import business_service
from app.modules.civic.desk import desk_service
from app.modules.civic.directory import directory
from app.modules.civic.weather import clear_cache
from app.modules.identity.service import identity_service
from app.modules.market.service import market_service
from app.modules.media.objects import reset_object_store
from app.modules.media.service import media_service
from app.modules.property.service import property_service
from app.modules.shorts.service import shorts_service
from app.modules.ordering.service import order_service
from app.modules.services.service import local_service
from app.modules.transit.service import transit_service


@pytest.fixture(autouse=True)
def isolated_identity(tmp_path):
    identity_service.rebind(str(tmp_path / "identity.sqlite"))
    business_service.rebind(str(tmp_path / "businesses.sqlite"))
    admin_service.rebind(str(tmp_path / "admin.sqlite"))
    directory.rebind(str(tmp_path / "civic.sqlite"))
    desk_service.rebind(str(tmp_path / "civic.sqlite"))
    market_service.rebind(str(tmp_path / "market.sqlite"))
    transit_service.rebind(str(tmp_path / "transit.sqlite"))
    property_service.rebind(str(tmp_path / "property.sqlite"))
    shorts_service.rebind(str(tmp_path / "shorts.sqlite"))
    media_service.rebind(str(tmp_path / "media.sqlite"))
    order_service.rebind(str(tmp_path / "orders.sqlite"))
    local_service.rebind(str(tmp_path / "services.sqlite"))
    reset_object_store()
    clear_cache()
    yield


@pytest.fixture(autouse=True)
def offline_weather(monkeypatch):
    monkeypatch.setattr("app.modules.civic.weather.fetch_json", lambda url, timeout=4: None)

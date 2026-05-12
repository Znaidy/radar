import os
import pytest

# Must be set before any monitor module is imported (telegram.py raises SystemExit without them)
os.environ.setdefault("TG_API_ID", "12345")
os.environ.setdefault("TG_API_HASH", "testhash_placeholder_32chars_xx")

import src.core.config as config_module
import src.api.config_routes as cfg_module


@pytest.fixture(autouse=True)
def _invalidate_config_cache():
    config_module.invalidate_cache()
    yield
    config_module.invalidate_cache()


@pytest.fixture
def tmp_config(tmp_path, monkeypatch):
    """Redirects config and env paths to a temp directory."""
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(config_module, "ENV_PATH", str(tmp_path / ".env"))
    monkeypatch.setattr(cfg_module, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(cfg_module, "ENV_PATH", str(tmp_path / ".env"))
    config_module.invalidate_cache()
    return tmp_path


@pytest.fixture
def app_client(tmp_config):
    """TestClient for the FastAPI app with file I/O redirected to tmp_path."""
    os.makedirs(tmp_config / "logs", exist_ok=True)
    from fastapi.testclient import TestClient
    from src.api.main import app
    return TestClient(app)

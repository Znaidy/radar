import json
import pytest


def test_get_config_returns_200(app_client):
    r = app_client.get("/api/config")
    assert r.status_code == 200


def test_get_config_has_expected_fields(app_client, tmp_config):
    import src.core.config as config_module
    (tmp_config / "config.json").write_text(
        '{"channels": [], "keywords": [], "exclude": [], "tg_autostart": false}'
    )
    config_module.invalidate_cache()
    data = app_client.get("/api/config").json()
    assert "channels" in data
    assert "keywords" in data
    assert "exclude" in data
    assert "tg_autostart" in data


def test_get_config_masks_api_hash(app_client, tmp_config):
    import src.core.config as config_module
    (tmp_config / ".env").write_text("TG_API_HASH=mysecret\n")
    config_module.invalidate_cache()
    data = app_client.get("/api/config").json()
    assert data.get("api_hash_set") is True
    assert data.get("api_hash") != "mysecret"


def test_patch_config_updates_field(app_client, tmp_config):
    r = app_client.patch("/api/config", json={"history_limit": 100})
    assert r.status_code == 200
    assert r.json()["status"] == "saved"

    saved = json.loads((tmp_config / "config.json").read_text())
    assert saved["history_limit"] == 100


def test_patch_config_partial_update_preserves_other_fields(app_client, tmp_config):
    app_client.patch("/api/config", json={"history_limit": 100})
    app_client.patch("/api/config", json={"tg_autostart": True})

    saved = json.loads((tmp_config / "config.json").read_text())
    assert saved["history_limit"] == 100
    assert saved["tg_autostart"] is True


def test_tg_status_returns_200(app_client):
    r = app_client.get("/api/tg/status")
    assert r.status_code == 200


def test_tg_status_has_running_field(app_client):
    data = app_client.get("/api/tg/status").json()
    assert "running" in data
    assert isinstance(data["running"], bool)


def test_tg_logs_returns_log_field(app_client):
    r = app_client.get("/api/tg/logs")
    assert r.status_code == 200
    assert "log" in r.json()


def test_reveal_hash_requires_api_id(app_client, tmp_config):
    import src.core.config as config_module
    (tmp_config / ".env").write_text("TG_API_ID=12345\nTG_API_HASH=myrealhash\n")
    config_module.invalidate_cache()
    r = app_client.post("/api/config/reveal-hash", json={"api_id": "12345"})
    assert r.status_code == 200
    assert r.json()["api_hash"] == "myrealhash"


def test_reveal_hash_rejects_wrong_api_id(app_client, tmp_config):
    import src.core.config as config_module
    (tmp_config / ".env").write_text("TG_API_ID=12345\nTG_API_HASH=myrealhash\n")
    config_module.invalidate_cache()
    r = app_client.post("/api/config/reveal-hash", json={"api_id": "00000"})
    assert r.status_code == 403

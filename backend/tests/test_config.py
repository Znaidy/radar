import json
import pytest
import src.core.config as config_module
import src.api.config_routes as cfg_module


def test_load_config_returns_empty_when_no_file(tmp_config):
    cfg = config_module.load_config()
    assert isinstance(cfg.get("channels", []), list)
    assert isinstance(cfg.get("keywords", []), list)


def test_load_config_merges_from_file(tmp_config):
    data = {"channels": ["test_channel"], "keywords": ["qa"]}
    (tmp_config / "config.json").write_text(json.dumps(data))
    config_module.invalidate_cache()
    cfg = config_module.load_config()
    assert cfg["channels"] == ["test_channel"]
    assert cfg["keywords"] == ["qa"]


def test_load_config_reads_api_keys_from_env(tmp_config):
    (tmp_config / ".env").write_text("TG_API_ID=99999\nTG_API_HASH=secrethash\n")
    config_module.invalidate_cache()
    cfg = config_module.load_config()
    assert cfg["api_id"] == "99999"
    assert cfg["api_hash"] == "secrethash"


def test_load_config_ignores_malformed_json(tmp_config):
    (tmp_config / "config.json").write_text("{bad json")
    config_module.invalidate_cache()
    cfg = config_module.load_config()
    assert isinstance(cfg, dict)


def test_save_config_excludes_api_secrets(tmp_config):
    cfg = config_module.load_config()
    cfg["api_id"] = "12345"
    cfg["api_hash"] = "secrethash"
    cfg["channels"] = ["mychannel"]
    cfg_module.save_config(cfg)

    saved = json.loads((tmp_config / "config.json").read_text())
    assert "api_id" not in saved
    assert "api_hash" not in saved
    assert saved["channels"] == ["mychannel"]


def test_save_config_writes_api_keys_to_env(tmp_config):
    cfg = config_module.load_config()
    cfg["api_id"] = "42000"
    cfg["api_hash"] = "myhash"
    cfg_module.save_config(cfg)

    env_text = (tmp_config / ".env").read_text()
    assert "TG_API_ID=42000" in env_text
    assert "TG_API_HASH=myhash" in env_text


def test_save_config_does_not_overwrite_other_env_vars(tmp_config):
    (tmp_config / ".env").write_text("MY_VAR=keep_me\n")
    cfg = config_module.load_config()
    cfg_module.save_config(cfg)

    env_text = (tmp_config / ".env").read_text()
    assert "MY_VAR=keep_me" in env_text


def test_invalidate_cache_forces_reload(tmp_config):
    (tmp_config / "config.json").write_text(json.dumps({"keywords": ["first"]}))
    config_module.invalidate_cache()
    cfg1 = config_module.load_config()
    assert cfg1.get("keywords") == ["first"]

    (tmp_config / "config.json").write_text(json.dumps({"keywords": ["second"]}))
    config_module.invalidate_cache()
    cfg2 = config_module.load_config()
    assert cfg2.get("keywords") == ["second"]

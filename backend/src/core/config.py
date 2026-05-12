import logging
import time
from typing import Optional

log = logging.getLogger("config")

DEFAULT_USER_ID = 1

_cache: dict[int, tuple[dict, float]] = {}
_CACHE_TTL = 30


def load_config(user_id: int = DEFAULT_USER_ID) -> dict:
    now = time.time()
    entry = _cache.get(user_id)
    if entry and (now - entry[1]) < _CACHE_TTL:
        return entry[0].copy()

    from src.core.database import get_settings
    cfg = get_settings(user_id)
    _cache[user_id] = (cfg, now)
    return cfg.copy()


def save_config(cfg: dict, user_id: int = DEFAULT_USER_ID):
    from src.core.database import save_settings
    save_settings(cfg, user_id)
    invalidate_cache(user_id)


def invalidate_cache(user_id: Optional[int] = None):
    if user_id is None:
        _cache.clear()
    else:
        _cache.pop(user_id, None)

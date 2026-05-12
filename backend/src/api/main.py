import asyncio
import logging
import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config_routes import router as config_router
from .tg_routes import router as tg_router, is_running as tg_is_running, tg_start
from .auth_routes import router as auth_router
from .campaign_routes import router as campaign_router
from .tools_routes import router as tools_router

from src.core.paths import FRONTEND_DIR

log = logging.getLogger("watchdog")

app = FastAPI(title="QA Monitor API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(tg_router)
app.include_router(auth_router)
app.include_router(campaign_router)
app.include_router(tools_router)

if os.path.exists(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    html_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Запустите: cd frontend-react && npm run build</h1>"

_MONITORS = [
    ("tg_autostart", tg_is_running, tg_start, "TG"),
]

async def _watchdog():
    """Каждые 60 секунд проверяет autostart-мониторы и запускает запланированные кампании."""
    await asyncio.sleep(30)
    while True:
        try:
            from src.core.config import load_config
            cfg = load_config()
            for key, running_fn, start_fn, label in _MONITORS:
                if cfg.get(key) and not running_fn():
                    log.warning("[WATCHDOG] %s не запущен — перезапускаю", label)
                    try:
                        await start_fn()
                        log.info("[WATCHDOG] %s перезапущен", label)
                    except Exception as e:
                        log.error("[WATCHDOG] %s: ошибка перезапуска: %s", label, e)
        except Exception as e:
            log.error("[WATCHDOG] ошибка цикла: %s", e)

        try:
            import json
            from src.core.database import get_due_campaigns, update_campaign
            from src.api.campaign_routes import _do_send
            for camp in get_due_campaigns():
                contacts = json.loads(camp["contacts"] or "[]")
                update_campaign(camp["id"], {"status": "running"})
                log.info("[WATCHDOG] Запускаю кампанию %d (%d контактов)", camp["id"], len(contacts))
                asyncio.create_task(_do_send(camp["id"], contacts, camp["message"]))
        except Exception as e:
            log.error("[WATCHDOG] ошибка кампаний: %s", e)

        await asyncio.sleep(60)

@app.on_event("startup")
async def on_startup():
    from src.core.database import init_db
    init_db()
    from src.core.config import load_config
    cfg = load_config()
    for key, running_fn, start_fn, label in _MONITORS:
        if cfg.get(key) and not running_fn():
            try:
                await start_fn()
                log.info("[AUTOSTART] %s запущен", label)
            except Exception as e:
                log.error("[AUTOSTART] %s ошибка: %s", label, e)
    asyncio.create_task(_watchdog())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.main:app", host="127.0.0.1", port=8000, reload=False)

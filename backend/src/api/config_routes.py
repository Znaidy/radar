from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/api/config", tags=["config"])

from src.core.config import load_config, save_config

# ── Models ────────────────────────────────────────────────────────────

class ConfigUpdate(BaseModel):
    channels: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    exclude: Optional[List[str]] = None
    history_limit: Optional[int] = None
    parse_history: Optional[bool] = None
    api_id: Optional[str] = None
    api_hash: Optional[str] = None
    tg_autostart: Optional[bool] = None
    tg_bot_token: Optional[str] = None
    tg_bot_chat_id: Optional[str] = None

# ── Routes ────────────────────────────────────────────────────────────

@router.get("")
async def get_config():
    cfg = load_config()
    if cfg.get("api_hash"):
        cfg["api_hash_set"] = True
        cfg["api_hash"] = "••••••••••••••••"
    else:
        cfg["api_hash_set"] = False
    return cfg

@router.patch("")
async def update_config(update: ConfigUpdate):
    cfg = load_config()
    cfg.update(update.model_dump(exclude_none=True))
    save_config(cfg)
    return {"status": "saved"}

class RevealHashRequest(BaseModel):
    api_id: str

@router.post("/reveal-hash")
async def reveal_hash(body: RevealHashRequest):
    cfg = load_config()
    if not body.api_id or str(cfg.get("api_id", "")).strip() != body.api_id.strip():
        raise HTTPException(status_code=403, detail="api_id mismatch")
    return {"api_hash": cfg.get("api_hash", "")}

@router.post("/test-notify")
async def test_notify():
    from src.core.notify import notify_job
    cfg = load_config()
    notify_job({"title": "Test notification", "company": "Job Radar", "url": ""}, "Test", cfg)
    return {"status": "sent"}

@router.get("/detect-chat-id")
async def detect_chat_id():
    import requests as _req
    cfg = load_config()
    token = cfg.get("tg_bot_token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Bot token not set")
    try:
        r = _req.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=5)
        data = r.json()
        updates = data.get("result", [])
        if not updates:
            raise HTTPException(status_code=404, detail="No messages found. Send any message to your bot first.")
        chat_id = None
        for upd in reversed(updates):
            for key in ("message", "edited_message", "channel_post", "callback_query"):
                obj = upd.get(key)
                if obj:
                    chat = obj.get("chat") or obj.get("message", {}).get("chat")
                    if chat:
                        chat_id = str(chat["id"])
                        break
            if chat_id:
                break
        if not chat_id:
            raise HTTPException(status_code=404, detail="Could not extract chat_id. Send a text message to your bot.")
        return {"chat_id": chat_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

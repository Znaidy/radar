from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from telethon import TelegramClient
from telethon.sessions import StringSession
from .config_routes import load_config
from src.core.database import save_tg_session, load_tg_session, clear_tg_session

router = APIRouter(prefix="/api/auth", tags=["auth"])

_tg_client: Optional[TelegramClient] = None
_session_str: Optional[str] = None


def _get_web_client() -> TelegramClient:
    global _tg_client, _session_str
    cfg = load_config()
    api_id   = int(cfg.get("api_id") or 0)
    api_hash = cfg.get("api_hash") or ""
    if not api_id or not api_hash:
        raise HTTPException(status_code=400, detail="api_id and api_hash must be set in Sources → Telegram")
    if _tg_client is None:
        _tg_client = TelegramClient(StringSession(), api_id, api_hash)
    return _tg_client


def _reset_web_client():
    global _tg_client, _session_str
    _tg_client = None
    _session_str = None


class AuthRequest(BaseModel):
    phone: str

class AuthCode(BaseModel):
    phone: str
    code: str
    phone_hash: str
    password: Optional[str] = None


@router.get("/status")
async def auth_status():
    session = load_tg_session()
    return {"authorized": bool(session)}


@router.post("/send-code")
async def send_code(body: AuthRequest):
    client = _get_web_client()
    try:
        await client.connect()
        if await client.is_user_authorized():
            session_str = client.session.save()
            save_tg_session(session_str)
            return {"status": "already_authorized"}
        result = await client.send_code_request(body.phone)
        return {"status": "code_sent", "phone_hash": result.phone_code_hash}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/verify-code")
async def verify_code(body: AuthCode):
    from telethon.errors import SessionPasswordNeededError
    client = _get_web_client()
    try:
        await client.connect()
        try:
            await client.sign_in(body.phone, body.code, phone_code_hash=body.phone_hash)
        except SessionPasswordNeededError:
            if not body.password:
                raise HTTPException(status_code=428, detail="2FA_REQUIRED")
            await client.sign_in(password=body.password)
        session_str = client.session.save()
        save_tg_session(session_str)
        await client.disconnect()
        _reset_web_client()
        return {"status": "authorized"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/logout")
async def logout():
    clear_tg_session()
    _reset_web_client()
    return {"status": "logged_out"}

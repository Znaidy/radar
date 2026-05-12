import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])
log = logging.getLogger("campaigns")


class CampaignCreate(BaseModel):
    name: str
    message: str


class CampaignPatch(BaseModel):
    name:    Optional[str] = None
    message: Optional[str] = None
    status:  Optional[str] = None


@router.get("")
async def list_campaigns():
    from src.core.database import get_campaigns
    return get_campaigns()


@router.post("")
async def create_campaign(body: CampaignCreate):
    from src.core.database import create_campaign
    return create_campaign(body.name, body.message)


@router.patch("/{campaign_id}")
async def patch_campaign(campaign_id: int, body: CampaignPatch):
    from src.core.database import update_campaign
    patch = body.model_dump(exclude_none=True)
    if not update_campaign(campaign_id, patch):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "updated"}


@router.delete("/{campaign_id}")
async def remove_campaign(campaign_id: int):
    from src.core.database import delete_campaign
    if not delete_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "deleted"}


class SendRequest(BaseModel):
    contacts:     list[str]
    message:      str
    scheduled_at: Optional[str] = None   # ISO UTC string, e.g. "2024-12-31T18:00:00Z"


@router.post("/{campaign_id}/send")
async def send_campaign(campaign_id: int, body: SendRequest, background_tasks: BackgroundTasks):
    import json
    from src.core.database import update_campaign

    if body.scheduled_at:
        # save contacts as JSON, mark as scheduled
        update_campaign(campaign_id, {
            "status":       "scheduled",
            "scheduled_at": body.scheduled_at,
            "contacts":     json.dumps(body.contacts),
        })
        return {"status": "scheduled", "total": len(body.contacts)}

    update_campaign(campaign_id, {"status": "running"})
    background_tasks.add_task(_do_send, campaign_id, body.contacts, body.message)
    return {"status": "started", "total": len(body.contacts)}


async def _do_send(campaign_id: int, contacts: list[str], message: str):
    from src.core.database import load_tg_session, update_campaign
    from src.core.config import load_config
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    session_str = load_tg_session()
    if not session_str:
        log.error("[CAMPAIGN] No session — cannot send")
        update_campaign(campaign_id, {"status": "error"})
        return

    cfg      = load_config()
    api_id   = int(cfg.get("api_id") or 0)
    api_hash = cfg.get("api_hash") or ""
    if not api_id or not api_hash:
        log.error("[CAMPAIGN] No api_id/api_hash")
        update_campaign(campaign_id, {"status": "error"})
        return

    client = TelegramClient(StringSession(session_str), api_id, api_hash)
    sent = 0
    try:
        await client.connect()
        for contact in contacts:
            contact = contact.strip().lstrip("@")
            if not contact:
                continue
            try:
                await client.send_message(contact, message)
                sent += 1
                log.info("[CAMPAIGN] Sent to @%s", contact)
                await asyncio.sleep(3)
            except Exception as e:
                log.warning("[CAMPAIGN] Failed to send to @%s: %s", contact, e)
    finally:
        await client.disconnect()

    update_campaign(campaign_id, {"status": "completed", "sent_count": sent})
    log.info("[CAMPAIGN] Done. Sent: %d / %d", sent, len(contacts))

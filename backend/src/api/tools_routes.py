import csv
import io
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/tools", tags=["tools"])
log = logging.getLogger("tools")


class ParseRequest(BaseModel):
    channel:  str
    keywords: list[str] = []
    limit:    int = 100


@router.post("/parse")
async def parse_channel(body: ParseRequest):
    from src.core.database import load_tg_session
    from src.core.config import load_config
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    session_str = load_tg_session()
    if not session_str:
        raise HTTPException(status_code=400, detail="No Telegram session. Authorize first.")

    cfg      = load_config()
    api_id   = int(cfg.get("api_id") or 0)
    api_hash = cfg.get("api_hash") or ""
    if not api_id or not api_hash:
        raise HTTPException(status_code=400, detail="api_id / api_hash not configured")

    from telethon.tl.types import (
        MessageEntityMention, MessageEntityPhone,
        MessageEntityUrl, MessageEntityTextUrl, User,
    )

    channel = body.channel.lstrip("@")
    client  = TelegramClient(StringSession(session_str), api_id, api_hash)
    try:
        await client.connect()
        messages = await client.get_messages(channel, limit=min(body.limit, 500))
        results = []
        for msg in messages:
            if not msg.text:
                continue
            if body.keywords and not any(k.lower() in msg.text.lower() for k in body.keywords):
                continue

            # ── sender info ──
            sender = msg.sender
            sender_username: str | None = None
            sender_name:     str | None = None
            sender_id:       int | None = None
            if isinstance(sender, User):
                sender_id = sender.id
                if sender.username:
                    sender_username = f"@{sender.username}"
                parts = [sender.first_name or "", sender.last_name or ""]
                name  = " ".join(p for p in parts if p).strip()
                sender_name = name or None

            # ── entities: mentions + phones ──
            mentions: list[str] = []
            phones:   list[str] = []
            if msg.entities:
                for ent in msg.entities:
                    chunk = msg.text[ent.offset: ent.offset + ent.length]
                    if isinstance(ent, MessageEntityMention):
                        mentions.append(chunk)
                    elif isinstance(ent, MessageEntityPhone):
                        phones.append(chunk)

            # best contact guess: sender username → first mention → first phone
            contact = sender_username or (mentions[0] if mentions else None) or (phones[0] if phones else None)

            results.append({
                "id":              msg.id,
                "text":            msg.text[:500].strip(),
                "url":             f"https://t.me/{channel}/{msg.id}",
                "date":            str(msg.date),
                "sender_username": sender_username,
                "sender_name":     sender_name,
                "sender_id":       sender_id,
                "contact":         contact,
                "mentions":        mentions,
                "phones":          phones,
            })
        return {"channel": f"@{channel}", "total": len(results), "messages": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.disconnect()


@router.post("/save-lead")
async def save_parsed_lead(body: dict):
    from src.core.database import upsert_lead
    external_id = f"parsed_{body.get('channel', '').lstrip('@')}_{body.get('id', '')}"
    lead_id = upsert_lead("tg", external_id, {
        "title":   body.get("text", "")[:300],
        "channel": body.get("channel"),
        "url":     body.get("url"),
        "contact": body.get("contact"),
    })
    return {"saved": lead_id is not None, "id": lead_id}


@router.get("/export")
async def export_leads(status: Optional[str] = None):
    from src.core.database import get_leads
    leads = get_leads(status=status, limit=10000)

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["id", "title", "channel", "contact", "status", "notes", "url", "found_at"])
    writer.writeheader()
    for lead in leads:
        writer.writerow({k: lead.get(k, "") for k in writer.fieldnames})

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )

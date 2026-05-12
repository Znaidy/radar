import asyncio
import os
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from dotenv import load_dotenv

load_dotenv()

from src.core.config import load_config
from src.core.database import set_pid, clear_pid, load_tg_session, init_db, upsert_lead
from src.core.logger import setup_logger

PARSE_HISTORY = os.getenv("PARSE_HISTORY", "false").lower() == "true"

log = setup_logger("telegram_monitor", "tg")


def is_lead(text: str, keywords: list, exclude: list) -> bool:
    text_lower = text.lower()
    if keywords and not any(k.lower() in text_lower for k in keywords):
        return False
    if any(bad.lower() in text_lower for bad in exclude):
        return False
    return True


def _save_lead(text: str, channel: str, msg_id: int, cfg: dict):
    url = f"https://t.me/{channel}/{msg_id}" if channel and msg_id else None
    external_id = f"{channel}_{msg_id}"
    upsert_lead("tg", external_id, {
        "title":   text[:300].strip(),
        "channel": f"@{channel}" if channel else None,
        "url":     url,
    })
    from src.core.notify import notify_job
    notify_job({"title": text[:100].strip(), "url": url or ""}, "Telegram", cfg)


async def parse_history(client: TelegramClient, cfg: dict):
    channels      = cfg.get("channels", [])
    keywords      = cfg.get("keywords", [])
    exclude       = cfg.get("exclude", [])
    history_limit = int(os.getenv("HISTORY_LIMIT", str(cfg.get("history_limit", 50))))

    log.info(f"[HISTORY] Reading last {history_limit} messages per channel...")
    for channel in channels:
        try:
            messages = await client.get_messages(channel, limit=history_limit)
            found = 0
            for msg in messages:
                if not msg.text or not is_lead(msg.text, keywords, exclude):
                    continue
                found += 1
                log.info(f"[HISTORY] Lead: {msg.text[:80].strip()}...")
                _save_lead(msg.text, channel, msg.id, cfg)
            log.info(f"[HISTORY] @{channel}: {found} leads found")
        except Exception as e:
            log.error(f"[HISTORY][ERROR] Channel @{channel}: {e}")
    log.info("[HISTORY] Done. Switching to live monitoring...")


async def main():
    init_db()
    set_pid("tg", os.getpid())

    session_str = load_tg_session()
    if not session_str:
        raise SystemExit("No Telegram session in DB. Authorize first via Monitor → Telegram.")

    cfg = load_config()
    api_id   = int(cfg.get("api_id") or 0)
    api_hash = cfg.get("api_hash") or ""
    if not api_id or not api_hash:
        raise SystemExit("api_id / api_hash not configured")

    client = TelegramClient(StringSession(session_str), api_id, api_hash)

    @client.on(events.NewMessage())
    async def handler(event):
        cfg      = load_config()
        channels = cfg.get("channels", [])
        keywords = cfg.get("keywords", [])
        exclude  = cfg.get("exclude", [])
        try:
            chat     = await event.get_chat()
            username = getattr(chat, "username", None)
            if not username or username.lower() not in [c.lower() for c in channels]:
                return
        except Exception:
            return
        text = event.message.message
        if not text or not is_lead(text, keywords, exclude):
            return
        log.info(f"[ЛІД] {text[:120].strip()}...")
        _save_lead(text, username, event.message.id, cfg)

    log.info(f"[CONFIG] PARSE_HISTORY = {PARSE_HISTORY}")
    log.info(f"[CONFIG] Channels: {', '.join(cfg.get('channels', []))}")

    while True:
        try:
            await client.start()
            if PARSE_HISTORY:
                await parse_history(client, load_config())
            log.info("[START] Monitor active...")
            await client.run_until_disconnected()
        except Exception as e:
            log.error(f"[ERROR] {e}. Restarting in 60s...")
            await asyncio.sleep(60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        clear_pid("tg")

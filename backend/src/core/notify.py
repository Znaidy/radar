import requests
import logging

log = logging.getLogger(__name__)


def notify_job(job: dict, source: str, cfg: dict):
    token   = cfg.get("tg_bot_token", "").strip()
    chat_id = cfg.get("tg_bot_chat_id", "").strip()
    if not token or not chat_id:
        return

    title   = job.get("title", "—")
    company = job.get("company", "")
    url     = job.get("url") or job.get("job_url", "")

    lines = [f"🆕 *{source}*", f"*{title}*"]
    if company:
        lines.append(company)
    if url:
        lines.append(url)

    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": "\n".join(lines), "parse_mode": "Markdown"},
            timeout=5,
        )
        if not r.ok:
            log.warning(f"[NOTIFY] TG error {r.status_code}: {r.text[:100]}")
    except Exception as e:
        log.warning(f"[NOTIFY] Failed to send: {e}")

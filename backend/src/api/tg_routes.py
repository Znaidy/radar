from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.core.config import load_config
from src.core.process_manager import MonitorProcess

router = APIRouter(prefix="/api/tg", tags=["telegram"])

_monitor = MonitorProcess(name="tg", script="telegram.py")


def is_running() -> bool:
    return _monitor.is_running()


@router.get("/status")
async def tg_status():
    from src.core.database import count_leads_today
    cfg = load_config()
    return {
        "running":        is_running(),
        "found_today":    count_leads_today(),
        "channels_count": len(cfg.get("channels", [])),
        "tg_autostart":   cfg.get("tg_autostart", False),
    }


@router.post("/start")
async def tg_start():
    cfg = load_config()
    env = {
        "PARSE_HISTORY": "true" if cfg.get("parse_history") else "false",
        "HISTORY_LIMIT": str(cfg.get("history_limit", 50)),
    }
    try:
        pid = _monitor.start(env=env)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "started", "pid": pid}


@router.post("/stop")
async def tg_stop():
    if not _monitor.stop():
        raise HTTPException(status_code=400, detail="TG скрипт не запущен")
    return {"status": "stopped"}


@router.get("/leads")
async def get_leads(status: Optional[str] = None, limit: int = 500):
    from src.core.database import get_leads
    return get_leads(status=status, limit=limit)


@router.get("/leads/stats")
async def get_leads_stats():
    from src.core.database import count_leads_by_status, count_leads_today
    by_status = count_leads_by_status()
    return {
        "today":       count_leads_today(),
        "new":         by_status.get("new", 0),
        "contacted":   by_status.get("contacted", 0),
        "negotiating": by_status.get("negotiating", 0),
        "won":         by_status.get("won", 0),
        "lost":        by_status.get("lost", 0),
        "total":       sum(by_status.values()),
    }


class LeadCreate(BaseModel):
    title:   str
    channel: Optional[str] = None
    contact: Optional[str] = None
    notes:   Optional[str] = None
    url:     Optional[str] = None
    status:  str = "new"


class LeadPatch(BaseModel):
    status:  Optional[str] = None
    contact: Optional[str] = None
    notes:   Optional[str] = None


@router.post("/leads")
async def create_lead(body: LeadCreate):
    from src.core.database import create_lead as db_create_lead
    lead = db_create_lead(body.model_dump())
    return lead


@router.patch("/leads/{lead_id}")
async def patch_lead(lead_id: int, body: LeadPatch):
    from src.core.database import update_lead
    patch = body.model_dump(exclude_none=True)
    if not update_lead(lead_id, patch):
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"status": "updated"}


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: int):
    from src.core.database import delete_lead as db_delete_lead
    if not db_delete_lead(lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"status": "deleted"}


@router.get("/logs")
async def tg_logs(lines: int = 500):
    from src.core.database import get_logs
    rows = get_logs("tg", lines)
    return {"log": "\n".join(r["message"] for r in rows)}

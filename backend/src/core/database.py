import json
import logging
import os
import threading
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

log = logging.getLogger("database")

DATABASE_URL = os.environ.get("DATABASE_URL", "")

_pool: Optional[ThreadedConnectionPool] = None
_pool_lock = threading.Lock()

DEFAULT_USER_ID = 1


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                if not DATABASE_URL:
                    raise RuntimeError("DATABASE_URL environment variable is not set")
                _pool = ThreadedConnectionPool(1, 10, DATABASE_URL)
    return _pool


from contextlib import contextmanager

@contextmanager
def _connect():
    pool = _get_pool()
    conn = pool.getconn()
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def init_db():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id         SERIAL PRIMARY KEY,
                    username   TEXT UNIQUE NOT NULL,
                    email      TEXT UNIQUE,
                    password   TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id    INTEGER PRIMARY KEY REFERENCES users(id),
                    settings   TEXT NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMPTZ DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS logs (
                    id      BIGSERIAL PRIMARY KEY,
                    monitor TEXT NOT NULL,
                    level   TEXT NOT NULL DEFAULT 'INFO',
                    message TEXT NOT NULL,
                    ts      TIMESTAMPTZ DEFAULT now()
                );

                CREATE INDEX IF NOT EXISTS idx_logs_monitor_ts ON logs(monitor, ts);

                CREATE TABLE IF NOT EXISTS leads (
                    id          BIGSERIAL PRIMARY KEY,
                    source      TEXT NOT NULL,
                    external_id TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    channel     TEXT,
                    contact     TEXT,
                    notes       TEXT,
                    url         TEXT,
                    status      TEXT NOT NULL DEFAULT 'new',
                    found_at    TIMESTAMPTZ DEFAULT now(),
                    updated_at  TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(source, external_id)
                );

                CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
                CREATE INDEX IF NOT EXISTS idx_leads_found_at ON leads(found_at DESC);

                CREATE TABLE IF NOT EXISTS monitor_pids (
                    monitor TEXT PRIMARY KEY,
                    pid     INTEGER NOT NULL,
                    started_at TIMESTAMPTZ DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS tg_session (
                    id         INTEGER PRIMARY KEY DEFAULT 1,
                    session    TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    CHECK (id = 1)
                );

                CREATE TABLE IF NOT EXISTS campaigns (
                    id           BIGSERIAL PRIMARY KEY,
                    name         TEXT NOT NULL,
                    message      TEXT NOT NULL,
                    status       TEXT NOT NULL DEFAULT 'draft',
                    sent_count   INTEGER NOT NULL DEFAULT 0,
                    scheduled_at TIMESTAMPTZ,
                    contacts     TEXT,
                    created_at   TIMESTAMPTZ DEFAULT now(),
                    updated_at   TIMESTAMPTZ DEFAULT now()
                );
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS contacts TEXT;
            """)
    _seed_default_user()


def _seed_default_user():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, username) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (DEFAULT_USER_ID, "default"),
            )


# ── Settings ──────────────────────────────────────────────────────────────────

def get_settings(user_id: int = DEFAULT_USER_ID) -> dict:
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT settings FROM user_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    if row:
        try:
            return json.loads(row["settings"])
        except Exception:
            return {}
    return {}


def save_settings(settings: dict, user_id: int = DEFAULT_USER_ID):
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO user_settings (user_id, settings, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    settings   = EXCLUDED.settings,
                    updated_at = now()
            """, (user_id, json.dumps(settings, ensure_ascii=False)))


# ── Logs ──────────────────────────────────────────────────────────────────────

def insert_log(monitor: str, level: str, message: str):
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO logs (monitor, level, message) VALUES (%s, %s, %s)",
                    (monitor, level, message),
                )
                cur.execute("""
                    DELETE FROM logs WHERE monitor = %s AND id NOT IN (
                        SELECT id FROM logs WHERE monitor = %s
                        ORDER BY id DESC LIMIT 2000
                    )
                """, (monitor, monitor))
    except Exception as e:
        log.warning("insert_log failed: %s", e)


def get_logs(monitor: str, limit: int = 500) -> list[dict]:
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT ts, level, message FROM logs
                WHERE monitor = %s
                ORDER BY id DESC LIMIT %s
            """, (monitor, limit))
            rows = cur.fetchall()
    return [{"ts": str(r["ts"]), "level": r["level"], "message": r["message"]} for r in reversed(rows)]


# ── Leads ─────────────────────────────────────────────────────────────────────

def upsert_lead(source: str, external_id: str, data: dict) -> Optional[int]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO leads (source, external_id, title, channel, contact, url, found_at)
                VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (source, external_id) DO NOTHING
                RETURNING id
            """, (
                source,
                external_id,
                data.get("title", ""),
                data.get("channel"),
                data.get("contact"),
                data.get("url"),
            ))
            row = cur.fetchone()
            return row[0] if row else None


def get_leads(status: Optional[str] = None, limit: int = 500) -> list[dict]:
    params: list = []
    where = ""
    if status:
        where = "WHERE status = %s"
        params.append(status)
    params.append(limit)

    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"""
                SELECT id, source, title, channel, contact, notes, url, status, found_at, updated_at
                FROM leads
                {where}
                ORDER BY found_at DESC
                LIMIT %s
            """, params)
            rows = cur.fetchall()

    return [{
        "id":         r["id"],
        "source":     r["source"],
        "title":      r["title"],
        "channel":    r["channel"],
        "contact":    r["contact"],
        "notes":      r["notes"],
        "url":        r["url"],
        "status":     r["status"],
        "found_at":   str(r["found_at"]),
        "updated_at": str(r["updated_at"]),
    } for r in rows]


def update_lead(lead_id: int, patch: dict) -> bool:
    allowed = {"status", "contact", "notes"}
    fields = {k: v for k, v in patch.items() if k in allowed}
    if not fields:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [lead_id]
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE leads SET {set_clause}, updated_at = now() WHERE id = %s",
                values,
            )
            return cur.rowcount == 1


def create_lead(data: dict) -> dict:
    import uuid
    external_id = f"manual_{uuid.uuid4().hex[:12]}"
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO leads (source, external_id, title, channel, contact, notes, url, status, found_at)
                VALUES ('manual', %s, %s, %s, %s, %s, %s, %s, now())
                RETURNING id, source, title, channel, contact, notes, url, status, found_at, updated_at
            """, (
                external_id,
                data.get("title", ""),
                data.get("channel"),
                data.get("contact"),
                data.get("notes"),
                data.get("url"),
                data.get("status", "new"),
            ))
            r = cur.fetchone()
    return {
        "id": r["id"], "source": r["source"], "title": r["title"],
        "channel": r["channel"], "contact": r["contact"], "notes": r["notes"],
        "url": r["url"], "status": r["status"],
        "found_at": str(r["found_at"]), "updated_at": str(r["updated_at"]),
    }


def delete_lead(lead_id: int) -> bool:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
            return cur.rowcount == 1


def count_leads_today() -> int:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM leads WHERE found_at >= CURRENT_DATE")
            return cur.fetchone()[0]


def count_leads_by_status() -> dict:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, COUNT(*) FROM leads GROUP BY status")
            rows = cur.fetchall()
    return {r[0]: r[1] for r in rows}


# ── Monitor PIDs ──────────────────────────────────────────────────────────────

def set_pid(monitor: str, pid: int):
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO monitor_pids (monitor, pid, started_at)
                VALUES (%s, %s, now())
                ON CONFLICT (monitor) DO UPDATE SET pid = EXCLUDED.pid, started_at = now()
            """, (monitor, pid))


def clear_pid(monitor: str):
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM monitor_pids WHERE monitor = %s", (monitor,))


def get_pid(monitor: str) -> Optional[int]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pid FROM monitor_pids WHERE monitor = %s", (monitor,))
            row = cur.fetchone()
    return row[0] if row else None


# ── Telegram session ───────────────────────────────────────────────────────────

def save_tg_session(session_str: str):
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO tg_session (id, session, updated_at)
                VALUES (1, %s, now())
                ON CONFLICT (id) DO UPDATE SET session = EXCLUDED.session, updated_at = now()
            """, (session_str,))


def load_tg_session() -> Optional[str]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT session FROM tg_session WHERE id = 1")
            row = cur.fetchone()
    return row[0] if row else None


def clear_tg_session():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tg_session WHERE id = 1")


# ── Campaigns ─────────────────────────────────────────────────────────────────

def get_campaigns() -> list[dict]:
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM campaigns ORDER BY created_at DESC")
            rows = cur.fetchall()
    return [{
        "id":           r["id"],
        "name":         r["name"],
        "message":      r["message"],
        "status":       r["status"],
        "sent_count":   r["sent_count"],
        "scheduled_at": str(r["scheduled_at"]) if r["scheduled_at"] else None,
        "created_at":   str(r["created_at"]),
        "updated_at":   str(r["updated_at"]),
    } for r in rows]


def get_due_campaigns() -> list[dict]:
    """Return scheduled campaigns whose scheduled_at has passed."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM campaigns
                WHERE status = 'scheduled' AND scheduled_at <= now()
            """)
            rows = cur.fetchall()
    return [{
        "id":       r["id"],
        "message":  r["message"],
        "contacts": r["contacts"],
    } for r in rows]


def create_campaign(name: str, message: str) -> dict:
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO campaigns (name, message)
                VALUES (%s, %s)
                RETURNING *
            """, (name, message))
            r = cur.fetchone()
    return {"id": r["id"], "name": r["name"], "message": r["message"],
            "status": r["status"], "sent_count": r["sent_count"],
            "scheduled_at": None,
            "created_at": str(r["created_at"]), "updated_at": str(r["updated_at"])}


def update_campaign(campaign_id: int, patch: dict) -> bool:
    allowed = {"name", "message", "status", "sent_count", "scheduled_at", "contacts"}
    fields = {k: v for k, v in patch.items() if k in allowed}
    if not fields:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [campaign_id]
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE campaigns SET {set_clause}, updated_at = now() WHERE id = %s",
                values,
            )
            return cur.rowcount == 1


def delete_campaign(campaign_id: int) -> bool:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM campaigns WHERE id = %s", (campaign_id,))
            return cur.rowcount == 1

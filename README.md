# Lead Radar

Telegram lead intelligence — 24/7 channel monitoring, on-demand search, CRM pipeline, and outbound campaigns from your own Telegram account.

## Features

- **Search** — two modes in one page:
  - **24/7** — continuous channel monitor (include/exclude keyword filters, history backfill, autostart, live logs)
  - **Manual** — one-off channel parse with custom keywords and limit
- **Leads** — split-view CRM pipeline with statuses (New / Contacted / Negotiating / Won / Lost), filters, search, CSV export
- **Campaigns** — outbound Telegram campaigns sent from your account; CSV / CRM / groups as audience sources; send-now or weekly-schedule with timezone
- **Settings** — Telegram API keys, account authorization (incl. 2FA), bot notifications

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Database | External Postgres (via `DATABASE_URL`) |
| Telegram | Telethon (MTProto) |
| Frontend | React 19, TypeScript, Vite, React Router |
| UI | shadcn/ui, Tailwind CSS v4 (monochrome theme) |
| Tests | pytest |

## Docker (recommended)

```bash
cp backend/.env.example backend/.env
# Fill DATABASE_URL pointing at your external Postgres
docker compose up --build
```

Open `http://localhost:8000`. Telegram session files persist in a named Docker volume; application data lives in your external Postgres. Configure Telegram API keys via the **Settings** page.

## Manual setup

```bash
# 1. Backend dependencies
cd backend
pip install -r requirements.txt

# 2. Environment
cp .env.example .env
# Fill DATABASE_URL pointing at your external Postgres

# 3. Build frontend
cd ../frontend && npm install && npm run build

# 4. Run
cd ../backend && uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`, then go to **Settings → Telegram API** to add credentials from [my.telegram.org/apps](https://my.telegram.org/apps) and authorize your account.

## Development

```bash
# Backend
cd backend && uvicorn src.api.main:app --reload

# Frontend (separate terminal)
cd frontend && npm run dev
# http://localhost:5173 — proxies /api to :8000
```

## Tests

```bash
cd backend && python -m pytest tests/ -v
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).


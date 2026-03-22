# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maximo Data Extractor — a web tool that extracts data from IBM Maximo via OSLC API, exports to CSV/JSON, and optionally pushes to a remote PostgreSQL database. Multi-tenant support with per-tenant connections and data isolation.

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / SQLAlchemy (async) / SQLite (aiosqlite)
- **Frontend:** React 18 + Vite 6 + TailwindCSS 3 + React Query 5
- **Language:** UI is in Traditional Chinese (繁體中文)

## Development Commands

### Backend
```bash
# Setup (first time)
python -m venv venv
venv\Scripts\activate.bat          # Windows
pip install -r backend\requirements.txt

# Run backend (port 8000, auto-reload)
cd backend && python run.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Dev server with proxy to :8000
npm run build    # Production build to frontend/dist/
```

### Full Stack (Windows)
```bash
start.bat        # Creates venv, installs deps, builds frontend, starts server at :8000
```

### Docker
```bash
docker build -t maximo-data-extractor .
# See docker-compose.example.yml for PostgreSQL env vars
```

## Architecture

### Request Flow
Frontend (React SPA) → `/api/*` → FastAPI routers → Services → Maximo OSLC API / PostgreSQL

In dev mode, Vite proxies `/api` to `localhost:8000`. In production, FastAPI serves the built SPA from `frontend/dist/` as a catch-all route.

### Backend Structure (`backend/app/`)
- **`main.py`** — FastAPI app with lifespan (init DB + scheduler). Serves SPA static files.
- **`config.py`** — `pydantic-settings` based config. `BASE_DIR` resolves to `backend/` locally, `/app` in Docker.
- **`database.py`** — Async SQLAlchemy engine + session factory. Runs inline migrations on startup (ALTER TABLE with silent failure for existing columns).
- **`models.py`** — SQLAlchemy models: `Tenant`, `Connection`, `ExtractProfile`, `TransferConfig`, `ExecutionHistory`
- **`routers/`** — API endpoints, all prefixed `/api/`:
  - `connection.py` — CRUD + test connection + list object structures/fields
  - `profiles.py` — CRUD for extract profiles + transfer config per profile
  - `extract.py` — Run extraction as background task, track status in-memory (`running_tasks` dict)
  - `history.py` — Execution history CRUD + file download
  - `tenant.py` — Multi-tenant CRUD
  - `preview.py` — Preview CSV files and PostgreSQL table data
- **`services/`**:
  - `maximo.py` — `MaximoClient` using httpx. Supports `apikey` and `maxauth` (Basic Auth via `maxauth` header). Paginated extraction with progress callback.
  - `transfer.py` — `PostgreSQLTransfer` using psycopg2 (sync). Auto-creates tables (all TEXT columns), supports APPEND/REPLACE/UPSERT modes. Table naming: `{tenant}_{object_structure}`.
  - `scheduler.py` — APScheduler for cron-based extraction

### Frontend Structure (`frontend/src/`)
- **`App.jsx`** — Tab-based SPA (no router). TenantContext provides tenant selection globally.
- **`api/index.js`** — All API calls via axios, base URL `/api`
- **`pages/`** — One component per tab: ConnectionPage, ProfilesPage, ExtractPage, HistoryPage, PreviewPage

### Data Storage
- SQLite DB at `backend/data/maximo.db` (auto-created)
- Exported files at `backend/data/exports/`

## Key Patterns

- **Auth:** Two modes — `apikey` (header: `apikey: {key}`) or `maxauth` (header: `maxauth: base64(user:pass)`)
- **Migrations:** Inline in `database.py:init_db()` via ALTER TABLE wrapped in try/except (no migration framework)
- **Background tasks:** FastAPI `BackgroundTasks` for extraction; status tracked in `extract.py:running_tasks` dict
- **Tenant isolation:** `tenant_id` query parameter threaded through connection/profile queries; tenant name used as PostgreSQL table prefix

## Maximo OSLC API

```
GET {base_url}/oslc/os/{object_structure}
Headers: apikey: {key} OR maxauth: {base64}
Params: oslc.select, oslc.where, oslc.orderBy, oslc.pageSize, lean=1, pageno
```

Common object structures: MXWO (work orders), MXASSET, MXINVENTORY, MXPERSON, MXSR

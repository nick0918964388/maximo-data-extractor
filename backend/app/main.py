from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.database import init_db, AsyncSessionLocal
from app.services.scheduler import start_scheduler, stop_scheduler, add_profile_job
from app.routers import connection, profiles, extract, history, tenant, preview
import logging

logger = logging.getLogger(__name__)

# Docker: /app/app/main.py -> /app/frontend/dist
# Local:  backend/app/main.py -> frontend/dist
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

async def _load_scheduled_profiles():
    """Load profiles with cron schedules and register them with the scheduler."""
    from sqlalchemy import select
    from app.models import ExtractProfile
    from app.routers.extract import do_extract

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ExtractProfile).where(
                ExtractProfile.schedule_cron.isnot(None),
                ExtractProfile.schedule_cron != "",
            )
        )
        for p in result.scalars().all():
            try:
                add_profile_job(p.id, p.schedule_cron, lambda pid=p.id: do_extract(pid))
                logger.info(f"Registered scheduled job: profile {p.id} ({p.name}) cron={p.schedule_cron}")
            except Exception as e:
                logger.warning(f"Failed to register job for profile {p.id}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler()
    await _load_scheduled_profiles()
    yield
    stop_scheduler()

app = FastAPI(title="Maximo Data Extractor", lifespan=lifespan)

# API routers
app.include_router(connection.router)
app.include_router(profiles.router)
app.include_router(extract.router)
app.include_router(history.router)
app.include_router(tenant.router)
app.include_router(preview.router)

# Serve frontend static files if dist exists
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = FRONTEND_DIST / "index.html"
        return FileResponse(str(index))

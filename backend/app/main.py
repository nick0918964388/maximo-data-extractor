from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.database import init_db
from app.services.scheduler import start_scheduler, stop_scheduler
from app.routers import connection, profiles, extract, history, tenant, preview

# Docker: /app/app/main.py -> /app/frontend/dist
# Local:  backend/app/main.py -> frontend/dist
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler()
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

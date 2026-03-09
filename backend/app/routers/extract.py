from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json, csv, os, time
from datetime import datetime
from app.database import get_db, AsyncSessionLocal
from app.models import ExtractProfile, Connection, ExecutionHistory, TransferConfig, Tenant
from app.services.maximo import MaximoClient
from app.services.transfer import PostgreSQLTransfer
from app.config import settings

router = APIRouter(prefix="/api/extract", tags=["extract"])

# In-memory running tasks
running_tasks: dict[int, dict] = {}

class ExtractRequest(BaseModel):
    profile_id: int

async def do_extract(profile_id: int):
    async with AsyncSessionLocal() as db:
        # Load profile
        result = await db.execute(select(ExtractProfile).where(ExtractProfile.id == profile_id))
        profile = result.scalar_one_or_none()
        if not profile:
            return

        # Load connection
        conn_id = profile.connection_id
        if conn_id:
            r2 = await db.execute(select(Connection).where(Connection.id == conn_id))
        else:
            r2 = await db.execute(select(Connection).where(Connection.is_active == True).limit(1))
        conn = r2.scalar_one_or_none()
        if not conn:
            return

        # Load tenant name for table naming
        tenant_name = None
        if conn.tenant_id:
            r_tenant = await db.execute(select(Tenant).where(Tenant.id == conn.tenant_id))
            tenant = r_tenant.scalar_one_or_none()
            if tenant:
                tenant_name = tenant.name

        # Create history record
        history = ExecutionHistory(
            profile_id=profile_id,
            profile_name=profile.name,
            status="running",
            started_at=datetime.now(),
        )
        db.add(history)
        await db.commit()
        await db.refresh(history)

        running_tasks[profile_id] = {
            "history_id": history.id,
            "records": 0,
            "status": "running",
            "started_at": time.time(),
        }

        fields = json.loads(profile.fields) if profile.fields else None
        client = MaximoClient(conn.base_url, conn.api_key)
        start_time = time.time()

        try:
            async def progress(count):
                if profile_id in running_tasks:
                    running_tasks[profile_id]["records"] = count

            records = await client.extract(
                object_structure=profile.object_structure,
                fields=fields,
                where_clause=profile.where_clause,
                order_by=profile.order_by,
                page_size=profile.page_size,
                on_progress=progress,
            )

            # Write to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{profile.object_structure}_{timestamp}"
            export_format = profile.export_format or "csv"

            if export_format == "json":
                filename += ".json"
                file_path = os.path.join(settings.exports_dir, filename)
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2, default=str)
            else:
                filename += ".csv"
                file_path = os.path.join(settings.exports_dir, filename)
                if records:
                    with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
                        writer = csv.DictWriter(f, fieldnames=records[0].keys())
                        writer.writeheader()
                        writer.writerows(records)
                else:
                    open(file_path, "w").close()

            file_size = os.path.getsize(file_path) / 1024  # KB
            duration = time.time() - start_time

            history.status = "success"
            history.records_count = len(records)
            history.file_path = file_path
            history.file_size = round(file_size, 2)
            history.duration_seconds = round(duration, 2)
            history.completed_at = datetime.now()

            running_tasks[profile_id]["status"] = "success"
            running_tasks[profile_id]["records"] = len(records)

            # Transfer to PostgreSQL if configured
            r3 = await db.execute(select(TransferConfig).where(
                TransferConfig.profile_id == profile_id,
                TransferConfig.enabled == True
            ))
            tc = r3.scalar_one_or_none()
            if tc:
                import asyncio as _asyncio
                transfer = PostgreSQLTransfer(
                    host=tc.host,
                    port=tc.port,
                    database=tc.database,
                    username=tc.username,
                    password=tc.password,
                    write_mode=tc.write_mode or "APPEND",
                    upsert_key=tc.upsert_key or "",
                )
                result_t = await _asyncio.get_event_loop().run_in_executor(
                    None, transfer.transfer, records, profile.object_structure, tenant_name
                )
                history.transfer_status = result_t["status"]
            else:
                history.transfer_status = "none"

        except Exception as e:
            duration = time.time() - start_time
            history.status = "failed"
            history.error_message = str(e)
            history.duration_seconds = round(duration, 2)
            history.completed_at = datetime.now()
            history.transfer_status = "none"
            running_tasks[profile_id]["status"] = "failed"

        await db.commit()

        # Clean up running task after a while
        await asyncio.sleep(5)
        running_tasks.pop(profile_id, None)

import asyncio

@router.post("/run")
async def run_extract(req: ExtractRequest, background_tasks: BackgroundTasks):
    if req.profile_id in running_tasks and running_tasks[req.profile_id]["status"] == "running":
        raise HTTPException(400, "Extraction already running for this profile")
    background_tasks.add_task(do_extract, req.profile_id)
    return {"message": "Extraction started", "profile_id": req.profile_id}

@router.get("/status/{profile_id}")
async def get_status(profile_id: int):
    task = running_tasks.get(profile_id)
    if not task:
        return {"status": "idle"}
    return {
        "status": task["status"],
        "records": task["records"],
        "history_id": task.get("history_id"),
        "elapsed": round(time.time() - task["started_at"], 1),
    }

@router.get("/download/{history_id}")
async def download_file(history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExecutionHistory).where(ExecutionHistory.id == history_id))
    h = result.scalar_one_or_none()
    if not h or not h.file_path or not os.path.exists(h.file_path):
        raise HTTPException(404, "File not found")
    filename = os.path.basename(h.file_path)
    return FileResponse(h.file_path, filename=filename)

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json, csv, os, time, asyncio
from datetime import datetime
from app.database import get_db, AsyncSessionLocal
from app.models import ExtractProfile, Connection, ExecutionHistory, TransferConfig, Tenant
from app.services.maximo import MaximoClient
from app.services.transfer import PostgreSQLTransfer
from app.config import settings

router = APIRouter(prefix="/api/extract", tags=["extract"])

# In-memory running tasks
running_tasks: dict[int, dict] = {}


def _log(profile_id: int, message: str):
    """Append a timestamped log entry to a running task."""
    if profile_id in running_tasks:
        ts = datetime.now().strftime("%H:%M:%S")
        running_tasks[profile_id]["logs"].append(f"[{ts}] {message}")


class ExtractRequest(BaseModel):
    profile_id: int


async def do_extract(profile_id: int):
    async with AsyncSessionLocal() as db:
        # Load profile
        result = await db.execute(select(ExtractProfile).where(ExtractProfile.id == profile_id))
        profile = result.scalar_one_or_none()
        if not profile:
            _log(profile_id, "找不到抽取設定")
            return

        _log(profile_id, f"載入設定: {profile.name} ({profile.object_structure})")

        # Load connection
        conn_id = profile.connection_id
        if conn_id:
            r2 = await db.execute(select(Connection).where(Connection.id == conn_id))
        else:
            r2 = await db.execute(select(Connection).where(Connection.is_active == True).limit(1))
        conn = r2.scalar_one_or_none()
        if not conn:
            _log(profile_id, "找不到連線設定")
            running_tasks[profile_id]["status"] = "failed"
            return

        _log(profile_id, f"使用連線: {conn.name} ({conn.base_url})")

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

        running_tasks[profile_id]["history_id"] = history.id

        fields = json.loads(profile.fields) if profile.fields else None
        if fields:
            _log(profile_id, f"選取欄位: {len(fields)} 個")
        else:
            _log(profile_id, "選取欄位: 全部")

        if profile.where_clause:
            _log(profile_id, f"篩選條件: {profile.where_clause}")

        client = MaximoClient(
            base_url=conn.base_url,
            api_key=conn.api_key,
            auth_type=conn.auth_type or "apikey",
            username=conn.username,
            password=conn.password,
            original_host=conn.original_host,
        )
        start_time = time.time()

        try:
            _log(profile_id, f"開始抽取 {profile.object_structure}，每頁 {profile.page_size} 筆...")

            async def progress(count, page=None, message=None):
                if profile_id in running_tasks:
                    running_tasks[profile_id]["records"] = count
                    if message:
                        _log(profile_id, message)
                    elif page:
                        _log(profile_id, f"第 {page} 頁完成，累計 {count} 筆")

            def is_cancelled():
                return running_tasks.get(profile_id, {}).get("cancelled", False)

            records = await client.extract(
                object_structure=profile.object_structure,
                fields=fields,
                where_clause=profile.where_clause,
                order_by=profile.order_by,
                page_size=profile.page_size,
                on_progress=progress,
                is_cancelled=is_cancelled,
            )

            # Normalize records: ensure all selected fields exist in every record
            if fields and records:
                for rec in records:
                    for f in fields:
                        if f not in rec:
                            rec[f] = None

            # Check if cancelled
            if is_cancelled():
                duration = time.time() - start_time
                _log(profile_id, f"已中斷，共抽取 {len(records)} 筆 ({duration:.1f}s)")
                history.status = "cancelled"
                history.records_count = len(records)
                history.duration_seconds = round(duration, 2)
                history.completed_at = datetime.now()
                history.transfer_status = "none"
                history.error_message = "使用者手動中斷"
                running_tasks[profile_id]["status"] = "cancelled"
                running_tasks[profile_id]["records"] = len(records)
                await db.commit()
                await asyncio.sleep(10)
                running_tasks.pop(profile_id, None)
                return

            _log(profile_id, f"抽取完成，共 {len(records)} 筆")

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
                    # Collect all unique field names across all records
                    all_fields = dict.fromkeys(k for rec in records for k in rec.keys())
                    with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
                        writer = csv.DictWriter(f, fieldnames=all_fields, extrasaction="ignore")
                        writer.writeheader()
                        writer.writerows(records)
                else:
                    open(file_path, "w").close()

            file_size = os.path.getsize(file_path) / 1024  # KB
            duration = time.time() - start_time

            _log(profile_id, f"檔案已儲存: {filename} ({file_size:.1f} KB)")

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
            if tc and conn.pg_host:
                _log(profile_id, f"開始寫入 PostgreSQL ({conn.pg_host})...")
                transfer = PostgreSQLTransfer(
                    host=conn.pg_host,
                    port=conn.pg_port or 5432,
                    database=conn.pg_database,
                    username=conn.pg_username,
                    password=conn.pg_password,
                    write_mode=tc.write_mode or "APPEND",
                    upsert_key=tc.upsert_key or "",
                )
                result_t = await asyncio.get_event_loop().run_in_executor(
                    None, transfer.transfer, records, profile.object_structure, tenant_name
                )
                history.transfer_status = result_t["status"]
                if result_t["status"] == "success":
                    _log(profile_id, f"PostgreSQL 寫入成功: {result_t.get('table', '')} ({result_t.get('records', 0)} 筆)")
                else:
                    err_msg = result_t.get("error", "未知錯誤")
                    _log(profile_id, f"PostgreSQL 寫入失敗: {err_msg}")
                    history.error_message = f"Transfer failed: {err_msg}"
            else:
                history.transfer_status = "none"

            _log(profile_id, f"全部完成 ({duration:.1f}s)")

        except Exception as e:
            duration = time.time() - start_time
            history.status = "failed"
            history.error_message = str(e)
            history.duration_seconds = round(duration, 2)
            history.completed_at = datetime.now()
            history.transfer_status = "none"
            running_tasks[profile_id]["status"] = "failed"
            _log(profile_id, f"執行失敗: {str(e)}")

        await db.commit()

        # Keep task info for a while so frontend can read final status/logs
        await asyncio.sleep(10)
        running_tasks.pop(profile_id, None)


@router.post("/run")
async def run_extract(req: ExtractRequest, background_tasks: BackgroundTasks):
    if req.profile_id in running_tasks and running_tasks[req.profile_id]["status"] == "running":
        raise HTTPException(400, "Extraction already running for this profile")
    running_tasks[req.profile_id] = {
        "history_id": None,
        "records": 0,
        "status": "running",
        "started_at": time.time(),
        "logs": [],
        "cancelled": False,
    }
    background_tasks.add_task(do_extract, req.profile_id)
    return {"message": "Extraction started", "profile_id": req.profile_id}


@router.post("/cancel/{profile_id}")
async def cancel_extract(profile_id: int):
    task = running_tasks.get(profile_id)
    if not task or task["status"] != "running":
        raise HTTPException(400, "No running extraction for this profile")
    task["cancelled"] = True
    _log(profile_id, "收到中斷請求，等待當前頁面完成...")
    return {"message": "Cancel requested", "profile_id": profile_id}


@router.get("/status/{profile_id}")
async def get_status(profile_id: int):
    task = running_tasks.get(profile_id)
    if not task:
        return {"status": "idle", "logs": []}
    return {
        "status": task["status"],
        "records": task["records"],
        "history_id": task.get("history_id"),
        "elapsed": round(time.time() - task["started_at"], 1),
        "logs": task.get("logs", []),
    }


@router.get("/download/{history_id}")
async def download_file(history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExecutionHistory).where(ExecutionHistory.id == history_id))
    h = result.scalar_one_or_none()
    if not h or not h.file_path or not os.path.exists(h.file_path):
        raise HTTPException(404, "File not found")
    filename = os.path.basename(h.file_path)
    return FileResponse(h.file_path, filename=filename)

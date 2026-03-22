from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
import json
from app.database import get_db
from app.models import ExtractProfile, TransferConfig, Connection
from app.services.scheduler import add_profile_job, remove_profile_job

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _sync_schedule(profile):
    """Register or remove scheduler job based on profile's cron setting."""
    from app.routers.extract import do_extract
    if profile.schedule_cron:
        try:
            add_profile_job(profile.id, profile.schedule_cron,
                            lambda pid=profile.id: do_extract(pid))
        except Exception:
            pass
    else:
        remove_profile_job(profile.id)

class ProfileCreate(BaseModel):
    name: str
    object_structure: str
    fields: Optional[list[str]] = None
    child_fields: Optional[dict] = None
    where_clause: Optional[str] = None
    incremental_field: Optional[str] = None
    order_by: Optional[str] = None
    page_size: int = 500
    export_format: str = "csv"
    schedule_cron: Optional[str] = None
    connection_id: Optional[int] = None

class TransferConfigCreate(BaseModel):
    write_mode: str = "APPEND"
    upsert_key: str = ""
    enabled: bool = False

def profile_to_dict(p: ExtractProfile) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "object_structure": p.object_structure,
        "fields": json.loads(p.fields) if p.fields else [],
        "child_fields": json.loads(p.child_fields) if p.child_fields else {},
        "where_clause": p.where_clause,
        "incremental_field": p.incremental_field,
        "order_by": p.order_by,
        "page_size": p.page_size,
        "export_format": p.export_format,
        "schedule_cron": p.schedule_cron,
        "connection_id": p.connection_id,
        "is_active": p.is_active,
        "created_at": str(p.created_at) if p.created_at else None,
        "updated_at": str(p.updated_at) if p.updated_at else None,
    }

@router.get("")
async def list_profiles(
    tenant_id: Optional[int] = Query(None),
    connection_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """列出設定檔，可依租戶或連線篩選"""
    query = select(ExtractProfile).order_by(ExtractProfile.created_at.desc())

    if connection_id is not None:
        query = query.where(ExtractProfile.connection_id == connection_id)
    elif tenant_id is not None:
        # 透過 connection 的 tenant_id 篩選
        conn_result = await db.execute(
            select(Connection.id).where(Connection.tenant_id == tenant_id)
        )
        conn_ids = [c for c in conn_result.scalars().all()]
        if conn_ids:
            query = query.where(ExtractProfile.connection_id.in_(conn_ids))
        else:
            return []  # 沒有該租戶的連線

    result = await db.execute(query)
    profiles = result.scalars().all()

    # 批次查詢所有 profile 的 transfer config enabled 狀態
    profile_ids = [p.id for p in profiles]
    transfer_enabled_ids = set()
    if profile_ids:
        tc_result = await db.execute(
            select(TransferConfig.profile_id).where(
                TransferConfig.profile_id.in_(profile_ids),
                TransferConfig.enabled == True
            )
        )
        transfer_enabled_ids = set(tc_result.scalars().all())

    results = []
    for p in profiles:
        d = profile_to_dict(p)
        d["transfer_enabled"] = p.id in transfer_enabled_ids
        results.append(d)
    return results

@router.get("/{profile_id}")
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExtractProfile).where(ExtractProfile.id == profile_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Profile not found")
    return profile_to_dict(p)

@router.post("")
async def create_profile(data: ProfileCreate, db: AsyncSession = Depends(get_db)):
    p = ExtractProfile(
        name=data.name,
        object_structure=data.object_structure,
        fields=json.dumps(data.fields) if data.fields else None,
        child_fields=json.dumps(data.child_fields) if data.child_fields else None,
        where_clause=data.where_clause,
        incremental_field=data.incremental_field,
        order_by=data.order_by,
        page_size=data.page_size,
        export_format=data.export_format,
        schedule_cron=data.schedule_cron,
        connection_id=data.connection_id,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    _sync_schedule(p)
    return profile_to_dict(p)

@router.put("/{profile_id}")
async def update_profile(profile_id: int, data: ProfileCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExtractProfile).where(ExtractProfile.id == profile_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Profile not found")
    p.name = data.name
    p.object_structure = data.object_structure
    p.fields = json.dumps(data.fields) if data.fields else None
    p.child_fields = json.dumps(data.child_fields) if data.child_fields else None
    p.where_clause = data.where_clause
    p.incremental_field = data.incremental_field
    p.order_by = data.order_by
    p.page_size = data.page_size
    p.export_format = data.export_format
    p.schedule_cron = data.schedule_cron
    p.connection_id = data.connection_id
    await db.commit()
    await db.refresh(p)
    _sync_schedule(p)
    return profile_to_dict(p)

@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExtractProfile).where(ExtractProfile.id == profile_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Profile not found")
    remove_profile_job(profile_id)
    await db.delete(p)
    await db.commit()
    return {"deleted": True}

@router.get("/{profile_id}/transfer")
async def get_transfer_config(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TransferConfig).where(TransferConfig.profile_id == profile_id))
    tc = result.scalar_one_or_none()
    if not tc:
        return None
    return {
        "id": tc.id,
        "profile_id": tc.profile_id,
        "write_mode": tc.write_mode,
        "upsert_key": tc.upsert_key or "",
        "enabled": tc.enabled,
    }

@router.post("/{profile_id}/transfer")
async def save_transfer_config(profile_id: int, data: TransferConfigCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TransferConfig).where(TransferConfig.profile_id == profile_id))
    tc = result.scalar_one_or_none()
    if tc:
        tc.write_mode = data.write_mode
        tc.upsert_key = data.upsert_key
        tc.enabled = data.enabled
    else:
        tc = TransferConfig(
            profile_id=profile_id,
            write_mode=data.write_mode,
            upsert_key=data.upsert_key,
            enabled=data.enabled,
        )
        db.add(tc)
    await db.commit()
    return {"saved": True}

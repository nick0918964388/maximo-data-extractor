from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional
from app.database import get_db
from app.models import ExecutionHistory, ExtractProfile, Connection

router = APIRouter(prefix="/api/history", tags=["history"])

def history_to_dict(h: ExecutionHistory) -> dict:
    return {
        "id": h.id,
        "profile_id": h.profile_id,
        "profile_name": h.profile_name,
        "status": h.status,
        "records_count": h.records_count,
        "file_path": h.file_path,
        "file_size": h.file_size,
        "error_message": h.error_message,
        "transfer_status": h.transfer_status,
        "started_at": str(h.started_at) if h.started_at else None,
        "completed_at": str(h.completed_at) if h.completed_at else None,
        "duration_seconds": h.duration_seconds,
    }

@router.get("")
async def list_history(
    limit: int = 50,
    tenant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    if tenant_id is not None:
        # Filter history by tenant: history -> profile -> connection -> tenant_id
        query = (
            select(ExecutionHistory)
            .join(ExtractProfile, ExecutionHistory.profile_id == ExtractProfile.id)
            .join(Connection, ExtractProfile.connection_id == Connection.id)
            .where(Connection.tenant_id == tenant_id)
            .order_by(ExecutionHistory.started_at.desc())
            .limit(limit)
        )
    else:
        query = (
            select(ExecutionHistory)
            .order_by(ExecutionHistory.started_at.desc())
            .limit(limit)
        )
    result = await db.execute(query)
    return [history_to_dict(h) for h in result.scalars().all()]

@router.get("/{history_id}")
async def get_history(history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExecutionHistory).where(ExecutionHistory.id == history_id))
    h = result.scalar_one_or_none()
    if not h:
        return None
    return history_to_dict(h)

@router.delete("/{history_id}")
async def delete_history(history_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ExecutionHistory).where(ExecutionHistory.id == history_id))
    await db.commit()
    return {"deleted": True}

@router.delete("")
async def clear_history(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ExecutionHistory))
    await db.commit()
    return {"deleted": True}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Tenant, Connection

router = APIRouter(prefix="/api/tenants", tags=["tenants"])

class TenantCreate(BaseModel):
    name: str
    description: Optional[str] = None

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

def tenant_to_dict(t: Tenant) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "created_at": str(t.created_at) if t.created_at else None,
    }

@router.get("")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).order_by(Tenant.name))
    return [tenant_to_dict(t) for t in result.scalars().all()]

@router.get("/{tenant_id}")
async def get_tenant(tenant_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tenant not found")
    return tenant_to_dict(t)

@router.post("")
async def create_tenant(data: TenantCreate, db: AsyncSession = Depends(get_db)):
    # Check if name already exists
    existing = await db.execute(select(Tenant).where(Tenant.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Tenant with this name already exists")
    
    tenant = Tenant(name=data.name, description=data.description)
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant_to_dict(tenant)

@router.put("/{tenant_id}")
async def update_tenant(tenant_id: int, data: TenantUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    if data.name is not None:
        # Check if name conflicts
        existing = await db.execute(select(Tenant).where(Tenant.name == data.name, Tenant.id != tenant_id))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Tenant with this name already exists")
        tenant.name = data.name
    if data.description is not None:
        tenant.description = data.description
    
    await db.commit()
    return tenant_to_dict(tenant)

@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    await db.delete(tenant)
    await db.commit()
    return {"deleted": True}

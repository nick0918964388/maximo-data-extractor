from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Connection
from app.services.maximo import MaximoClient

router = APIRouter(prefix="/api/connection", tags=["connection"])

class ConnectionCreate(BaseModel):
    name: str = "Default"
    base_url: str
    api_key: str
    tenant_id: Optional[int] = None

class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    tenant_id: Optional[int] = None

def connection_to_dict(conn: Connection) -> dict:
    return {
        "id": conn.id,
        "name": conn.name,
        "base_url": conn.base_url,
        "api_key": conn.api_key,
        "is_active": conn.is_active,
        "tenant_id": conn.tenant_id,
    }

@router.get("")
async def get_connection(
    tenant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """取得連線，可依租戶篩選"""
    query = select(Connection).where(Connection.is_active == True)
    if tenant_id is not None:
        query = query.where(Connection.tenant_id == tenant_id)
    query = query.limit(1)
    
    result = await db.execute(query)
    conn = result.scalar_one_or_none()
    if not conn:
        return None
    return connection_to_dict(conn)

@router.get("/list")
async def list_connections(
    tenant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """列出所有連線，可依租戶篩選"""
    query = select(Connection).order_by(Connection.name)
    if tenant_id is not None:
        query = query.where(Connection.tenant_id == tenant_id)
    
    result = await db.execute(query)
    return [connection_to_dict(c) for c in result.scalars().all()]

@router.post("")
async def create_connection(data: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    # Deactivate other connections in same tenant
    query = select(Connection)
    if data.tenant_id is not None:
        query = query.where(Connection.tenant_id == data.tenant_id)
    existing = await db.execute(query)
    for c in existing.scalars().all():
        c.is_active = False
    
    conn = Connection(
        name=data.name, 
        base_url=data.base_url, 
        api_key=data.api_key, 
        is_active=True,
        tenant_id=data.tenant_id
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return connection_to_dict(conn)

@router.put("/{conn_id}")
async def update_connection(conn_id: int, data: ConnectionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    if data.name is not None:
        conn.name = data.name
    if data.base_url is not None:
        conn.base_url = data.base_url
    if data.api_key is not None:
        conn.api_key = data.api_key
    if data.tenant_id is not None:
        conn.tenant_id = data.tenant_id
    await db.commit()
    return connection_to_dict(conn)

@router.delete("/{conn_id}")
async def delete_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    await db.delete(conn)
    await db.commit()
    return {"deleted": True}

@router.post("/test")
async def test_connection(data: ConnectionCreate):
    client = MaximoClient(data.base_url, data.api_key)
    try:
        result = await client.test_connection()
        return {"success": True, **result}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/object-structures")
async def get_object_structures(
    tenant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(Connection).where(Connection.is_active == True)
    if tenant_id is not None:
        query = query.where(Connection.tenant_id == tenant_id)
    query = query.limit(1)
    
    result = await db.execute(query)
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(400, "No active connection configured")
    client = MaximoClient(conn.base_url, conn.api_key)
    structures = await client.list_object_structures()
    return structures

@router.get("/fields/{object_structure}")
async def get_fields(
    object_structure: str, 
    tenant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(Connection).where(Connection.is_active == True)
    if tenant_id is not None:
        query = query.where(Connection.tenant_id == tenant_id)
    query = query.limit(1)
    
    result = await db.execute(query)
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(400, "No active connection configured")
    client = MaximoClient(conn.base_url, conn.api_key)
    try:
        fields = await client.get_fields(object_structure)
        return fields
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch fields: {str(e)}")

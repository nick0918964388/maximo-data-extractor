from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional
import csv
import os
import asyncpg

from app.database import get_db
from app.models import ExecutionHistory

router = APIRouter(prefix="/api/preview", tags=["preview"])

# PostgreSQL 連線設定
PG_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "database": os.getenv("POSTGRES_DB", "finrecorder"),
    "user": os.getenv("POSTGRES_USER", "finrecorder"),
    "password": os.getenv("POSTGRES_PASSWORD", "finrecorder123"),
}

@router.get("/csv/{history_id}")
async def preview_csv(
    history_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """預覽 CSV 檔案內容"""
    result = await db.execute(select(ExecutionHistory).where(ExecutionHistory.id == history_id))
    history = result.scalar_one_or_none()
    
    if not history:
        raise HTTPException(404, "History record not found")
    
    if not history.file_path or not os.path.exists(history.file_path):
        raise HTTPException(404, "CSV file not found")
    
    try:
        rows = []
        headers = []
        total_rows = 0
        skip = (page - 1) * page_size
        
        with open(history.file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            
            for i, row in enumerate(reader):
                total_rows += 1
                if i >= skip and len(rows) < page_size:
                    rows.append(row)
        
        return {
            "headers": headers,
            "rows": rows,
            "total_rows": total_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": (total_rows + page_size - 1) // page_size,
            "file_path": history.file_path,
            "profile_name": history.profile_name,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to read CSV: {str(e)}")

@router.get("/db/tables")
async def list_db_tables():
    """列出所有 maximo_* 資料表"""
    try:
        conn = await asyncpg.connect(**PG_CONFIG)
        try:
            rows = await conn.fetch("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE 'maximo_%'
                ORDER BY table_name
            """)
            return {"tables": [row["table_name"] for row in rows]}
        finally:
            await conn.close()
    except Exception as e:
        raise HTTPException(500, f"Database connection failed: {str(e)}")

@router.get("/db/{table_name}")
async def preview_db_table(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """預覽資料庫表內容"""
    # 安全檢查：只允許 maximo_ 開頭的表
    if not table_name.startswith("maximo_"):
        raise HTTPException(400, "Only maximo_* tables are allowed")
    
    # 防止 SQL injection
    if not table_name.replace("_", "").isalnum():
        raise HTTPException(400, "Invalid table name")
    
    try:
        conn = await asyncpg.connect(**PG_CONFIG)
        try:
            # 取得總筆數
            count_result = await conn.fetchval(f'SELECT COUNT(*) FROM "{table_name}"')
            total_rows = count_result or 0
            
            # 取得欄位名稱
            columns_result = await conn.fetch(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY ordinal_position
            """, table_name)
            headers = [col["column_name"] for col in columns_result]
            
            # 分頁查詢
            offset = (page - 1) * page_size
            rows_result = await conn.fetch(
                f'SELECT * FROM "{table_name}" LIMIT $1 OFFSET $2',
                page_size, offset
            )
            
            # 轉換為 list of lists
            rows = [[str(v) if v is not None else "" for v in row.values()] for row in rows_result]
            
            return {
                "table_name": table_name,
                "headers": headers,
                "rows": rows,
                "total_rows": total_rows,
                "page": page,
                "page_size": page_size,
                "total_pages": (total_rows + page_size - 1) // page_size if total_rows > 0 else 1,
            }
        finally:
            await conn.close()
    except asyncpg.UndefinedTableError:
        raise HTTPException(404, f"Table '{table_name}' not found")
    except Exception as e:
        raise HTTPException(500, f"Database query failed: {str(e)}")

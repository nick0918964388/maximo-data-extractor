from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings
import os

os.makedirs(settings.data_dir, exist_ok=True)
os.makedirs(settings.exports_dir, exist_ok=True)

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Run migrations
    migrations = [
        # Add tenant_id to connections
        "ALTER TABLE connections ADD COLUMN tenant_id INTEGER",
        # Add transfer config columns
        "ALTER TABLE transfer_configs ADD COLUMN database TEXT DEFAULT 'finrecorder'",
        "ALTER TABLE transfer_configs ADD COLUMN write_mode TEXT DEFAULT 'APPEND'",
        "ALTER TABLE transfer_configs ADD COLUMN upsert_key TEXT DEFAULT ''",
    ]
    
    async with engine.begin() as conn:
        for sql in migrations:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # Column already exists
        
        # Create default tenant if not exists
        try:
            result = await conn.execute(text("SELECT COUNT(*) FROM tenants"))
            count = result.scalar()
            if count == 0:
                await conn.execute(
                    text("INSERT INTO tenants (name, description) VALUES ('Default', '預設租戶')")
                )
        except Exception:
            pass  # Table might not exist yet or other error

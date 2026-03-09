from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    connections = relationship("Connection", back_populates="tenant", cascade="all, delete-orphan")

class Connection(Base):
    __tablename__ = "connections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), default="Default")
    base_url = Column(String(500), nullable=False)
    auth_type = Column(String(20), default="apikey")  # apikey or maxauth
    api_key = Column(String(200), nullable=True)
    username = Column(String(100), nullable=True)
    password = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant = relationship("Tenant", back_populates="connections")
    profiles = relationship("ExtractProfile", back_populates="connection", cascade="all, delete-orphan")

class ExtractProfile(Base):
    __tablename__ = "extract_profiles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    object_structure = Column(String(100), nullable=False)
    fields = Column(Text)           # JSON array of field names
    where_clause = Column(Text)     # oslc.where condition
    order_by = Column(String(200))  # oslc.orderBy
    page_size = Column(Integer, default=500)
    export_format = Column(String(10), default="csv")  # csv or json
    schedule_cron = Column(String(100))   # cron expression, null = manual only
    is_active = Column(Boolean, default=True)
    connection_id = Column(Integer, ForeignKey("connections.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    connection = relationship("Connection", back_populates="profiles")

class TransferConfig(Base):
    __tablename__ = "transfer_configs"
    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, nullable=False)
    host = Column(String(200), default="postgres.nickai.cc")
    port = Column(Integer, default=5432)
    database = Column(String(200), default="finrecorder")
    username = Column(String(100), default="finrecorder")
    password = Column(String(200), default="finrecorder123")
    write_mode = Column(String(20), default="APPEND")   # APPEND / REPLACE / UPSERT
    upsert_key = Column(String(100), default="")         # column name for UPSERT conflict
    enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

class ExecutionHistory(Base):
    __tablename__ = "execution_history"
    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, nullable=False)
    profile_name = Column(String(200))
    status = Column(String(20))  # running, success, failed
    records_count = Column(Integer, default=0)
    file_path = Column(String(500))
    file_size = Column(Float)
    error_message = Column(Text)
    transfer_status = Column(String(20))  # none, success, failed
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
    duration_seconds = Column(Float)

-- Migration: Add multi-tenant support
-- Run this script against your SQLite database

-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add tenant_id to connections table
ALTER TABLE connections ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);

-- Insert default tenant
INSERT INTO tenants (name, description) VALUES ('Default', '預設租戶');

-- Update existing connections to use default tenant
UPDATE connections SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Note: SQLite doesn't support adding foreign keys to existing tables easily
-- The above approach adds the column without constraint
-- For production PostgreSQL, you would use:
-- ALTER TABLE connections ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);

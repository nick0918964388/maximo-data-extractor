-- Add MAXAUTH support to connections table
ALTER TABLE connections ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) DEFAULT 'apikey';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS password VARCHAR(200);

-- Make api_key nullable (since MAXAUTH doesn't need it)
-- Note: SQLite doesn't support ALTER COLUMN, so this is for PostgreSQL/MySQL reference only

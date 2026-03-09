import psycopg2
import psycopg2.extras
from typing import List, Dict, Any


class PostgreSQLTransfer:
    def __init__(self, host: str, port: int, database: str, username: str, password: str,
                 write_mode: str = "APPEND", upsert_key: str = ""):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.write_mode = write_mode.upper()
        self.upsert_key = upsert_key

    def transfer(self, records: List[Dict[str, Any]], object_structure: str, tenant_name: str = None) -> dict:
        # 表名格式: {tenant}_{os} 或 maximo_{os}（無租戶時）
        prefix = tenant_name.lower().replace(" ", "_") if tenant_name else "maximo"
        table_name = f"{prefix}_{object_structure.lower()}"
        
        if not records:
            return {"status": "success", "table": table_name, "records": 0}
        columns = list(records[0].keys())

        try:
            conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                dbname=self.database,
                user=self.username,
                password=self.password,
                connect_timeout=30,
            )
            cur = conn.cursor()

            # Create table if not exists (all TEXT columns)
            col_defs = ", ".join([f'"{c}" TEXT' for c in columns])
            cur.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

            # Add any missing columns (schema evolution)
            cur.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
                (table_name,)
            )
            existing_cols = {row[0] for row in cur.fetchall()}
            for col in columns:
                if col not in existing_cols:
                    cur.execute(f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "{col}" TEXT')

            if self.write_mode == "REPLACE":
                cur.execute(f'TRUNCATE TABLE "{table_name}"')

            cols_str = ", ".join([f'"{c}"' for c in columns])
            placeholders = ", ".join(["%s"] * len(columns))

            if self.write_mode == "UPSERT" and self.upsert_key and self.upsert_key in columns:
                update_str = ", ".join(
                    [f'"{c}" = EXCLUDED."{c}"' for c in columns if c != self.upsert_key]
                )
                sql = (
                    f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders}) '
                    f'ON CONFLICT ("{self.upsert_key}") DO UPDATE SET {update_str}'
                )
            else:
                sql = f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders})'

            values_list = [
                tuple(str(r.get(c)) if r.get(c) is not None else None for c in columns)
                for r in records
            ]
            psycopg2.extras.execute_batch(cur, sql, values_list, page_size=500)

            conn.commit()
            cur.close()
            conn.close()
            return {"status": "success", "table": table_name, "records": len(records)}

        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def test_connection(self) -> dict:
        try:
            conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                dbname=self.database,
                user=self.username,
                password=self.password,
                connect_timeout=10,
            )
            conn.close()
            return {"status": "success"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

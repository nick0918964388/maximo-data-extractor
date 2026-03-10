import json
import psycopg2
import psycopg2.extras
from typing import List, Dict, Any, Tuple


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

    def _separate_nested(self, records: List[Dict], parent_key: str = None
                         ) -> Tuple[List[Dict], Dict[str, List[Dict]]]:
        """Separate nested arrays from flat fields.
        Returns (flat_records, children) where children maps field_name -> child rows.
        Each child row gets a '_parent_key' column for back-reference.
        """
        flat_records = []
        children: Dict[str, List[Dict]] = {}

        for idx, record in enumerate(records):
            flat = {}
            parent_ref = str(record.get(parent_key)) if parent_key and record.get(parent_key) is not None else str(idx + 1)

            for key, value in record.items():
                if isinstance(value, list):
                    if key not in children:
                        children[key] = []
                    for child_item in value:
                        if isinstance(child_item, dict):
                            child_row = {k: v for k, v in child_item.items()
                                         if not k.startswith("rdf") and not k.startswith("_")
                                         and k != "href" and k != "localref"
                                         and not k.endswith("_collectionref")}
                            child_row["_parent_key"] = parent_ref
                            children[key].append(child_row)
                elif isinstance(value, dict):
                    flat[key] = json.dumps(value, ensure_ascii=False, default=str) if value else None
                else:
                    flat[key] = value

            flat_records.append(flat)

        return flat_records, children

    def _get_all_columns(self, records: List[Dict]) -> List[str]:
        """Collect all unique column names across all records, preserving order."""
        seen = {}
        for rec in records:
            for k in rec:
                if k not in seen:
                    seen[k] = True
        return list(seen.keys())

    def _ensure_table(self, cur, table_name: str, columns: List[str]):
        """Create table if not exists, add missing columns."""
        col_defs = ", ".join([f'"{c}" TEXT' for c in columns])
        cur.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            (table_name,)
        )
        existing_cols = {row[0] for row in cur.fetchall()}
        for col in columns:
            if col not in existing_cols:
                cur.execute(f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "{col}" TEXT')

    def _insert_records(self, cur, table_name: str, columns: List[str],
                        records: List[Dict], upsert_key: str = None):
        """Insert records into table, with optional UPSERT."""
        if not records or not columns:
            return

        cols_str = ", ".join([f'"{c}"' for c in columns])
        placeholders = ", ".join(["%s"] * len(columns))

        if upsert_key and upsert_key in columns:
            constraint_name = f"uq_{table_name}_{upsert_key}"
            cur.execute(f"""
                DO $$ BEGIN
                    ALTER TABLE "{table_name}" ADD CONSTRAINT "{constraint_name}"
                        UNIQUE ("{upsert_key}");
                EXCEPTION WHEN duplicate_table THEN NULL;
                END $$;
            """)
            update_str = ", ".join(
                [f'"{c}" = EXCLUDED."{c}"' for c in columns if c != upsert_key]
            )
            sql = (
                f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders}) '
                f'ON CONFLICT ("{upsert_key}") DO UPDATE SET {update_str}'
            )
        else:
            sql = f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders})'

        values_list = [
            tuple(str(r.get(c)) if r.get(c) is not None else None for c in columns)
            for r in records
        ]
        psycopg2.extras.execute_batch(cur, sql, values_list, page_size=500)

    def transfer(self, records: List[Dict[str, Any]], object_structure: str, tenant_name: str = None) -> dict:
        prefix = tenant_name.lower().replace(" ", "_") if tenant_name else "maximo"
        main_table = f"{prefix}_{object_structure.lower()}"

        if not records:
            return {"status": "success", "table": main_table, "records": 0}

        parent_key = self.upsert_key if self.upsert_key else None

        # Separate nested arrays from flat fields
        flat_records, children = self._separate_nested(records, parent_key)
        flat_columns = self._get_all_columns(flat_records)

        try:
            conn = psycopg2.connect(
                host=self.host, port=self.port, dbname=self.database,
                user=self.username, password=self.password, connect_timeout=30,
            )
            cur = conn.cursor()

            # REPLACE mode: truncate child tables first, then main
            if self.write_mode == "REPLACE":
                for child_field in children:
                    child_table = f"{main_table}_{child_field}"
                    cur.execute(f"""
                        DO $$ BEGIN
                            EXECUTE 'TRUNCATE TABLE "{child_table}"';
                        EXCEPTION WHEN undefined_table THEN NULL;
                        END $$;
                    """)
                cur.execute(f'CREATE TABLE IF NOT EXISTS "{main_table}" ("_placeholder" TEXT)')
                cur.execute(f'TRUNCATE TABLE "{main_table}"')

            # Main table
            self._ensure_table(cur, main_table, flat_columns)
            upsert_key_for_main = self.upsert_key if self.write_mode == "UPSERT" and self.upsert_key else None
            self._insert_records(cur, main_table, flat_columns, flat_records, upsert_key_for_main)

            # Child tables
            child_results = {}
            for child_field, child_rows in children.items():
                if not child_rows:
                    continue
                child_table = f"{main_table}_{child_field}"
                child_columns = self._get_all_columns(child_rows)

                self._ensure_table(cur, child_table, child_columns)

                # UPSERT mode: delete existing children for these parents, then re-insert
                if self.write_mode == "UPSERT" and parent_key:
                    parent_values = list(set(
                        r["_parent_key"] for r in child_rows if r.get("_parent_key")
                    ))
                    if parent_values:
                        placeholders_del = ", ".join(["%s"] * len(parent_values))
                        cur.execute(
                            f'DELETE FROM "{child_table}" WHERE "_parent_key" IN ({placeholders_del})',
                            parent_values
                        )

                self._insert_records(cur, child_table, child_columns, child_rows)
                child_results[child_field] = len(child_rows)

            conn.commit()
            cur.close()
            conn.close()

            return {
                "status": "success",
                "table": main_table,
                "records": len(flat_records),
                "child_tables": child_results,
            }

        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def test_connection(self) -> dict:
        try:
            conn = psycopg2.connect(
                host=self.host, port=self.port, dbname=self.database,
                user=self.username, password=self.password, connect_timeout=10,
            )
            conn.close()
            return {"status": "success"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

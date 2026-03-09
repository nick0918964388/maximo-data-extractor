import httpx
import json
import base64
from typing import Optional

class MaximoClient:
    def __init__(self, base_url: str, api_key: str = None, auth_type: str = "apikey", 
                 username: str = None, password: str = None):
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.headers = {"Accept": "application/json"}
        
        if auth_type == "maxauth" and username and password:
            # MAXAUTH: Base64 encode username:password
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            self.headers["maxauth"] = credentials
        elif api_key:
            self.headers["apikey"] = api_key

    async def test_connection(self) -> dict:
        url = f"{self.base_url}/oslc/os/mxwo"
        params = {"oslc.pageSize": 1, "lean": 1}
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            return {"status": "ok", "code": resp.status_code}

    async def list_object_structures(self) -> list[str]:
        # Return common Maximo object structures
        return [
            "MXWO", "MXASSET", "MXINVENTORY", "MXPERSON", "MXSR",
            "MXPO", "MXPR", "MXINVUSE", "MXLABOR", "MXLOCSYS",
            "MXDOMAIN", "MXCLASSIFICATION", "MXITEM", "MXLOCATION",
        ]

    async def get_fields(self, object_structure: str) -> list[dict]:
        url = f"{self.base_url}/oslc/os/{object_structure}"
        params = {"oslc.pageSize": 1, "lean": 1}
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            members = data.get("member", [])
            if members:
                return [{"name": k, "type": type(v).__name__} for k, v in members[0].items()
                        if not k.startswith("_") and not k.startswith("rdf") and not k.startswith("spi")]
            return []

    async def extract(
        self,
        object_structure: str,
        fields: Optional[list[str]] = None,
        where_clause: Optional[str] = None,
        order_by: Optional[str] = None,
        page_size: int = 500,
        on_progress=None,
    ) -> list[dict]:
        url = f"{self.base_url}/oslc/os/{object_structure}"
        params: dict = {"lean": 1, "oslc.pageSize": page_size}
        if fields:
            params["oslc.select"] = ",".join(fields)
        if where_clause:
            params["oslc.where"] = where_clause
        if order_by:
            params["oslc.orderBy"] = order_by

        all_records = []
        page = 1

        async with httpx.AsyncClient(verify=False, timeout=120) as client:
            while True:
                params["pageno"] = page
                resp = await client.get(url, headers=self.headers, params=params)
                resp.raise_for_status()
                data = resp.json()
                members = data.get("member", [])
                if not members:
                    break

                # Clean up records - remove OSLC metadata fields
                cleaned = []
                for rec in members:
                    clean_rec = {k: v for k, v in rec.items()
                                 if not k.startswith("rdf") and not k.startswith("spi")
                                 and not k.startswith("_") and k != "href"}
                    cleaned.append(clean_rec)

                all_records.extend(cleaned)

                if on_progress:
                    await on_progress(len(all_records))

                # Check if more pages
                next_page = data.get("responseInfo", {}).get("nextPage")
                if not next_page or len(members) < page_size:
                    break
                page += 1

        return all_records

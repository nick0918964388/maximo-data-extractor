import httpx
import json
import base64
import re
from datetime import datetime, timedelta
from typing import Optional


def resolve_date_variables(text: str) -> str:
    """Replace date variables like ${TODAY}, ${YESTERDAY} in where clause."""
    if not text or "${" not in text:
        return text

    from datetime import timezone
    now = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    variables = {
        "${NOW}": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "${TODAY}": today.strftime("%Y-%m-%dT%H:%M:%S"),
        "${YESTERDAY}": (today - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S"),
        "${TOMORROW}": (today + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S"),
        "${THIS_MONTH}": today.replace(day=1).strftime("%Y-%m-%dT%H:%M:%S"),
        "${LAST_MONTH}": (today.replace(day=1) - timedelta(days=1)).replace(day=1).strftime("%Y-%m-%dT%H:%M:%S"),
        "${THIS_YEAR}": today.replace(month=1, day=1).strftime("%Y-%m-%dT%H:%M:%S"),
        "${DAYS_AGO_7}": (today - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S"),
        "${DAYS_AGO_30}": (today - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S"),
    }

    result = text
    for var, value in variables.items():
        result = result.replace(var, value)
    return result

def _build_oslc_select(fields: list[str], child_fields: dict = None) -> str:
    """Build oslc.select string with nested child field syntax.

    Example: fields=["wonum","doclinks"], child_fields={"doclinks":["urlname","document"]}
    Result: "wonum,doclinks{urlname,document}"
    """
    if not fields:
        return ""
    child_fields = child_fields or {}
    parts = []
    for f in fields:
        if f in child_fields and child_fields[f]:
            parts.append(f"{f}{{{','.join(child_fields[f])}}}")
        else:
            parts.append(f)
    # Add child selections not in main fields list
    for child_name, sub_fields in child_fields.items():
        if child_name not in fields and sub_fields:
            parts.append(f"{child_name}{{{','.join(sub_fields)}}}")
    return ",".join(parts)


class MaximoClient:
    def __init__(self, base_url: str, api_key: str = None, auth_type: str = "apikey",
                 username: str = None, password: str = None, original_host: str = None):
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.headers = {"Accept": "application/json"}

        # Set Host header for SSH tunnel / reverse proxy scenarios
        if original_host:
            self.headers["Host"] = original_host

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
        FALLBACK = [
            "MXWO", "MXASSET", "MXINVENTORY", "MXPERSON", "MXSR",
            "MXPO", "MXPR", "MXINVUSE", "MXLABOR", "MXLOCSYS",
            "MXDOMAIN", "MXCLASSIFICATION", "MXITEM", "MXLOCATION",
        ]
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            try:
                url = f"{self.base_url}/oslc/os/MXINTOBJECT"
                params = {
                    "oslc.select": "intobjectname",
                    "lean": 1,
                    "oslc.pageSize": 500,
                }
                resp = await client.get(url, headers=self.headers, params=params)
                resp.raise_for_status()
                data = resp.json()
                members = data.get("member", [])
                names = sorted(set(
                    m["intobjectname"] for m in members if "intobjectname" in m
                ))
                return names if names else FALLBACK
            except Exception:
                return FALLBACK

    def _parse_fields_from_dict(self, data: dict) -> list[dict]:
        """Extract field list from a Maximo resource dict, filtering out OSLC metadata."""
        skip_prefixes = ("_", "rdf", "spi", "oslc", "dcterms", "rel.")
        skip_names = {"href", "localref"}
        skip_suffixes = ("_collectionref",)

        fields = []
        for k, v in data.items():
            if k in skip_names:
                continue
            if any(k.startswith(p) for p in skip_prefixes):
                continue
            if any(k.endswith(s) for s in skip_suffixes):
                continue
            if isinstance(v, (list, dict)):
                field_type = "list" if isinstance(v, list) else "object"
            else:
                field_type = type(v).__name__ if v is not None else "str"
            fields.append({"name": k, "type": field_type, "title": ""})

        fields.sort(key=lambda f: f["name"].lower())
        return fields

    def _parse_fields_from_schema(self, schema: dict) -> list[dict]:
        """Extract field list from a JSON Schema properties dict."""
        skip_prefixes = ("_", "rdf", "spi", "oslc", "dcterms", "rel.")
        skip_names = {"href", "localref"}
        skip_suffixes = ("_collectionref",)

        fields = []
        for k, prop in schema.get("properties", {}).items():
            if k in skip_names:
                continue
            if any(k.startswith(p) for p in skip_prefixes):
                continue
            if any(k.endswith(s) for s in skip_suffixes):
                continue
            json_type = prop.get("type", "string")
            if json_type == "array":
                field_type = "list"
            elif json_type == "object":
                field_type = "object"
            elif json_type == "number":
                field_type = "float"
            elif json_type == "integer":
                field_type = "int"
            elif json_type == "boolean":
                field_type = "bool"
            else:
                field_type = "str"
            raw_title = prop.get("title", "") or prop.get("description", "")
            title = "" if raw_title == "~null~" else raw_title
            fields.append({"name": k, "type": field_type, "title": title})

        fields.sort(key=lambda f: f["name"].lower())
        return fields

    async def get_fields(self, object_structure: str, lang: str = None) -> list[dict]:
        os_lower = object_structure.lower()

        # Add language header for localized field titles
        headers = dict(self.headers)
        if lang:
            headers["Accept-Language"] = lang

        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            # Method 1: JSON Schema endpoint (most reliable, returns all fields)
            schema_url = f"{self.base_url}/oslc/jsonschemas/{os_lower}"
            params = {}
            if lang:
                params["_lid"] = lang
            try:
                resp = await client.get(schema_url, headers=headers, params=params)
                if resp.status_code == 200:
                    schema = resp.json()
                    fields = self._parse_fields_from_schema(schema)
                    if fields:
                        return fields
            except Exception:
                pass

            # Method 2: Fetch individual resource detail via href
            list_url = f"{self.base_url}/oslc/os/{object_structure}"
            resp = await client.get(list_url, headers=headers, params={"lean": 1, "oslc.pageSize": 1})
            resp.raise_for_status()
            data = resp.json()

            members = data.get("member", [])
            if not members or "href" not in members[0]:
                return []

            original_href = members[0]["href"]
            path_match = re.search(r"/oslc/(.+)", original_href)
            if not path_match:
                return []
            resource_url = f"{self.base_url}/oslc/{path_match.group(1)}"

            try:
                resp2 = await client.get(resource_url, headers=headers, params={"lean": 1})
                if resp2.status_code == 200:
                    detail = resp2.json()
                    fields = self._parse_fields_from_dict(detail)
                    if fields:
                        return fields
            except Exception:
                pass

            return []

    async def get_child_fields(self, object_structure: str, child_name: str, lang: str = None) -> list[dict]:
        """Get sub-fields for a nested/child object from JSON Schema, with fallback to real data."""
        os_lower = object_structure.lower()
        headers = dict(self.headers)
        if lang:
            headers["Accept-Language"] = lang

        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            # Method 1: JSON Schema endpoint
            schema_url = f"{self.base_url}/oslc/jsonschemas/{os_lower}"
            params = {"_lid": lang} if lang else {}
            try:
                resp = await client.get(schema_url, headers=headers, params=params)
                if resp.status_code == 200:
                    schema = resp.json()
                    prop = schema.get("properties", {}).get(child_name, {})
                    items = prop.get("items", {})
                    if items:
                        fields = self._parse_fields_from_schema(items)
                        if fields:
                            return fields

                    # items may use $ref to a sub-schema instead of inline properties
                    # Try the sub-schema endpoint directly
                    sub_schema_url = f"{self.base_url}/oslc/jsonschemas/{os_lower}/{child_name}"
                    resp2 = await client.get(sub_schema_url, headers=headers, params=params)
                    if resp2.status_code == 200:
                        sub_schema = resp2.json()
                        fields = self._parse_fields_from_schema(sub_schema)
                        if fields:
                            return fields
            except Exception:
                pass

            # Method 2: Fallback - fetch 1 record with oslc.select to get child data
            try:
                list_url = f"{self.base_url}/oslc/os/{object_structure}"
                list_params = {"lean": 1, "oslc.pageSize": 1, "oslc.select": f"{child_name}"}
                resp = await client.get(list_url, headers=headers, params=list_params)
                resp.raise_for_status()
                data = resp.json()
                members = data.get("member", [])

                for member in members:
                    child_data = member.get(child_name, [])
                    if isinstance(child_data, list) and child_data:
                        return self._parse_fields_from_dict(child_data[0])
                return []
            except Exception as e:
                raise Exception(f"Cannot connect to Maximo: {repr(e)}")

    async def extract(
        self,
        object_structure: str,
        fields: Optional[list[str]] = None,
        child_fields: Optional[dict] = None,
        where_clause: Optional[str] = None,
        order_by: Optional[str] = None,
        page_size: int = 500,
        on_progress=None,
        is_cancelled=None,
    ) -> list[dict]:
        url = f"{self.base_url}/oslc/os/{object_structure}"
        params: dict = {"lean": 1, "oslc.pageSize": page_size}
        if fields:
            params["oslc.select"] = _build_oslc_select(fields, child_fields)
        elif child_fields:
            # No main field filter but has child field filter - build select for children only
            child_parts = []
            for child_name, sub_fields in child_fields.items():
                if sub_fields:
                    child_parts.append(f"{child_name}{{{','.join(sub_fields)}}}")
            if child_parts:
                params["oslc.select"] = "*," + ",".join(child_parts)
        if where_clause:
            params["oslc.where"] = resolve_date_variables(where_clause)
        if order_by:
            params["oslc.orderBy"] = order_by

        all_records = []
        page = 1

        current_page_size = page_size

        async with httpx.AsyncClient(verify=False, timeout=120) as client:
            while True:
                # Check cancellation before each page
                if is_cancelled and is_cancelled():
                    break

                params["pageno"] = page
                params["oslc.pageSize"] = current_page_size

                try:
                    resp = await client.get(url, headers=self.headers, params=params)
                    resp.raise_for_status()
                    data = resp.json()
                except json.JSONDecodeError:
                    # JSON parse error — reduce page size and retry
                    if current_page_size > 50:
                        new_size = max(50, current_page_size // 2)
                        if on_progress:
                            await on_progress(
                                len(all_records), page=page,
                                message=f"JSON 解析失敗，降低每頁筆數 {current_page_size} → {new_size} 重試"
                            )
                        current_page_size = new_size
                        continue
                    else:
                        raise ValueError(f"第 {page} 頁 JSON 解析失敗，即使降低至 {current_page_size} 筆仍無法解析")

                members = data.get("member", [])
                if not members:
                    break

                # Clean up records - remove OSLC metadata fields
                cleaned = []
                for rec in members:
                    clean_rec = {k: v for k, v in rec.items()
                                 if not k.startswith("rdf") and not k.startswith("spi")
                                 and not k.startswith("_") and k != "href"
                                 and not k.endswith("_collectionref")}
                    cleaned.append(clean_rec)

                all_records.extend(cleaned)

                if on_progress:
                    await on_progress(len(all_records), page=page)

                # Check if more pages
                next_page = data.get("responseInfo", {}).get("nextPage")
                if not next_page or len(members) < current_page_size:
                    break
                page += 1

        return all_records

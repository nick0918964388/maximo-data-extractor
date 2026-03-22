import httpx, json, asyncio, aiosqlite

async def check():
    async with aiosqlite.connect("/app/data/maximo.db") as db:
        cursor = await db.execute("SELECT base_url, api_key FROM connections WHERE is_active=1 LIMIT 1")
        row = await cursor.fetchone()
        if not row:
            print("No connection")
            return
        base_url, api_key = row
    headers = {"Accept": "application/json"}
    if api_key:
        headers["apikey"] = api_key
    async with httpx.AsyncClient(verify=False, timeout=30) as client:
        resp = await client.get(base_url.rstrip("/") + "/oslc/jsonschemas/mxasset", headers=headers)
        if resp.status_code == 200:
            schema = resp.json()
            props = schema.get("properties", {})
            for i, (k, v) in enumerate(list(props.items())[:8]):
                print(k + ": " + json.dumps(v, ensure_ascii=False))
        else:
            print("Status: " + str(resp.status_code))

asyncio.run(check())

import sqlite3
conn=sqlite3.connect('/app/data/maximo.db')
c=conn.cursor()
c.execute('SELECT id, name, base_url, tenant_id, is_active FROM connections')
for r in c.fetchall():
    print(r)
conn.close()

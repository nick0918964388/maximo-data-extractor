import sqlite3
conn=sqlite3.connect('/app/data/maximo.db')
c=conn.cursor()
c.execute('PRAGMA table_info(connections)')
for r in c.fetchall():
    print(r)
conn.close()

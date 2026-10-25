import sqlite3,re,pathlib
c=sqlite3.connect(':memory:')
for migration in sorted(pathlib.Path('drizzle').glob('*.sql')):c.executescript(migration.read_text())
c.execute("INSERT INTO sessions(id,owner,date,start,end,court,booked) VALUES ('s','owner','2026-10-13','19:45','21:00','1','Test')")
src=pathlib.Path('app/api/board/route.ts').read_text();q=re.search(r'db.prepare\(`(INSERT INTO players\(session,user,name,status,joined,manual,name_key\).+?)`\)',src,re.S).group(1)
def join(user,status):
 return c.execute(q,('s',user,user,status,'now',user)).rowcount
assert join('a','confirmed')==1
assert join('b','confirmed')==1
assert join('c','tentative')==1
assert join('d','confirmed')==1
assert join('e','confirmed')==0,'capacity overflow'
assert join('e','standby')==1
assert join('e','tentative')==0,'standby bypasses capacity'
assert join('c','confirmed')==1,'own tentative can confirm at capacity'
assert c.execute("SELECT COUNT(*) FROM players WHERE status!='standby'").fetchone()[0]==4
c.execute("DELETE FROM players WHERE user='a'")
assert join('e','confirmed')==1,'standby can claim vacant slot'
assert join('e','confirmed')==1
assert c.execute("SELECT COUNT(*) FROM players WHERE user='e'").fetchone()[0]==1
c.execute("UPDATE sessions SET cancelled=1")
assert join('f','standby')==0,'cancelled sessions cannot be joined'
print('PASS: capacity, tentative, standby, promotion, duplicate signup, cancellation')

"""Exercise exact production SQL with genuine concurrent isolated SQLite writers."""
import pathlib,re,sqlite3,tempfile,threading,concurrent.futures,uuid
source=pathlib.Path('lib/name-claims.ts').read_text();route=pathlib.Path('app/api/board/route.ts').read_text()
reserve=re.search(r'export const reserveNameSQL=`(.+?)`;',source,re.S).group(1)
bind=re.search(r'export const bindNameSQL=`(.+?)`;',source,re.S).group(1)
queries=re.findall(r'db.prepare\(`(.+?)`\)',route,re.S)
manual=next(q for q in queries if q.startswith('INSERT INTO players(session,user,name,status,joined,manual,name_key,roster_key)'))
join=next(q for q in queries if q.startswith('INSERT INTO players(session,user,name,status,joined,manual,name_key)'))
with tempfile.TemporaryDirectory(prefix='rally-name-') as directory:
 path=pathlib.Path(directory)/'isolated.sqlite';db=sqlite3.connect(path,isolation_level=None)
 for migration in sorted(pathlib.Path('drizzle').glob('*.sql')):db.executescript(migration.read_text())
 def session(s):db.execute("INSERT INTO sessions(id,owner,date,start,end,court,booked) VALUES (?,'organizer','2099-10-19','19:00','20:00','1','Test')",(s,))
 def fixture(s,key):session(s);db.execute("INSERT INTO players(session,user,name,status,joined,manual,name_key) VALUES (?,'manual',?,'tentative','same time',1,?)",(s,key,key))
 def claim(c,key,user):
  token=str(uuid.uuid4());c.execute('BEGIN IMMEDIATE')
  try:
   n=c.execute(reserve,(key,user,key,'now',token)).rowcount;c.execute(bind,(key,user,token));c.execute('COMMIT');return n
  except: c.execute('ROLLBACK');raise
 def race(ops):
  barrier=threading.Barrier(len(ops))
  def run(op):
   c=sqlite3.connect(path,isolation_level=None,timeout=15)
   try:barrier.wait();return op(c)
   finally:c.close()
  with concurrent.futures.ThreadPoolExecutor(max_workers=len(ops)) as pool:return list(pool.map(run,ops))
 for i in range(30):
  key=f'race-{i}';fixture(key+'a',key);fixture(key+'b',key)
  assert sorted(race([lambda c:claim(c,key,key+'owner-a'),lambda c:claim(c,key,key+'owner-b')]))==[0,1]
  assert db.execute('SELECT COUNT(DISTINCT user),SUM(manual) FROM players WHERE name_key=?',(key,)).fetchone()==(1,0)
  a,b=f'double-a-{i}',f'double-b-{i}';fixture(a,a);fixture(b,b)
  assert sorted(race([lambda c:claim(c,a,f'same-{i}'),lambda c:claim(c,b,f'same-{i}')]))==[0,1]
  key=f'future-{i}';fixture(key,key);future=key+'-future';session(future)
  race([lambda c:claim(c,key,key+'owner'),lambda c:c.execute(manual,(future,key,'manual-new',key,'standby','later')).rowcount])
  assert db.execute('SELECT COUNT(*),COUNT(DISTINCT user),SUM(manual) FROM players WHERE name_key=?',(key,)).fetchone()==(2,1,0)
  key=f'join-{i}';fixture(key,key);extra=key+'-extra';session(extra)
  wins=race([lambda c:claim(c,key,key+'owner'),lambda c:c.execute(join,(extra,key+'other',key,'standby','later',key)).rowcount]);assert sorted(wins)==[0,1]
  if wins[0]:assert db.execute('SELECT COUNT(*) FROM players WHERE name_key=? AND manual=0',(key,)).fetchone()[0]==1
 db.close()
print('PASS: 120 independent concurrent SQLite races; one global name winner, one name per account, future manual insert resolves claim atomically, foreign self-join and name claim cannot both succeed')

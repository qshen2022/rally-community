import assert from 'node:assert/strict';
import {harness} from './route-harness.mjs';
import {normalizeName} from '../lib/names.ts';
const h=harness(),{sqlite}=h;
async function post(id,body,expected=200,origin){const r=await h.request(id,body,origin);assert.equal(r.status,expected,JSON.stringify({id,body,...r}));return r.data}
const claim=name=>({action:'claimName',name});
function session(id,overrides={}){const s={id,owner:'organizer',date:'2099-10-19',start:'19:00',end:'20:00',court:'1',venue:'Test court',booked:'Taylor',capacity:4,notes:'Keep all notes',cancelled:0,demo:0,...overrides};sqlite.prepare('INSERT INTO sessions(id,owner,date,start,end,court,venue,booked,capacity,notes,cancelled,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(s));return s}
function player(session,user,name,status='confirmed',manual=1){sqlite.prepare('INSERT INTO players(session,user,name,status,joined,manual) VALUES (?,?,?,?,?,?)').run(session,user,name,status,'2026-10-19T17:00:00Z',manual)}
const rows=s=>sqlite.prepare('SELECT * FROM players WHERE session=? ORDER BY joined,COALESCE(roster_key,user)').all(s);
const reservations=()=>sqlite.prepare('SELECT * FROM name_claims ORDER BY key').all();
const snapshot=()=>({players:sqlite.prepare('SELECT session,user,name,status,joined,manual,roster_key FROM players ORDER BY session,user').all(),claims:reservations()});
assert.equal(normalizeName('  LEE\t  EXAMPLE \n'),'lee example');assert.notEqual(normalizeName('Owner'),normalizeName('Board Owner'));assert.notEqual(normalizeName('José'),normalizeName('Jose'));
session('s');for(const [id,name,status] of [['b','Taylor','confirmed'],['a','Alex','confirmed'],['c','Casey','tentative'],['d','Drew','confirmed'],['e','Eli','standby']])player('s','manual-'+id,name,status);
session('past',{date:'2020-10-19'});player('past','manual-b',' TAYLOR ','tentative');
session('cancelled',{cancelled:1});player('cancelled','manual-b','taylor','standby');
session('demo',{demo:1});player('demo','manual-b','Taylor');
session('near');player('near','manual-b','Tayler');
const before=rows('s'),sessionsBefore=sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
await post(null,claim('Taylor'),401);await post('taylor',claim('Taylor'),403,'https://evil.example');
for(const name of ['',null,{},'a'.repeat(51)])await post('taylor',claim(name),400);
await post('taylor',{action:'claim',id:'s',player:'manual-b'},400);
await post('taylor',claim('Not listed'),409);assert.equal(reservations().length,0);
await post('taylor',{...claim('Taylor'),user:'forged',status:'standby',owner:'taylor'});
for(const id of ['s','past','cancelled']){const p=rows(id).find(p=>normalizeName(p.name)==='taylor');assert.equal(p.user,'taylor');assert.equal(p.manual,0);assert.equal(p.roster_key,'manual-b')}
assert.equal(rows('past')[0].status,'tentative');assert.equal(rows('cancelled')[0].status,'standby');
assert.equal(rows('demo')[0].manual,1);assert.equal(rows('near')[0].manual,1);
assert.deepEqual(rows('s').map(p=>p.name),before.map(p=>p.name),'tie order preserved');
assert.deepEqual(rows('s').map(({name_key,...p})=>({...p,user:p.roster_key||p.user,manual:p.roster_key?1:p.manual,roster_key:null})),before.map(({name_key,...p})=>p));
assert.deepEqual(sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),sessionsBefore);
await post('attacker',claim('Taylor'),409);await post('taylor',claim('Taylor'),409);await post('taylor',claim('Casey'),409);
const board=await h.get('taylor');assert.equal(board.claims[0].mine,true);assert.equal(board.sessions.find(s=>s.id==='s').canManage,false);assert.equal((await h.get('attacker')).claims[0].mine,false);
for(const action of ['cancel','edit','remove','manual'])await post('taylor',{action,id:'s',player:'manual-a'},403);
await post('organizer',{action:'manual',id:'s',player:'taylor',name:'Changed',status:'standby'},409);await post('organizer',{action:'remove',id:'s',player:'taylor'},403);
await post('taylor',{action:'join',id:'s',name:'Taylor',status:'tentative'});await post('taylor',{action:'join',id:'s',name:'Taylor',status:'confirmed'});await post('taylor',{action:'leave',id:'s'});
assert.equal(reservations()[0].user,'taylor');await post('attacker',claim('Taylor'),409);await post('attacker',{action:'join',id:'s',name:' TAYLOR ',status:'standby'},409);
// Future manual additions and renames bind inside their writes, including exact whitespace/case normalization.
session('future');await post('organizer',{action:'manual',id:'future',name:'  TaYlOr  ',status:'tentative'});assert.equal(rows('future')[0].user,'taylor');assert.equal(rows('future')[0].manual,0);
let preserved=snapshot();await post('organizer',{action:'manual',id:'future',name:'Taylor',status:'standby'},409);assert.deepEqual(snapshot(),preserved);
session('rename');player('rename','manual-other','Someone');await post('organizer',{action:'manual',id:'rename',player:'manual-other',name:'Taylor',status:'standby'});assert.equal(rows('rename')[0].user,'taylor');assert.equal(rows('rename')[0].roster_key,'manual-other');
player('future','manual-other','Someone');preserved=snapshot();await post('organizer',{action:'manual',id:'future',player:'manual-other',name:'Taylor',status:'confirmed'},409);assert.deepEqual(snapshot(),preserved);
// Existing legacy claims never grant name-wide ownership without explicit consent.
session('legacy-a');player('legacy-a','legacy','Legacy','confirmed',0);session('legacy-b');player('legacy-b','manual',' legacy ');
await h.get('legacy');assert(!reservations().some(c=>c.key==='legacy'));await post('other',claim('Legacy'),409);await post('legacy',claim('Legacy'));assert.equal(rows('legacy-b')[0].user,'legacy');
// Conflicting account, repeated same name/session, or different existing account signup blocks everything.
for(const kind of ['foreign','duplicate','own-duplicate']){
 session(kind+'-a');player(kind+'-a','manual',kind);session(kind+'-b');player(kind+'-b','manual',kind);
 if(kind==='foreign')player(kind+'-b','foreign',kind,'standby',0);
 if(kind==='duplicate')player(kind+'-b','manual-2',kind,'standby',1);
 if(kind==='own-duplicate')player(kind+'-b','claimant-'+kind,'Different','standby',0);
 preserved=snapshot();await post('claimant-'+kind,claim(kind),409);assert.deepEqual(snapshot(),preserved);
}
// Reserve races are tested through the actual route, plus true independent DB writers in Python.
session('race-a');player('race-a','manual','Race');session('race-b');player('race-b','manual','Race');
const race=await Promise.all(['a','b'].map(id=>h.request(id,claim('Race'))));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(rows('race-a')[0].user,rows('race-b')[0].user);
session('double-a');player('double-a','manual','Double A');session('double-b');player('double-b','manual','Double B');
const double=await Promise.all(['Double A','Double B'].map(name=>h.request('same-user',claim(name))));assert.deepEqual(double.map(r=>r.status).sort(),[200,409]);
// Stale organizer edit cannot recreate a manual row after the global claim.
session('edit-race');player('edit-race','manual','Edit Race');let atWrite,release;const blocked=new Promise(r=>atWrite=r),resume=new Promise(r=>release=r);
h.setBeforeRun(async(sql,args)=>{if(sql.startsWith('UPDATE players SET name=')&&args[3]==='edit-race'){atWrite();await resume}});
const edit=post('organizer',{action:'manual',id:'edit-race',player:'manual',name:'Changed',status:'standby'},409);await blocked;await post('edit-owner',claim('Edit Race'));release();await edit;h.setBeforeRun(null);assert.equal(rows('edit-race')[0].name,'Edit Race');assert.equal(rows('edit-race')[0].status,'confirmed');
// Change a legacy NULL-key row between index read and write: no partial claim.
session('index-race');player('index-race','manual','Index Race');let mutated=false;
h.setBeforeBatch(async statements=>{if(!mutated&&statements.some(s=>s.sql.startsWith('UPDATE players SET name_key='))){mutated=true;sqlite.prepare("UPDATE players SET name='New name' WHERE session='index-race'").run()}});
await post('index-owner',claim('Index Race'),409);h.setBeforeBatch(null);assert.equal(rows('index-race')[0].manual,1);assert(!reservations().some(c=>c.key==='index race'));
// Anonymous users never see account IDs, reservation owners or internal keys.
const anonymous=await h.get(null);assert(!('claims'in anonymous));assert(anonymous.players.every(p=>!('user'in p)&&!('manual'in p)&&!('name_key'in p)&&!('roster_key'in p)));
console.log('PASS: actual name-wide route; auth/origin; old-client rejection; cross-session/past/cancelled binding; conservative normalization; future manual add/rename; name and account uniqueness; duplicate and ownership conflict rollback; status/order/notes/capacity preservation; legacy consent; reservation after leave; self-join protection; organizer restrictions; actual-route races; stale edit/index races; anonymous redaction');
sqlite.close();

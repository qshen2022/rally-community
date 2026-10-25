import assert from 'node:assert/strict';
import {harness} from './route-harness.mjs';
const h=harness(),{sqlite}=h;
const details={date:'2099-10-25',start:'19:00',end:'20:00',venue:'Test',capacity:2};
async function post(user,body,status=200){const r=await h.request(user,body);assert.equal(r.status,status,JSON.stringify(r));return r.data}
const {id}=await post('owner',{action:'create',...details});
const rows=()=>sqlite.prepare('SELECT * FROM players WHERE session=? ORDER BY joined,COALESCE(roster_key,user)').all(id);
await post(null,{action:'manual',id,name:'Guest',status:'confirmed'},401);
await post('alice',{action:'manual',id,name:'Guest',status:'confirmed',addedByName:'Alice'});
const guest=rows()[0];assert.equal(guest.added_by,'alice');assert.equal(guest.added_by_name,'Alice');
await post('bob',{action:'remove',id,player:guest.user,added_by:'bob'},403);
await post('bob',{action:'manual',id,player:guest.user,name:'Hijack',status:'confirmed'},403);
await post('bob',{action:'manual',id,name:'Guest',status:'confirmed'},409);
await post('bob',{action:'manual',id,name:'Second',status:'confirmed'});
await post('bob',{action:'manual',id,name:'Overflow',status:'confirmed'},409);
await post('q1',{action:'join',id,name:'Queue one',status:'standby'});
await post('q2',{action:'join',id,name:'Queue two',status:'standby'});
sqlite.prepare('UPDATE players SET joined=? WHERE user=?').run('2026-10-20T01:00:00Z','q1');
sqlite.prepare('UPDATE players SET joined=? WHERE user=?').run('2026-10-20T02:00:00Z','q2');
await post('alice',{action:'remove',id,player:guest.user});
assert.equal(rows().find(p=>p.user==='q1').status,'confirmed');assert.equal(rows().find(p=>p.user==='q2').status,'standby');
await post('owner',{action:'edit',id,...details,capacity:3});
assert.equal(rows().find(p=>p.user==='q2').status,'confirmed');
assert.equal(rows().filter(p=>p.status!=='standby').length,3);
await post('q1',{action:'leave',id});await post('q2',{action:'leave',id});
await post('q3',{action:'join',id,name:'Immediate',status:'standby'});
assert.equal(rows().find(p=>p.user==='q3').status,'confirmed','if needed fills an already open slot');
// A claimed player's original adder retains removal rights after their row links.
await post('alice',{action:'manual',id,name:'Claimable',status:'confirmed',addedByName:'Alice'});
await post('claimant',{action:'claimName',name:'Claimable'});
assert.equal(rows().find(p=>p.user==='claimant').added_by,'alice');
await post('alice',{action:'remove',id,player:'claimant'});
// Existing queue reconciles multiple slots in stable order; public view shows attribution only.
sqlite.prepare("INSERT INTO players(session,user,name,status,joined) VALUES (?,'old1','Old one','standby','1'),(?,'old2','Old two','standby','2')").run(id,id);
await h.get(null);assert.equal(rows().filter(p=>p.status!=='standby').length,3);
const publicRows=(await h.get(null)).players;assert(publicRows.every(p=>!('added_by' in p)&&!('user' in p)));
await post('owner',{action:'cancel',id});await post('q4',{action:'join',id,name:'Cancelled',status:'standby'},400);
console.log('PASS: any signed-in player adds to vacancies; attribution; no duplicates/overflow; adder-only removal including claimed players; FIFO promotion on removal, capacity expansion, existing vacancies; public privacy; cancelled signups blocked');

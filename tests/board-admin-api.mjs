import assert from 'node:assert/strict';
import {harness} from './route-harness.mjs';
const h=harness(),{sqlite}=h;
const admin={userId:'board-admin',email:'owner@example.test',fullName:'Board Owner'};
async function post(user,body,status=200){const r=await h.request(user,body);assert.equal(r.status,status,JSON.stringify({body,...r}));return r.data}
const session={date:'2099-10-25',start:'19:00',end:'20:00',venue:'Pine Lake',court:'1',booked:'Organizer',capacity:2,notes:'Original'};
const {id}=await post('organizer',{action:'create',...session});
await post('organizer',{action:'manual',id,name:'Taylor',status:'confirmed'});
await post('taylor',{action:'claimName',name:'Taylor'});
await post('sam',{action:'join',id,name:'Sam',status:'confirmed'});
const player=user=>sqlite.prepare('SELECT * FROM players WHERE session=? AND user=?').get(id,user);
const claim=()=>sqlite.prepare("SELECT * FROM name_claims WHERE key='taylor'").get();
const originalClaim={...claim()},originalPlayer={...player('taylor')};
assert((await h.get(admin)).sessions.find(s=>s.id===id).canManage);
assert(!(await h.get('outsider')).sessions.find(s=>s.id===id).canManage);
assert.equal((await h.get('organizer')).admin,undefined);
for(const user of ['organizer','outsider',{userId:'forged',email:'forged@example.test',fullName:'Board Owner'}]){
 await post(user,{action:'manual',id,player:'taylor',name:'Taylor',status:'standby',admin:true},user==='organizer'?409:403);
 if(user!=='organizer')await post(user,{action:'remove',id,player:'taylor',admin:true},403);
}
await post(null,{action:'remove',id,player:'taylor'},401);
await post(admin,{action:'manual',id,player:'taylor',name:'Taylor',status:'standby'});
assert.equal(player('taylor').status,'confirmed');assert.equal(player('taylor').manual,0);
assert.equal(player('taylor').joined,originalPlayer.joined);assert.deepEqual({...claim()},originalClaim);
await post(admin,{action:'manual',id,name:'Guest',status:'confirmed'},409);
// Capacity limits still apply to admin attendance edits.
await post(admin,{action:'manual',id,name:'Overflow',status:'confirmed'},409);
await post(admin,{action:'edit',id,...session,capacity:4,notes:'Admin updated'});
assert.equal(sqlite.prepare('SELECT owner FROM sessions WHERE id=?').get(id).owner,'organizer');
await post(admin,{action:'manual',id,player:'taylor',name:'Taylor',status:'confirmed'});
// Account binding is preserved, and another reserved name cannot be taken.
await post(admin,{action:'manual',id,player:'sam',name:'Taylor',status:'tentative'},409);
assert.equal(player('sam').name,'Sam');
await post(admin,{action:'cancel',id});assert.equal(sqlite.prepare('SELECT cancelled FROM sessions WHERE id=?').get(id).cancelled,1);
await post(admin,{action:'cancel',id});
await post(admin,{action:'remove',id,player:'taylor'});assert.equal(player('taylor'),undefined);assert.deepEqual({...claim()},originalClaim);
// Admin can re-add a claimed player on their behalf, preserving their account link.
await post(admin,{action:'manual',id,name:'Taylor',status:'tentative'});assert.equal(player('taylor').manual,0);
assert.equal(player('taylor').status,'tentative');assert.deepEqual({...claim()},originalClaim);
await post(admin,{action:'remove',id,player:'sam'});assert.equal(player('sam'),undefined);
console.log('PASS: verified board admin manages all sessions and signed/claimed signups; ordinary users/organizers cannot forge admin; capacity, original organizer and account/name bindings preserved');

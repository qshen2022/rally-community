import assert from 'node:assert/strict';
import {harness} from './route-harness.mjs';
const h=harness(),{sqlite}=h;
const owner={userId:'verified-owner',email:'owner@example.test',fullName:'Board Owner'};
async function post(id,body,status=200){const r=await h.request(id,body);assert.equal(r.status,status,JSON.stringify({body,...r}));return r.data}
function session(id){sqlite.prepare("INSERT INTO sessions(id,owner,date,start,end,court,booked,notes) VALUES (?,'organizer','2099-10-19','19:00','20:00','1','Taylor','Preserve')").run(id)}
function player(s,u,n,manual=1){sqlite.prepare("INSERT INTO players(session,user,name,status,joined,manual) VALUES (?,?,?,'tentative','same time',?)").run(s,u,n,manual)}
const rows=()=>sqlite.prepare('SELECT session,user,name,status,joined,manual,roster_key FROM players ORDER BY session,joined,COALESCE(roster_key,user)').all();
const binding=key=>sqlite.prepare('SELECT * FROM name_claims WHERE key=?').get(key);
const override=(key,mode,target)=>{const c=binding(key);return {action:'overrideName',key,expectedUser:c.user,expectedRevision:c.revision,mode,target,confirm:true}};
for(const s of ['one','two','target','renamed'])session(s);
player('one','manual-b','Permanent');player('two','manual-c',' Permanent ');player('target','destination','Destination',0);
await post('person',{action:'claimName',name:'Permanent'});
const original=rows(),stale=override('permanent','transfer','destination');
for(const u of [null,'person','organizer',{userId:'imposter',email:'imposter@example.test',fullName:'Board Owner'}])await post(u,{...stale,owner:true,email:owner.email,user:owner.userId},u?403:401);
assert.equal((await h.get('organizer')).admin,undefined);assert((await h.get(owner)).admin.claims.some(c=>c.key==='permanent'));await post(owner,{...stale,confirm:false},400);
await post(owner,{...stale,target:'not-a-known-account'},409);assert.deepEqual(rows(),original);assert.equal(binding('permanent').user,'person');
await post(owner,stale);assert.equal(binding('permanent').user,'destination');assert(rows().filter(p=>p.name.trim()==='Permanent').every(p=>p.user==='destination'));assert(rows().filter(p=>p.name.trim()==='Permanent').every(p=>p.status==='tentative'));
await post(owner,stale,409);await post('person',{action:'claimName',name:'Permanent'},409);
// Former account gets no continuing claim rights; target gets only player rights.
await post('destination',{action:'cancel',id:'one'},403);await post('destination',{action:'join',id:'one',name:'My new display name',status:'standby'});assert.equal(binding('permanent').user,'destination');
await post('person',{action:'join',id:'renamed',name:'Permanent',status:'standby'},409);
// Unbind releases only current matching-name records, with fresh manual IDs.
const beforeUnbind=rows(),unbind=override('permanent','unbind');await post(owner,unbind);assert.equal(binding('permanent'),undefined);
const released=rows().find(p=>p.session==='two');assert.equal(released.manual,1);assert(released.user.startsWith('manual-'));assert.notEqual(released.user,'destination');assert.equal(released.roster_key,'manual-c');assert.equal(released.status,'tentative');assert.equal(released.name,' Permanent ');
assert.deepEqual(rows().find(p=>p.session==='one'),beforeUnbind.find(p=>p.session==='one'),'different display name stays with previous account');
await post('destination',{action:'leave',id:'two'});assert(rows().some(p=>p.session==='two'),'old account cannot remove released manual record');
await post('new-person',{action:'claimName',name:'Permanent'});assert.equal(binding('permanent').user,'new-person');await post(owner,unbind,409);
// Duplicate destination/signup and target reservation both fail with no changes.
session('conflict');player('conflict','manual','Conflict');player('conflict','destination','Other',0);await post('conflict-owner',{action:'claimName',name:'Conflict'});
let before=rows(),claimBefore={...binding('conflict')};await post(owner,override('conflict','transfer','destination'),409);assert.deepEqual(rows(),before);assert.deepEqual({...binding('conflict')},claimBefore);
await post(owner,override('conflict','transfer','new-person'),409);assert.deepEqual(rows(),before);
// An anomalous foreign-owned matching row cannot be hijacked or freed.
session('anomaly');player('anomaly','outsider','Conflict',0);before=rows();await post(owner,override('conflict','unbind'),409);assert.deepEqual(rows(),before);assert.deepEqual({...binding('conflict')},claimBefore);
// Name reservation outlives every signup, and owner can still release it safely.
session('empty');player('empty','manual','Empty');await post('empty-owner',{action:'claimName',name:'Empty'});await post('empty-owner',{action:'leave',id:'empty'});assert(binding('empty'));await post(owner,override('empty','unbind'));assert.equal(binding('empty'),undefined);
console.log('PASS: owner-only permanent binding controls; authenticated owner hash; organizer/imposter/claimant denial; exact confirmation; known destination; atomic transfer; stale CAS rejection; no privilege escalation; permanent reservation after rename/leave; fresh manual IDs on unbind; preserved differently named records; duplicate/foreign/reserved-target failure with no changes');
sqlite.close();

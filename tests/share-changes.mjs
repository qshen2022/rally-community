import assert from 'node:assert/strict';
import {actionChange,sharePlayers} from '../lib/share-changes.ts';
import {listingText,whatsappShareUrl} from '../lib/board.ts';
import {harness} from './route-harness.mjs';
const s={id:'s',date:'2026-10-25',start:'16:30',end:'18:00',venue:'Pine Lake',court:'2',booked:'Feifei',notes:'',capacity:4,cancelled:0};
const p={session:'s',user:'u',name:'Taylor',status:'tentative'};
const change=b=>actionChange(b,[s],[p],'u');
const rsvp=change({action:'join',id:'s',name:'Taylor',status:'confirmed'});
assert.deepEqual(rsvp.details,['Taylor: Tentative / TBC → Confirmed']);
assert.equal(change({action:'join',id:'s',name:'Taylor',status:'tentative'}),null);
assert.match(change({action:'join',id:'s',name:'Taylor',status:'standby'}).details[0],/standby/);
assert.deepEqual(change({action:'leave',id:'s'}).details,['Taylor left (Tentative / TBC)']);
assert.deepEqual(change({action:'remove',id:'s',player:'u'}).details,['Taylor removed (Tentative / TBC)']);
assert.deepEqual(change({action:'manual',id:'s',name:'Sam',status:'confirmed'}).details,['Sam added · Confirmed']);
assert.deepEqual(change({action:'manual',id:'s',player:'u',name:'Tayler',status:'standby'}).details,['Player: Taylor → Tayler','Tayler: Tentative / TBC → If needed / standby']);
assert.deepEqual(change({action:'edit',...s,start:'17:00',capacity:'8',notes:'Bring balls'}).details,['Start: 4:30pm → 5:00pm','Player limit: 4 → 8','Notes: (none) → Bring balls']);
assert.equal(change({action:'edit',...s,capacity:'4'}),null);
assert.equal(change({action:'claimName',name:'Taylor'}),null);
assert.equal(change({action:'overrideName'}),null);
const cancelled=change({action:'cancel',id:'s'});
assert.deepEqual(cancelled.details,['Session cancelled']);
assert.deepEqual(actionChange({action:'cancel',id:'s'},[{...s,cancelled:1}],[],'u').details,['Session restored']);
const created=actionChange({action:'create',...s},[],[],'u',{id:'new'});
assert.equal(created.session,'new');assert.deepEqual(created.details,['New session added']);
const listing=listingText([s],[p],'https://example.test',new Date('2026-10-20T00:00:00Z'));
const added=change({action:'manual',id:'s',name:'Sam',status:'confirmed'});
const current=[{...p,status:'confirmed'},{session:'s',user:'sam',name:'Sam',status:'confirmed'}];
let decorated=sharePlayers(current,[rsvp,added]);
assert.deepEqual(decorated.map(p=>p.name),['*Taylor*','*Sam*']);
const removed=change({action:'remove',id:'s',player:'u'});
decorated=sharePlayers([],[removed]);
assert.equal(decorated[0].name,'~Taylor~');assert.equal(decorated[0].removed,true);
const text=listingText([s],decorated,'https://example.test',new Date('2026-10-20T00:00:00Z'));
assert(text.includes('~Taylor~'));assert(text.includes('4 of 4 spots open'));assert(!text.includes('WHAT CHANGED'));
assert.equal(new URL(whatsappShareUrl(text)).searchParams.get('text'),text);
// Add then remove is a net no-op, even when a manual add acquired its ID on refresh.
const sam={session:'s',user:'sam',name:'Sam',status:'confirmed'};
const removeSam=actionChange({action:'remove',id:'s',player:'sam'},[s],[sam],'u');
assert.deepEqual(sharePlayers([],[added,removeSam]),[]);
// A removed then re-added player is unchanged; other visitors' additions stay plain.
const readd=actionChange({action:'join',id:'s',name:'Taylor',status:'tentative'},[s],[],'u');
assert.equal(sharePlayers([p],[removed,readd])[0].name,'Taylor');
assert.equal(sharePlayers([p,sam],[])[1].name,'Sam');
// Rename preserves the old name crossed out and highlights the new name.
const rename=change({action:'manual',id:'s',player:'u',name:'Tayler',status:'tentative'});
assert.deepEqual(sharePlayers([{...p,name:'Tayler'}],[rename]).map(p=>p.name),['*Tayler*','~Taylor~']);
// Standby removals remain visible but never take a spot.
const standby={...p,status:'standby'};
const leaveStandby=actionChange({action:'leave',id:'s'},[s],[standby],'u');
const standbyText=listingText([s],sharePlayers([],[leaveStandby]),'https://example.test',new Date('2026-10-20T00:00:00Z'));
assert(standbyText.includes('Waitlist: ~Taylor~'));assert(standbyText.includes('4 of 4 spots open'));
const other={...s,id:'other'};
const scoped=listingText([other],sharePlayers([],[removed]),'https://example.test',new Date('2026-10-20T00:00:00Z'));
assert(!scoped.includes('Taylor'));
// A successful create provides its exact session ID for per-session highlighting.
const h=harness();const result=await h.request('u',{action:'create',...s});
assert.equal(result.status,200);assert.equal(typeof result.data.id,'string');
assert(h.sqlite.prepare('SELECT id FROM sessions WHERE id=?').get(result.data.id));
console.log('PASS: RSVP/name/status/add/remove, session field diffs, no-op and claim exclusions, cancellation/restoration, inline bold/strikethrough, net no-ops, standby/capacity, scoped copy, create response ID');

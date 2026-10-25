import assert from 'node:assert/strict';
import {actionChange,changeShareText} from '../lib/share-changes.ts';
import {whatsappShareUrl} from '../lib/board.ts';
const now=new Date('2026-10-21T18:00:00Z'),url='https://rally.example/';
const s={id:'s',date:'2026-10-22',start:'18:30',end:'19:45',venue:'Example Club',court:'8',booked:'Morgan',notes:'Unnecessary long note',capacity:4,cancelled:0};
const y={session:'s',user:'y',name:'Riley',status:'confirmed'},a={session:'s',user:'a',name:'Morgan',status:'confirmed'};
const join=actionChange({action:'join',id:'s',name:'Riley',status:'confirmed'},[s],[a],'y');
const unrelated={...s,id:'other',venue:'Unrelated court'};
let text=changeShareText([s,unrelated],[a,y],[join],url,now);
assert(text.includes('*Riley* joined Thu, Oct 22 · 6:30pm · Example Club Court 8.'));
assert(text.includes('Morgan, *Riley* · 2 open slots'));
assert(text.includes('Unrelated court'));assert(!text.includes(s.notes));assert(!text.includes('Booked under'));
assert.equal(new URL(whatsappShareUrl(text)).searchParams.get('text'),text);
// Filling the final slot retains the action summary but hides the full roster.
text=changeShareText([{...s,capacity:2}],[a,y],[join],url,now);
assert(text.includes('Riley'));assert(!text.includes('Morgan'));assert(!text.includes('open slots'));assert(!text.includes('players'));
const leave=actionChange({action:'leave',id:'s'},[s],[a,y],'y');
text=changeShareText([s],[a],[leave],url,now);assert(text.includes('~Riley~ left'));assert(text.includes('3 open slots'));
text=changeShareText([s],[a],[join,leave],url,now);assert(!text.includes('Riley'));assert(text.includes('Example Club'));
const wait=actionChange({action:'join',id:'s',name:'Riley',status:'standby'},[s],[a],'y');
text=changeShareText([s],[a,{...y,status:'standby'}],[wait],url,now);assert(text.includes('joined the waitlist for'));assert(text.includes('3 open slots'));
text=changeShareText([s],[a],[],url,now);assert(text.includes('Example Club'));assert(text.includes(url));
text=changeShareText([{...s,date:'2026-10-20'}],[a,y],[join],url,now);assert(!text.includes('Riley'));
const cancel=actionChange({action:'cancel',id:'s'},[s],[a],'a');
text=changeShareText([{...s,cancelled:1}],[a],[cancel],url,now);assert(text.includes('Session cancelled'));assert(!text.includes('open slots'));
text=changeShareText([unrelated],[a,y],[join],url,now);assert(!text.includes('Riley'));
console.log('PASS: concise joined/left/waitlist/cancel updates, changed-session scope, hidden full rosters, open spots, net no-op, past sessions and WhatsApp URL round-trip');

// Unchanged open sessions appear too, with names on one line; full/past/cancelled sessions do not.
const otherPlayer={...a,session:'other',name:'Robin'};
text=changeShareText([s,unrelated,{...s,id:'full',venue:'Hidden full',capacity:1},{...s,id:'cancelled',venue:'Hidden cancelled',cancelled:1},{...s,id:'past',venue:'Hidden past',date:'2026-10-20'}],[a,y,otherPlayer,{...a,session:'full'}],[],url,now);
assert(text.includes('Robin · 3 open slots'));assert(text.includes('Morgan, Riley · 2 open slots'));
assert(!text.includes('Hidden full'));assert(!text.includes('Hidden cancelled'));assert(!text.includes('Hidden past'));
assert(!text.includes('joined'));assert.equal(text.split(url).length-1,1);
console.log('PASS: all open sessions included even without changes; names on one line; full/past/cancelled sessions omitted');

text=changeShareText([{...s,capacity:2}],[a],[],url,now);assert(text.includes('Morgan · 1 slot open'));

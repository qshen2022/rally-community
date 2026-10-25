import assert from 'node:assert/strict';
import {changeShareText} from '../lib/share-changes.ts';
import {whatsappShareUrl} from '../lib/board.ts';
const base={date:'2026-10-23',start:'21:00',end:'22:15',venue:'Example Club',court:'8',booked:'Morgan',notes:'',capacity:2,cancelled:0};
const sessions=[{...base,id:'full'},{...base,id:'open',start:'20:00',capacity:4},{...base,id:'ended',start:'17:00',end:'18:00'},{...base,id:'ongoing',start:'19:00',end:'20:00'},{...base,id:'cancelled',cancelled:1},{...base,id:'demo',demo:1},{...base,id:'tomorrow',date:'2026-10-24',venue:'Tomorrow court'}];
const players=[{session:'full',user:'a',name:'Morgan',status:'confirmed'},{session:'full',user:'b',name:'Robin',status:'tentative'},{session:'full',user:'c',name:'Riley',status:'standby'},{session:'open',user:'d',name:'Taylor',status:'confirmed'}];
const url='https://rally.example';
// UTC is already Oct 24, but Pacific time is still Oct 23 at 7:30pm.
let text=changeShareText(sessions,players,[],url,new Date('2026-10-24T02:30:00Z'));
assert(text.includes('Today’s upcoming sessions · Fri, Oct 23'));
assert(text.includes('9:00pm–10:15pm · Example Club Court 8\nMorgan, Robin (TBC)\nWaitlist: Riley'));
assert(text.includes('Taylor · 3 open slots'));assert(text.includes('Tomorrow court'));
assert(text.indexOf('8:00pm')<text.indexOf('9:00pm'));
const today=text.split('Open sessions')[0];
assert(!today.includes('7:00pm'));assert(!today.includes('5:00pm'));assert(!today.includes('Tomorrow court'));
assert.equal(text.split('Taylor').length-1,1,'Today’s open session is not duplicated below');
assert.equal(text.split('9:00pm–10:15pm · Example Club Court 8').length-1,1,'Cancelled and demo sessions excluded');
assert.equal(new URL(whatsappShareUrl(text)).searchParams.get('text'),text);
text=changeShareText([{...base,id:'full'}],players,[],url,new Date('2026-10-24T04:00:00Z'));
assert(!text.includes('Today’s upcoming'),'A session stops being upcoming exactly at its start');
text=changeShareText([{...base,id:'full'}],players,[],url,new Date('2026-10-24T07:00:00Z'));
assert(!text.includes('Today’s upcoming'),'Midnight Pacific advances the day');
// The same date boundary also works in winter with the UTC-8 offset.
text=changeShareText([{...base,id:'winter',date:'2026-12-12'}],[],[],url,new Date('2026-12-13T04:00:00Z'));
assert(text.includes('Today’s upcoming sessions · Sat, Dec 12'));
console.log('PASS: full and open today reminders, one-line player names, tentative/waitlist separation, no duplicate open listing, upcoming boundary, Pacific midnight and winter offset, WhatsApp URL round-trip');

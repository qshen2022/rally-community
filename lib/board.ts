export const DEFAULT_CAPACITY=4;
export function parseCapacity(value:unknown,fallback=DEFAULT_CAPACITY){
 if(value===undefined)return fallback;
 if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+$/.test(value.trim())))return null;
 const capacity=Number(value);return Number.isSafeInteger(capacity)&&capacity>0?capacity:null;
}
export function sessionCapacity(s:{capacity?:number}){return parseCapacity(s.capacity)??DEFAULT_CAPACITY}
export function openSpots(s:{capacity?:number},playing:number){return Math.max(0,sessionCapacity(s)-playing)}
export function pacificNow(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const get=(k:string)=>parts.find(p=>p.type===k)!.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function isPast(s:{date:string;end:string},now=new Date()){return `${s.date}T${s.end}`<=pacificNow(now)}
export function venueLabel(s:{venue:string;court:string}){return s.venue+(s.court?` · Court ${s.court}`:'')}
export function listingText(sessions:any[],players:any[],url:string,now=new Date()){
 const fmt=(t:string)=>{const[h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')}${h>=12?'pm':'am'}`};
 const current=sessions.filter(s=>!s.cancelled&&!isPast(s,now)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 return '🎾 TENNIS PRACTICE · PACIFIC TIME\n\n'+(current.map(s=>{
 const roster=players.filter(p=>p.session===s.id),inCourt=roster.filter(p=>!p.removed&&p.status!=='standby');
 const date=new Date(s.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
 return `${date} · ${fmt(s.start)}–${fmt(s.end)}\n${venueLabel(s)}${s.booked?'\nBooked under: '+s.booked:''}\n${inCourt.map((p,i)=>`${i+1}. ${p.name}${p.added_by_name?' (by '+p.added_by_name+')':''}${p.status==='tentative'?' (TBC)':''}`).join('\n')}${inCourt.length?'\n':''}${roster.filter(p=>p.removed&&p.status!=='standby').map(p=>p.name).join('\n')}${roster.some(p=>p.removed&&p.status!=='standby')?'\n':''}${openSpots(s,inCourt.length)} of ${sessionCapacity(s)} spots open${roster.some(p=>p.status==='standby')?'\nWaitlist: '+roster.filter(p=>p.status==='standby').map(p=>p.name+(p.added_by_name?' (by '+p.added_by_name+')':'')).join(', '):''}${s.notes?'\nNote: '+s.notes:''}`
 }).join('\n\n')||'No upcoming sessions.')+`\n\nCurrent board: ${url}\nView the board with this link. ChatGPT sign-in required to join.`;
}
// WhatsApp's documented no-recipient, prefilled-message click-to-chat URL.
export function whatsappShareUrl(text:string){return 'https://wa.me/?text='+encodeURIComponent(text)}

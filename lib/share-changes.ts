import {isPast,sessionCapacity,pacificNow} from './board.ts';
// Only successful actions from this page are recorded; board polling never adds changes.
type Session={id:string;date:string;start:string;end:string;venue:string;court:string;booked:string;notes:string;capacity:number;cancelled:number;demo?:number};
type Player={session:string;user?:string;name:string;status:string};
export type ShareChange={session:string;label:string;details:string[];player?:{before?:Player;after?:Player}};
const clean=(v:unknown)=>String(v??'').replace(/[\r\n]+/g,' ').replace(/[*~_`]/g,'').trim();
const status=(v:string)=>({confirmed:'Confirmed',tentative:'Tentative / TBC',standby:'If needed / standby'}[v]||v);
const time=(v:string)=>{const [h,m]=v.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')}${h>=12?'pm':'am'}`};
const date=(v:string)=>new Date(v+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
export function actionChange(body:any,sessions:Session[],players:Player[],uid:string,result:{id?:string}={}):ShareChange|null{
 const s=body.action==='create'?{...body,id:result.id}:sessions.find(s=>s.id===body.id);
 if(!s?.id)return null;
 const details:string[]=[];
 let player:ShareChange['player'];
 const p=players.find(p=>p.session===s.id&&p.user===(body.player||uid));
 if(body.action==='create')details.push('New session added');
 if(body.action==='cancel')details.push(s.cancelled?'Session restored':'Session cancelled');
 if(body.action==='remove'&&p)details.push(`${clean(p.name)} removed (${status(p.status)})`);
 if(body.action==='leave'&&p)details.push(`${clean(p.name)} left (${status(p.status)})`);
 if(body.action==='join'||body.action==='manual'){
  const nextName=clean(body.name);
  if(!p||(body.action==='manual'&&!body.player))details.push(`${nextName} added · ${status(body.status)}`);
  else{
   if(clean(p.name)!==nextName)details.push(`Player: ${clean(p.name)} → ${nextName}`);
   if(p.status!==body.status)details.push(`${nextName}: ${status(p.status)} → ${status(body.status)}`);
  }
 }
 if(body.action==='edit'){
  const fields:[string,string,(v:string)=>string][]=[['date','Date',date],['start','Start',time],['end','End',time],['venue','Venue',clean],['court','Court',clean],['booked','Booked under',clean],['capacity','Player limit',clean],['notes','Notes',clean]];
  for(const [key,label,format] of fields){const before=clean((s as any)[key]),after=clean(body[key]);if(before!==after)details.push(`${label}: ${before?format(before):'(none)'} → ${after?format(after):'(none)'}`)}
 }
 if(['remove','leave'].includes(body.action)&&p)player={before:{...p}};
 if(['join','manual'].includes(body.action)&&details.length){const previous=body.action==='manual'&&!body.player?undefined:p;player={before:previous?{...previous}:undefined,after:{session:s.id,user:body.action==='join'?uid:body.player,name:String(body.name).trim().slice(0,50),status:body.status}}}
 if(!details.length)return null;
 return {session:s.id,label:`${date(s.date)} · ${time(s.start)} · ${clean(s.venue)}${s.court?' · Court '+clean(s.court):''}`,details,player};
}
// Rewind only this visitor's successful actions to compare the original and current roster.
// This collapses add-then-remove and repeated edits without highlighting other visitors' edits.
function baselinePlayers(players:Player[],changes:ShareChange[]){
 const baseline=players.map(p=>({...p}));
 const same=(a:Player,b:Player)=>a.session===b.session&&(a.user&&b.user?a.user===b.user:a.name===b.name);
 for(const change of [...changes].reverse()){
  if(!change.player)continue;
  const {before,after}=change.player;
  if(after){const index=baseline.findIndex(p=>same(p,after));if(index>=0)baseline.splice(index,1)}
  if(before)baseline.push({...before});
 }
 return baseline;
}
const same=(a:Player,b:Player)=>a.session===b.session&&(a.user&&b.user?a.user===b.user:a.name===b.name);
export function sharePlayers(players:Player[],changes:ShareChange[]){
 const baseline=baselinePlayers(players,changes);
 const current=players.map(p=>{
  const original=baseline.find(b=>same(p,b));
  return {...p,name:!original||original.name!==p.name||original.status!==p.status?`*${clean(p.name)}*`:p.name};
 });
 const removed=baseline.filter(b=>!players.some(p=>same(p,b)&&p.name===b.name))
  .map(p=>({...p,name:`~${clean(p.name)}~`,removed:true}));
 return [...current,...removed];
}

// Only this visitor's net changes belong in an update. Full courts have a
// one-line action summary. All upcoming open courts get a compact roster below.
export function changeShareText(sessions:Session[],players:Player[],changes:ShareChange[],url:string,now=new Date()){
 const baseline=baselinePlayers(players,changes);
 const sections:string[]=[];
 const changedIds=new Set(changes.map(c=>c.session));
 for(const s of [...sessions].filter(s=>changedIds.has(s.id)&&!isPast({...s,end:s.end||s.start},now)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start))){
  const current=players.filter(p=>p.session===s.id),previous=baseline.filter(p=>p.session===s.id),lines:string[]=[];
  const label=`${date(s.date)} · ${time(s.start)} · ${clean(s.venue)}${s.court?' Court '+clean(s.court):''}`;
  for(const p of current){
   const old=previous.find(b=>same(b,p));
   if(old&&old.name===p.name&&old.status===p.status)continue;
   const name=`*${clean(p.name)}*`;
   const verb=p.status==='standby'?'joined the waitlist for':p.status==='tentative'?'is tentative for':old&&old.status==='tentative'?'confirmed for':'joined';
   lines.push(`${name} ${verb} ${label}.`);
  }
  for(const p of previous.filter(p=>!current.some(c=>same(p,c))))lines.push(`~${clean(p.name)}~ left ${p.status==='standby'?'the waitlist for ':''}${label}.`);
  const sessionChanges=changes.filter(c=>c.session===s.id&&!c.player);
  if(sessionChanges.length){
   const details=[...new Set(sessionChanges.flatMap(c=>c.details))];
   lines.push(`${label}: ${details.map(clean).join('; ')}.`);
  }
  if(!lines.length)continue;
  sections.push(lines.join('\n'));
 }
 const localNow=pacificNow(now),today=localNow.slice(0,10);
 const todaySessions=sessions.filter(s=>!s.cancelled&&!s.demo&&s.date===today&&s.date+'T'+s.start>localNow).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
 const reminderIds=new Set(todaySessions.map(s=>s.id));
 const reminders=todaySessions.map(s=>{
  const roster=sharePlayers(players.filter(p=>p.session===s.id),changes.filter(c=>c.session===s.id)).filter(p=>!(p as any).removed);
  const playing=roster.filter(p=>p.status!=='standby'),waiting=roster.filter(p=>p.status==='standby');
  const spots=Math.max(0,sessionCapacity(s)-playing.length);
  const names=playing.map(p=>p.name+(p.status==='tentative'?' (TBC)':'')).join(', ')||'No players yet';
  return `${time(s.start)}–${time(s.end)} · ${clean(s.venue)}${s.court?' Court '+clean(s.court):''}\n${names}${spots?' · '+(spots===1?'1 slot open':spots+' open slots'):''}${waiting.length?'\nWaitlist: '+waiting.map(p=>p.name).join(', '):''}`;
 });
 const openSessions:string[]=[];
 for(const s of [...sessions].filter(s=>!s.cancelled&&!s.demo&&!isPast({...s,end:s.end||s.start},now)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start))){
  const current=players.filter(p=>p.session===s.id),spots=Math.max(0,sessionCapacity(s)-current.filter(p=>p.status!=='standby').length);
  if(!spots||reminderIds.has(s.id))continue;
  const names=sharePlayers(current,changes.filter(c=>c.session===s.id)).filter(p=>!(p as any).removed&&p.status!=='standby').map(p=>p.name+(p.status==='tentative'?' (TBC)':''));
  openSessions.push(`${date(s.date)} · ${time(s.start)} · ${clean(s.venue)}${s.court?' Court '+clean(s.court):''}\n${names.length?names.join(', '):'No players yet'} · ${spots===1?'1 slot open':spots+' open slots'}`);
 }
 const parts=[...(reminders.length?["⏰ Today’s upcoming sessions · "+date(today)+'\n'+reminders.join('\n\n')]:[]),...sections];
 if(openSessions.length)parts.push('Open sessions\n'+openSessions.join('\n\n'));
 return parts.length?`🎾 Rally · Pacific time\n\n${parts.join('\n\n')}\n\n${url}`:`🎾 Rally\nView the board: ${url}`;
}

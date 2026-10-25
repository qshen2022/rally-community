import {promotionStatement,reconcileWaitlists} from '../../../lib/waitlist';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {canManage,isBoardOwner} from '../../../lib/organizer';
import {isPast,parseCapacity,sessionCapacity} from '../../../lib/board';
import {normalizeName} from '../../../lib/names';
import {claimName,overrideName} from '../../../lib/name-claims';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const u=await getChatGPTUser();const db=env.DB!;
 await reconcileWaitlists(db);
 const [s,p]=await Promise.all([db.prepare('SELECT * FROM sessions ORDER BY date,start').all(),db.prepare('SELECT * FROM players ORDER BY joined,COALESCE(roster_key,user)').all()]);
 if(!u){
  const visible:any[]=s.results.filter((row:any)=>!row.demo);
  const ids=new Set(visible.map(row=>row.id));
  return response({sessions:visible.map(({id,date,start,end,court,venue,booked,capacity,notes,cancelled})=>({id,date,start,end,court,venue,booked,capacity,notes,cancelled})),players:p.results.filter((row:any)=>ids.has(row.session)).map((row:any,i:number)=>({session:row.session,name:row.name,status:row.status,added_by_name:row.added_by_name,key:'public-player-'+i})),user:null});
 }
 const claims=await db.prepare('SELECT * FROM name_claims ORDER BY name').all<any>();
 const admin=await isBoardOwner(u)?{claims:claims.results,accounts:Array.from(new Set(p.results.filter((p:any)=>!p.manual&&s.results.some((s:any)=>s.id===p.session&&!s.demo)).map((p:any)=>p.user))).map(id=>({id,name:p.results.filter((p:any)=>p.user===id).map((p:any)=>p.name).filter((n,i,a)=>a.indexOf(n)===i).join(' / ')}))}:undefined;
 return response({admin,claims:claims.results.map(c=>({key:c.key,name:c.name,mine:c.user===u.userId})),sessions:await Promise.all(s.results.map(async (row:any)=>({...row,canManage:await canManage(row,u)}))),players:p.results,user:{id:u.userId,name:u.fullName||''}});
}
export async function POST(req:Request){
 const u=await getChatGPTUser();if(!u)return response({error:'Please sign in with ChatGPT.'},401);
 if(req.headers.get('origin')&&new URL(req.url).origin!==req.headers.get('origin'))return response({error:'Invalid origin.'},403);
 const db=env.DB!;let b:any;try{b=await req.json();}catch{return response({error:'Invalid request.'},400);}
 const fail=(s:string,n=400)=>response({error:s},n);const now=new Date().toISOString();
 if(b.action==='create'){
  const capacity=parseCapacity(b.capacity);if(capacity===null)return fail('Player limit must be a positive whole number.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end)||b.end<=b.start||!String(b.venue||'').trim())return fail('Add a date, venue and an end time after the start.');
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO sessions (id,owner,date,start,end,court,venue,booked,capacity,notes) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,u.userId,b.date,b.start,b.end,String(b.court||'').slice(0,40),String(b.venue).trim().slice(0,160),String(b.booked||'').slice(0,60),capacity,String(b.notes||'').slice(0,400)).run();return response({ok:true,id});
 }
 if(b.action==='demo'){
  const exists=await db.prepare("SELECT value FROM settings WHERE key='demo_loaded'").first();if(exists)return fail('The sample week has already been loaded. Create a new session instead.');
  const records=[['demo-sun','2026-10-11','16:30','18:00','1'],['demo-tue','2026-10-13','19:45','21:00','2'],['demo-thu','2026-10-15','19:45','21:00','3'],['demo-late','2026-10-15','21:00','22:15','4']];
  const statements=[db.prepare("INSERT INTO settings(key,value) VALUES ('demo_loaded',?)").bind(u.userId)];
  records.forEach((s,i)=>{statements.push(db.prepare('INSERT INTO sessions(id,owner,date,start,end,court,booked,capacity,notes,demo) VALUES (?,?,?,?,?,?,?,4,?,1)').bind(s[0],u.userId,s[1],s[2],s[3],s[4],'Sample organizer','Sample session only. No court booking has been made.'));if(i<3)['Alex','Jordan','Sam'].forEach((n,j)=>statements.push(db.prepare('INSERT INTO players(session,user,name,status,joined,manual) VALUES (?,?,?,?,?,1)').bind(s[0],'demo-'+j,n+' (sample)',i===2&&j===0?'tentative':'confirmed',now+j)));});
  statements.push(db.prepare('INSERT INTO players(session,user,name,status,joined,manual) VALUES (?,?,?,?,?,1)').bind('demo-sun','demo-standby','Casey (sample)','standby',now));
  try{await db.batch(statements);}catch{return fail('Sample week already loaded. Refresh to see it.',409);}return response({ok:true});
 }
 if(b.action==='clearDemo'){await db.batch([db.prepare('DELETE FROM players WHERE session IN (SELECT id FROM sessions WHERE demo=1 AND owner=?)').bind(u.userId),db.prepare('DELETE FROM sessions WHERE demo=1 AND owner=?').bind(u.userId)]);return response({ok:true});}
 if(b.action==='overrideName'){
  if(!await isBoardOwner(u))return fail('Only the board owner can change a permanent name binding.',403);
  if(b.confirm!==true||typeof b.key!=='string'||typeof b.expectedUser!=='string'||typeof b.expectedRevision!=='string'||!['unbind','transfer'].includes(b.mode)||b.mode==='transfer'&&(typeof b.target!=='string'||!b.target))return fail('Review and confirm the exact name binding change.');
  const error=await overrideName(db,{key:b.key,user:b.expectedUser,revision:b.expectedRevision,target:b.mode==='transfer'?b.target:null});
  return error?fail(error,409):response({ok:true});
 }
 if(b.action==='claim')return fail('Name claiming now links all matching sessions. Refresh the board and confirm with Claim my name.');
 if(b.action==='claimName'){
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>50)return fail('Choose your name from the list.');
  const error=await claimName(db,u.userId,b.name,now);
  return error?fail(error,409):response({ok:true});
 }
 const s:any=await db.prepare('SELECT * FROM sessions WHERE id=?').bind(String(b.id||'')).first();if(!s)return fail('Session not found.',404);
 const admin=await isBoardOwner(u);
 const organizer=admin||await canManage(s,u);
 if(['cancel','edit'].includes(b.action)&&!organizer)return fail('Only the session organizer or board admin can do that.',403);
 // Existing waitlists get first refusal, including records from before this release.
 await reconcileWaitlists(db);
 const write=async(statement:D1PreparedStatement)=>(await db.batch([statement,promotionStatement(db,s.id)]))[0];
 const addedName=String((await db.prepare('SELECT name FROM name_claims WHERE user=?').bind(u.userId).first<any>())?.name||b.addedByName||u.fullName||'Player').trim().slice(0,50)||'Player';
 if(b.action==='manual'&&b.player&&!organizer)return fail('Only the session organizer or board admin can edit another signup.',403);
 if(b.action==='manual'&&!organizer&&b.status!=='confirmed')return fail('You can add another player to an open slot.',403);
 if(b.action==='cancel'){await write(db.prepare('UPDATE sessions SET cancelled=? WHERE id=? AND owner=?').bind(s.cancelled?0:1,s.id,s.owner));return response({ok:true});}
 if(b.action==='edit'){
  const capacity=parseCapacity(b.capacity,sessionCapacity(s));if(capacity===null)return fail('Player limit must be a positive whole number.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end)||b.end<=b.start||!String(b.venue||'').trim())return fail('Check the date, venue and times.');
  // Check the current roster in the same statement as the edit so concurrent signups stay safe.
  const result=await write(db.prepare("UPDATE sessions SET date=?,start=?,end=?,court=?,venue=?,booked=?,capacity=?,notes=? WHERE id=? AND owner=? AND ? >= (SELECT COUNT(*) FROM players WHERE session=? AND status IN ('confirmed','tentative'))").bind(b.date,b.start,b.end,String(b.court||'').slice(0,40),String(b.venue).trim().slice(0,160),String(b.booked||'').slice(0,60),capacity,String(b.notes||'').slice(0,400),s.id,s.owner,capacity,s.id));
  if(!result.meta.changes)return fail('Player limit cannot be lower than the number of confirmed and tentative players. Existing signups have been kept.',409);
  return response({ok:true});}
 if(b.action==='remove'){
  const result=await write(db.prepare('DELETE FROM players WHERE session=? AND user=? AND (?=1 OR (manual=1 AND ?=1) OR added_by=?)').bind(s.id,String(b.player||''),admin?1:0,organizer?1:0,u.userId));
  if(!result.meta.changes)return fail('You can only remove players you added, or manage your own signup.',403);
  return response({ok:true});
 }
 if(b.action==='leave'){await write(db.prepare('DELETE FROM players WHERE session=? AND user=?').bind(s.id,u.userId));return response({ok:true});}
 if(!['join','manual'].includes(b.action)||!['confirmed','tentative','standby'].includes(b.status))return fail('Unknown action.');
 if(s.cancelled)return fail('This session is cancelled.');if(isPast(s))return fail('This session has ended.');const name=String(b.name||'').trim().slice(0,50);if(!name)return fail('Add your display name first.');
 const nameKey=normalizeName(name);
 if(b.action==='manual'&&b.player&&admin){
  const target:any=await db.prepare('SELECT manual FROM players WHERE session=? AND user=?').bind(s.id,String(b.player)).first();
  if(target?.manual===0){
   // Admin may edit signed-in attendance without transferring the account or its name claim.
   const result=await write(db.prepare(`UPDATE players SET name=?1,name_key=?2,status=?3
    WHERE session=?4 AND user=?5 AND manual=0
    AND NOT EXISTS(SELECT 1 FROM name_claims WHERE key=?2 AND user<>?5)
    AND EXISTS(SELECT 1 FROM sessions WHERE id=?4 AND cancelled=0)
    AND (?3='standby' OR (SELECT COUNT(*) FROM players WHERE session=?4 AND status IN ('confirmed','tentative') AND user<>?5)<(SELECT capacity FROM sessions WHERE id=?4))`).bind(name,nameKey,b.status,s.id,String(b.player)));
   if(!result.meta.changes)return fail('This signup changed, that name belongs to another account, or the court is full. Refresh the board.',409);
   return response({ok:true});
  }
 }
 if(b.action==='manual'&&b.player){
  // Resolve the reserved name inside the write. A stale organizer form cannot
  // edit a claimed row or recreate its old manual ID, nor merge a duplicate.
  const result=await write(db.prepare(`UPDATE players SET name=?1,name_key=?2,status=?3,roster_key=COALESCE(roster_key,user),user=COALESCE((SELECT user FROM name_claims WHERE key=?2),user),manual=CASE WHEN EXISTS(SELECT 1 FROM name_claims WHERE key=?2) THEN 0 ELSE 1 END
   WHERE session=?4 AND user=?5 AND manual=1
   AND NOT EXISTS(SELECT 1 FROM players existing JOIN name_claims c ON c.user=existing.user WHERE existing.session=?4 AND c.key=?2 AND existing.user<>?5)
   AND EXISTS(SELECT 1 FROM sessions WHERE id=?4 AND cancelled=0)
   AND (?3='standby' OR (SELECT COUNT(*) FROM players WHERE session=?4 AND status IN ('confirmed','tentative') AND user<>?5)<(SELECT capacity FROM sessions WHERE id=?4))`).bind(name,nameKey,b.status,s.id,String(b.player)));
  if(!result.meta.changes)return fail('This signup changed, the claimed account already has a signup, or the court is full. No records were merged. Refresh the board.',409);
  return response({ok:true});
 }
 if(b.action==='manual'){
  const manualId='manual-'+crypto.randomUUID();
  const result=await write(db.prepare(`INSERT INTO players(session,user,name,status,joined,manual,name_key,roster_key,added_by,added_by_name)
   SELECT ?1,COALESCE((SELECT user FROM name_claims WHERE key=?2),?3),?4,?5,?6,CASE WHEN EXISTS(SELECT 1 FROM name_claims WHERE key=?2) THEN 0 ELSE 1 END,?2,?3,?7,?8
   WHERE EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND cancelled=0)
   AND NOT EXISTS(SELECT 1 FROM players existing WHERE existing.session=?1 AND (existing.name_key=?2 OR lower(trim(existing.name))=lower(trim(?4))))
   AND NOT EXISTS(SELECT 1 FROM players existing JOIN name_claims c ON c.user=existing.user WHERE existing.session=?1 AND c.key=?2)
   AND (?5='standby' OR (SELECT COUNT(*) FROM players WHERE session=?1 AND status IN ('confirmed','tentative'))<(SELECT capacity FROM sessions WHERE id=?1))`).bind(s.id,nameKey,manualId,name,b.status,now,u.userId,addedName));
  if(!result.meta.changes)return fail('The claimed account already has a signup or the court is full. Existing signups were kept.',409);
  return response({ok:true});
 }
 // A single SQLite statement serializes name ownership, capacity and insertion.
 const result=await write(db.prepare(`INSERT INTO players(session,user,name,status,joined,manual,name_key) SELECT ?1,?2,?3,?4,?5,0,?6
  WHERE NOT EXISTS(SELECT 1 FROM name_claims WHERE key=?6 AND user<>?2)
  AND EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND cancelled=0)
  AND (?4='standby' OR (SELECT COUNT(*) FROM players WHERE session=?1 AND status IN ('confirmed','tentative') AND user<>?2)<(SELECT capacity FROM sessions WHERE id=?1))
  ON CONFLICT(session,user) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,status=excluded.status`).bind(s.id,u.userId,name,b.status,now,nameKey));
 if(!result.meta.changes)return fail('This name belongs to another account or the last place was taken. Refresh the board; use your own name or join standby.',409);return response({ok:true});
}

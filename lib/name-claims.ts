import {normalizeName} from './names';

// Existing names receive only a deterministic search key, never ownership.
// The guarded write cannot overwrite a concurrently renamed record.
export async function indexLegacyNames(db:D1Database){
 const rows=await db.prepare('SELECT session,user,name FROM players WHERE name_key IS NULL').all<{session:string;user:string;name:string}>();
 if(rows.results.length)await db.batch(rows.results.map(p=>db.prepare('UPDATE players SET name_key=? WHERE session=? AND user=? AND name=? AND name_key IS NULL').bind(normalizeName(p.name),p.session,p.user,p.name)));
}

// The reservation and roster update run in ONE D1 transaction. Every conflict
// fails the entire claim; no records are deleted, merged or silently skipped.
export const reserveNameSQL=`INSERT OR IGNORE INTO name_claims(key,user,name,created,revision)
 SELECT ?1,?2,?3,?4,?5
 WHERE EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1)
 AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key IS NULL)
 AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 AND p.manual<>1 AND p.user<>?2)
 AND NOT EXISTS(SELECT p.session FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 GROUP BY p.session HAVING COUNT(*)>1)
 AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 AND p.manual=1 AND EXISTS(SELECT 1 FROM players mine WHERE mine.session=p.session AND mine.user=?2))`;
export const bindNameSQL=`UPDATE players SET roster_key=COALESCE(roster_key,user),user=?2,manual=0
 WHERE name_key=?1 AND manual=1 AND session IN(SELECT id FROM sessions WHERE demo=0)
 AND EXISTS(SELECT 1 FROM name_claims WHERE key=?1 AND user=?2 AND revision=?3)`;
export async function claimName(db:D1Database,user:string,name:string,created:string){
 const key=normalizeName(name);await indexLegacyNames(db);
 const revision=crypto.randomUUID();let result;
 try{result=await db.batch([db.prepare(reserveNameSQL).bind(key,user,name,created,revision),db.prepare(bindNameSQL).bind(key,user,revision)]);}catch(error){if(/constraint|unique/i.test(String(error)))return 'Conflicting signups prevented this claim. Nothing was changed. Refresh the board.';throw error}
 if(result[0].meta.changes)return null;
 const claim=await db.prepare('SELECT key,user FROM name_claims WHERE key=? OR user=?').bind(key,user).first<{key:string;user:string}>();
 if(claim)return claim.key===key&&claim.user===user?'This name is already linked to your account.':claim.user===user?'Your account already has a claimed name.':'This name is already claimed by another account.';
 return 'This name has a conflicting account or duplicate signup, or the list changed. Nothing was claimed. Refresh the board and resolve the conflicting signup before trying again.';
}

// Only the Site owner's authenticated request reaches this helper. Compare the
// exact reservation revision so a stale control cannot override a newer change.
export async function overrideName(db:D1Database,input:{key:string;user:string;revision:string;target:string|null}){
 await indexLegacyNames(db);
 const {key,user,revision,target}=input,nonce=crypto.randomUUID();
 const real="session IN(SELECT id FROM sessions WHERE demo=0)";
 const noConflicts=`NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 AND p.manual<>1 AND p.user NOT IN (?2,?4))
 AND NOT EXISTS(SELECT p.session FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 GROUP BY p.session HAVING COUNT(*)>1)
 AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 AND EXISTS(SELECT 1 FROM players q WHERE q.session=p.session AND q.user=?4 AND q.user<>p.user))
 AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key IS NULL)`;
 let result;
 try{
  if(target){
   if(target===user)return 'Choose a different account.';
   result=await db.batch([
    db.prepare(`UPDATE name_claims SET user=?4,revision=?5 WHERE key=?1 AND user=?2 AND revision=?3
     AND NOT EXISTS(SELECT 1 FROM name_claims WHERE user=?4)
     AND (EXISTS(SELECT 1 FROM players known JOIN sessions known_session ON known_session.id=known.session WHERE known.user=?4 AND known.manual=0 AND known_session.demo=0) OR EXISTS(SELECT 1 FROM name_claims WHERE user=?4))
     AND ${noConflicts}`).bind(key,user,revision,target,nonce),
    db.prepare(`UPDATE players SET roster_key=COALESCE(roster_key,user),user=?2,manual=0 WHERE name_key=?1 AND ${real} AND EXISTS(SELECT 1 FROM name_claims WHERE key=?1 AND user=?2 AND revision=?3)`).bind(key,target,nonce),
   ]);
  }else{
   // First rotate the reservation revision only if all matching records are safe.
   // Release them as fresh manual keys (retaining roster_key for ordering), then
   // delete exactly that new revision. No signup or attendance detail is deleted.
   result=await db.batch([
    db.prepare(`UPDATE name_claims SET revision=?4 WHERE key=?1 AND user=?2 AND revision=?3
     AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key=?1 AND p.manual<>1 AND p.user<>?2)
     AND NOT EXISTS(SELECT 1 FROM players p JOIN sessions s ON s.id=p.session WHERE s.demo=0 AND p.name_key IS NULL)`).bind(key,user,revision,nonce),
    db.prepare(`UPDATE players SET roster_key=COALESCE(roster_key,user),user='manual-'||lower(hex(randomblob(16))),manual=1 WHERE name_key=?1 AND ${real} AND EXISTS(SELECT 1 FROM name_claims WHERE key=?1 AND revision=?2)`).bind(key,nonce),
    db.prepare('DELETE FROM name_claims WHERE key=? AND revision=?').bind(key,nonce),
   ]);
  }
 }catch(error){if(/constraint|unique/i.test(String(error)))return 'Conflicting signups prevented this change. No records were changed.';throw error}
 return result[0].meta.changes?null:'The binding changed, the destination account is unavailable, or signups conflict. Nothing was changed. Refresh and review again.';
}

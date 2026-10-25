import {pacificNow} from './board';
// Used after every roster/capacity mutation in the SAME D1 transaction.
// SQLite materializes the ordered IN list before updating, so multiple vacancies
// are filled together without skipping anyone or exceeding capacity.
export function promotionStatement(db:D1Database,id:string,now=new Date()){
 return db.prepare(`UPDATE players SET status='confirmed' WHERE session=?1 AND user IN (
  SELECT user FROM players WHERE session=?1 AND status='standby'
  AND EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND cancelled=0 AND date||'T'||end>?2)
  ORDER BY joined,COALESCE(roster_key,user)
  LIMIT max(0,COALESCE((SELECT capacity FROM sessions WHERE id=?1),0)-(SELECT COUNT(*) FROM players WHERE session=?1 AND status IN ('confirmed','tentative')))
 )`).bind(id,pacificNow(now));
}
export async function reconcileWaitlists(db:D1Database){
 const rows=await db.prepare("SELECT DISTINCT session FROM players WHERE status='standby'").all<{session:string}>();
 if(rows.results.length)await db.batch(rows.results.map(p=>promotionStatement(db,p.session)));
}

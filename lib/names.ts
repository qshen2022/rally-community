// Only case and whitespace are ignored. Punctuation, accents and similar-looking
// names remain distinct; never infer that a nickname is somebody else's name.
export function normalizeName(value:string){return value.trim().replace(/\s+/gu,' ').toLowerCase()}
export type ClaimPlayer={session:string;user?:string;name:string;status:string;manual:number};
export type NameClaim={key:string;name:string;mine:boolean};
export function nameChoices(sessions:{id:string;demo?:number}[],players:ClaimPlayer[],claims:NameClaim[],uid:string){
 const real=new Set(sessions.filter(s=>!s.demo).map(s=>s.id));
 const groups=new Map<string,{key:string;name:string;players:ClaimPlayer[];reason:string}>();
 for(const p of players){if(!real.has(p.session))continue;const key=normalizeName(p.name);if(!key)continue;let group=groups.get(key);if(!group){group={key,name:p.name,players:[],reason:''};groups.set(key,group)}group.players.push(p)}
 const ownClaim=claims.find(c=>c.mine);
 for(const group of groups.values()){
  const reservation=claims.find(c=>c.key===group.key);
  if(reservation)group.reason=reservation.mine?'This name is already linked to your account.':'This name is already claimed by another account.';
  else if(ownClaim)group.reason='Your account already has a claimed name.';
  else if(group.players.some(p=>!p.manual&&p.user!==uid))group.reason='A signup with this name belongs to another account. No records will be changed.';
  else if(new Set(group.players.map(p=>p.session)).size!==group.players.length)group.reason='This name appears more than once in a session. Resolve the duplicate before claiming.';
  else if(group.players.some(p=>p.manual&&players.some(other=>other.session===p.session&&other.user===uid)))group.reason='You already have a different signup in one of these sessions. Resolve it before claiming.';
 }
 return Array.from(groups.values()).sort((a,b)=>a.name.localeCompare(b.name));
}

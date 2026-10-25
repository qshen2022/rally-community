import type {ChatGPTUser} from '../app/chatgpt-auth';
import config from '../rally.config.json' with {type:'json'};
export async function isBoardOwner(u:ChatGPTUser,ownerHash=config.ownerEmailSha256){
 if(!/^[a-f0-9]{64}$/.test(ownerHash))return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(u.email.toLowerCase())))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return hash===ownerHash;
}

export async function canManage(s:{owner:string},u:ChatGPTUser){return s.owner===u.userId||await isBoardOwner(u)}

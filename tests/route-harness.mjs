import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import * as board from '../lib/board.ts';
import {isBoardOwner as checkBoardOwner} from '../lib/organizer.ts';
const ownerHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('owner@example.test')))).map(b=>b.toString(16).padStart(2,'0')).join('');
const isBoardOwner=u=>checkBoardOwner(u,ownerHash);
const canManage=async(s,u)=>s.owner===u.userId||await isBoardOwner(u);
import {normalizeName} from '../lib/names.ts';
const load=(path,args)=>new Function(...Object.keys(args),stripTypeScriptTypes(readFileSync(path,'utf8')).replace(/^import .+;$/gm,'').replace(/export /g,'')+'\nreturn typeof POST!=="undefined"?{GET,POST}:typeof promotionStatement!=="undefined"?{promotionStatement,reconcileWaitlists}:{claimName,overrideName,reserveNameSQL,bindNameSQL};')(...Object.values(args));
export function harness(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const context=new AsyncLocalStorage();let beforeRun=null,beforeBatch=null;
 // node:sqlite treats ?1 as a named parameter while D1 binds numbered positions.
 const statement=(sql,args)=>({sql,args,execute:()=>{const s=sqlite.prepare(sql);return /\?\d/.test(sql)?s.run(Object.fromEntries(args.map((v,i)=>[String(i+1),v]))):s.run(...args)}});
 const read=(sql,args,method)=>{const s=sqlite.prepare(sql);return /\?\d/.test(sql)?s[method](Object.fromEntries(args.map((v,i)=>[String(i+1),v]))):s[method](...args)};
 const db={prepare(sql){return {bind(...args){return {...statement(sql,args),first:async()=>read(sql,args,'get'),all:async()=>({results:read(sql,args,'all')}),run:async()=>{if(beforeRun)await beforeRun(sql,args);return {meta:statement(sql,args).execute()}}}},all:async()=>({results:read(sql,[],'all')})}},async batch(statements){if(beforeRun)for(const s of statements)await beforeRun(s.sql,s.args);if(beforeBatch)await beforeBatch(statements);sqlite.exec('BEGIN');try{const results=statements.map(s=>({meta:s.execute()}));sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const names=load('lib/name-claims.ts',{normalizeName});const waitlist=load('lib/waitlist.ts',board);const route=load('app/api/board/route.ts',{env:{DB:db},getChatGPTUser:async()=>context.getStore(),canManage,isBoardOwner,...board,...waitlist,normalizeName,claimName:names.claimName,overrideName:names.overrideName});
 const account=id=>id?typeof id==='object'?id:{userId:id,email:id+'@example.test',fullName:id}:null;
 async function request(id,body,origin){return context.run(account(id),async()=>{const r=await route.POST(new Request('https://example.test/api/board',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()}})}
 const get=id=>context.run(account(id),async()=>await(await route.GET()).json());
 return {sqlite,db,...names,request,get,setBeforeRun:f=>beforeRun=f,setBeforeBatch:f=>beforeBatch=f};
}

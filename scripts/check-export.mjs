import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const skip=new Set(['.git','node_modules','.next','.vinext','.wrangler','.sites-runtime','.rally','dist','outputs']);
const bad=[];let count=0;
function visit(dir='.'){
 for(const ent of readdirSync(dir,{withFileTypes:true})){
  if(skip.has(ent.name))continue;const file=path.join(dir,ent.name);
  if(ent.isSymbolicLink()){bad.push(file+': symlink');continue}
  if(ent.isDirectory()){visit(file);continue}
  if(/\.(db|sqlite|sqlite3|dump|zip|pem|key|tsbuildinfo)$|\.db-|\.sqlite-|\.tar(\.gz)?$/.test(ent.name)||/^\.env/.test(ent.name))bad.push(file+': generated or private file');
  const data=readFileSync(file);if(data.includes(0)){bad.push(file+': binary file');continue}
  const s=data.toString();count++;
  if(file!==path.join('scripts','check-export.mjs')&&/appgprj_[a-zA-Z0-9]+|[a-zA-Z0-9.-]+\.chatgpt\.site|github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]+/.test(s))bad.push(file+': instance binding, original URL or token');
 }
}
visit();
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(manifest.project_id)bad.push('Site binding must be removed before publishing a reusable template.');
if(JSON.parse(readFileSync('rally.config.json','utf8')).ownerEmailSha256)bad.push('Owner configuration must be blank before publishing the generic template.');
if(bad.length){console.error(bad.join('\n'));process.exitCode=1}else console.log(`PASS: ${count} source files checked; no instance binding, deployed URL, database file or configured owner.`);

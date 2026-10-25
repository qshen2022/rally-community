import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=mkdtempSync(path.join(tmpdir(),'rally-setup-test-'));
try{
 mkdirSync(path.join(root,'scripts'));mkdirSync(path.join(root,'.openai'));
 copyFileSync('scripts/setup.mjs',path.join(root,'scripts/setup.mjs'));
 const hosting=path.join(root,'.openai/hosting.json'),config=path.join(root,'rally.config.json');
 writeFileSync(hosting,JSON.stringify({d1:'DB',r2:null}));writeFileSync(config,JSON.stringify({ownerEmailSha256:''}));
 const run=(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/setup.mjs'),...args],{encoding:'utf8'});
 const original=readFileSync(config,'utf8');
 assert.notEqual(run('--owner-email','invalid').status,0);assert.equal(readFileSync(config,'utf8'),original);
 assert.equal(run('--owner-email',' OWNER@example.test ').status,0);
 assert.equal(JSON.parse(readFileSync(config,'utf8')).ownerEmailSha256,createHash('sha256').update('owner@example.test').digest('hex'));
 assert(!readFileSync(config,'utf8').includes('@'));
 const configured=readFileSync(config,'utf8');assert.notEqual(run('--owner-email','other@example.test').status,0);assert.equal(readFileSync(config,'utf8'),configured);
 writeFileSync(config,original);writeFileSync(hosting,JSON.stringify({project_id:'test-existing-project',d1:'DB'}));
 assert.notEqual(run('--owner-email','owner@example.test').status,0);assert.equal(readFileSync(config,'utf8'),original);
 assert.notEqual(run('--remote').status,0);
 console.log('PASS: new-clone setup; email hash only; refuses invalid input, existing owner and bound project; no credentials, database or remote operation');
}finally{rmSync(root,{recursive:true,force:true})}

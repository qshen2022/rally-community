#!/usr/bin/env node
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.length>2)throw Error('This script accepts no arguments and only migrates the isolated local database.');
const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))throw Error('Run npm ci first.');
const dir=path.join(root,'.rally');mkdirSync(dir,{recursive:true});
const config=path.join(dir,'wrangler-local.json');
// This UUID is a LOCAL placeholder. No production credentials, project IDs or URLs.
writeFileSync(config,JSON.stringify({name:'rally-local',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:path.join(root,'drizzle')}]},null,2));
const r=spawnSync(process.execPath,['--import',path.join(root,'scripts/sites-env.mjs'),wrangler,'d1','migrations','apply','DB','--local','--config',config,'--persist-to',path.join(root,'.wrangler/state')],{cwd:root,stdio:'inherit'});
if(r.error)throw r.error;process.exit(r.status??1);

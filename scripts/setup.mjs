#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('Usage: npm run setup -- --owner-email owner@example.com\nConfigures this local, unbound clone only. Does not create a Site, access a database or deploy.');process.exit(0)}
if(args.length&&!(args.length===2&&args[0]==='--owner-email'))throw Error('Expected --owner-email EMAIL, or no arguments for an interactive prompt.');
const hosting=JSON.parse(readFileSync(root+'.openai/hosting.json','utf8'));
if(hosting.project_id)throw Error('This checkout is already bound to a Site. Setup only accepts a NEW unbound copy.');
const config=JSON.parse(readFileSync(root+'rally.config.json','utf8'));
if(config.ownerEmailSha256)throw Error('An owner is already configured. Setup will not overwrite it.');
let email=args[1];
if(!email){if(!process.stdin.isTTY)throw Error('Pass --owner-email EMAIL in noninteractive mode.');const input=createInterface({input:process.stdin,output:process.stdout});try{email=await input.question('Email used by the new board owner to sign in with ChatGPT: ')}finally{input.close()}}
email=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid sign-in email.');
const ownerEmailSha256=createHash('sha256').update(email).digest('hex');
writeFileSync(root+'rally.config.json',JSON.stringify({...config,ownerEmailSha256},null,2)+'\n');
console.log('Local owner configuration created. No database was accessed and no Site was changed.\nNext: npm ci; npm run build; npm run db:local. See docs/DEPLOY.zh-CN.md to create your own Site.');

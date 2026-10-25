import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
let failed=false;
for(const file of readdirSync('tests').filter(f=>f.endsWith('.mjs')&&f!=='route-harness.mjs').sort()){
 const r=spawnSync(process.execPath,['--experimental-strip-types','tests/'+file],{stdio:'inherit'});
 if(r.status!==0){failed=true;console.error('FAILED:',file)}
}
process.exitCode=failed?1:0;

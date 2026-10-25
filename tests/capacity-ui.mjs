import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import * as names from '../lib/names.ts';
import * as share from '../lib/share-changes.ts';
import * as board from '../lib/board.ts';

// Render the actual component with controlled state, without a browser or live requests.
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync('app/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const s={id:'test',owner:'owner',date:'2099-10-19',start:'19:00',end:'20:00',venue:'Test venue',court:'1',booked:'',notes:'',capacity:8,cancelled:0,demo:0,canManage:true};
function render({capacity=8,count=0,mine,filter='all',modal=false,editing='',form,owner=true,user={id:'me',name:'Me'},extra=[],changes=[]}={}){
 const players=Array.from({length:count},(_,i)=>({session:'test',user:'player-'+i,name:'Player '+i,status:'confirmed'}));
 players.push(...extra);
 if(mine)players.push({session:'test',user:'me',name:'Me',status:mine});
 const states=[new Date('2026-10-19T16:00:00Z'),'',null,{sessions:[{...s,capacity,canManage:owner}],players,user},'','',false,'Me',filter,modal,editing,form,true,null,false,'',changes];
 let index=0;
 const hooks={useEffect(){},useState(initial){const value=states[index++];return [value===undefined?initial:value,()=>{}]}};
 const module={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='react'?hooks:name==='../lib/board'?board:name==='../lib/names'?names:name==='../lib/share-changes'?share:require(name),module,module.exports);
 return renderToStaticMarkup(module.exports.default());
}
let html=render({count:4});
assert(html.includes('4 spots open'));assert(html.includes('4 / 8 players'));
assert.equal((html.match(/Room for one more/g)||[]).length,4);
assert(!decodeURIComponent(html).includes('4 of 8 spots open'),'Shared availability uses the concise format');
html=render({count:8,mine:'standby'});
assert(html.includes('Full court'));assert.match(html,/<button disabled="" class="primary join">Court is full/);
assert.match(html,/<option value="tentative" disabled="">/);
html=render({count:7,mine:'tentative'});
assert(!html.includes('disabled="" class="primary join"'));assert(html.includes('Count me in'));
assert(!render({count:8,filter:'open'}).includes('id="test"'));
assert(render({count:4,filter:'open'}).includes('id="test"'));
html=render({capacity:12,count:0});assert.equal((html.match(/Room for one more/g)||[]).length,8);assert(html.includes('Plus 4 more open spots'));
html=render({modal:true});assert.match(html,/<input required="" type="number" min="1" max="9007199254740991" step="1" inputMode="numeric" value="4"/);
html=render({modal:true,editing:'test',form:{...s,capacity:'8'}});assert(html.includes('value="8"'));assert(html.includes('Edit the rally.'));
console.log('PASS: rendered 8-player cards, open filter, totals, full/standby/tentative controls, custom-capacity listing, bounded large-roster placeholders, default create and editable capacity forms');

const guest={session:'test',user:'guest',name:'Guest',status:'confirmed',manual:1,added_by:'me',added_by_name:'Alice'};
html=render({owner:false,extra:[guest]});assert(html.includes('Add player'));assert(html.includes('(by Alice)'));assert(html.includes('aria-label="Remove Guest"'));assert(!html.includes('aria-label="Edit Guest"'));
html=render({owner:false,user:{id:'other',name:'Other'},extra:[guest]});assert(!html.includes('aria-label="Remove Guest"'));
assert(!render({owner:false,count:8}).includes('Add player'));
assert(!render({owner:false,user:null}).includes('Add player'));
console.log('PASS: rendered non-organizer add button, full/anonymous restrictions, attribution and adder-only remove control');

const added=share.actionChange({action:'join',id:'test',name:'Riley',status:'confirmed'},[{...s}],[],'yunda');
html=render({count:2,extra:[{session:'test',user:'yunda',name:'Riley',status:'confirmed'}],changes:[added]});
const href=html.match(/class="whatsapp-share" href="([^"]+)"/)[1].replaceAll('&amp;','&');
const message=new URL(href).searchParams.get('text');
assert(message.includes('*Riley* joined'));assert(message.includes('5 open slots'));assert(!message.includes('Booked under'));
console.log('PASS: real WhatsApp anchor uses concise change summaries and open-session availability');

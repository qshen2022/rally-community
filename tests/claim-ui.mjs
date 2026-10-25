import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import * as board from '../lib/board.ts';
import * as names from '../lib/names.ts';
import * as share from '../lib/share-changes.ts';

const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync('app/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const s={id:'test',owner:'organizer',date:'2099-10-19',start:'19:00',end:'20:00',venue:'Test venue',court:'1',booked:'Taylor',notes:'Keep me',capacity:4,cancelled:0,demo:0,canManage:false};
const manual={session:'test',user:'manual-a',name:'Taylor',status:'confirmed',manual:1};
const taylor={key:'taylor',name:'Taylor'};
const slots={data:3,error:4,toast:5,busy:6,name:7,claim:13,picker:14,query:15,adminEdit:17};
const textOf=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):(Array.isArray(n)?n:n.props?.children?[n.props.children]:[]).flat(Infinity).map(textOf).join('');

// Deterministic hook state and real JSX/helper code; effects never run and fetch is
// replaced below before any handler is exercised. No production board is touched.
function app({user={id:'me',name:'Me'},players=[manual],sessions=[s],claims=[],admin,filter='all',claim=null,claimPicker=false,claimQuery='',owner=false,busy=false,loaded=true}={}){
 const states=[new Date('2026-10-19T16:00:00Z'),'',null,{sessions:sessions.map(session=>({...session,canManage:owner})),players,claims,admin,user},'','',busy,'Me',filter,false,'',undefined,loaded,claim,claimPicker,claimQuery];
 let index=0;
 const hooks={useEffect(){},useState(initial){const slot=index++;if(states[slot]===undefined)states[slot]=initial;return [states[slot],value=>{states[slot]=typeof value==='function'?value(states[slot]):value}]}};
 const module={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='react'?hooks:name==='../lib/board'?board:name==='../lib/names'?names:name==='../lib/share-changes'?share:require(name),module,module.exports);
 const tree=()=>{index=0;return module.exports.default()};
 const nodes=test=>{const result=[];function visit(n){if(!n||typeof n!=='object')return;if(test(n))result.push(n);const c=n.props?.children;for(const child of Array.isArray(c)?c.flat(Infinity):[c])visit(child)}visit(tree());return result};
 const button=className=>nodes(n=>n.type==='button'&&n.props.className===className)[0];
 const options=()=>nodes(n=>n.type==='button'&&n.props.className==='claim-option');
 const option=name=>options().find(n=>textOf(n.props.children[0].props.children[0])===name);
 const control=label=>nodes(n=>n.props?.['aria-label']===label)[0];
 const adminSubmit=()=>nodes(n=>n.type==='button'&&/^(Confirm unbind|Confirm transfer|Updating…)$/.test(textOf(n)))[0];
 const checkbox=()=>nodes(n=>n.type==='input'&&n.props.type==='checkbox')[0];
 const confirm=()=>nodes(n=>n.type==='button'&&n.props.className==='primary'&&/^(Yes, claim this name|Claiming…)/.test(textOf(n)))[0];
 return {states,tree,nodes,button,options,option,confirm,control,adminSubmit,checkbox,html:()=>renderToStaticMarkup(tree()),dialog:()=>nodes(n=>n.props?.className==='modal claim-modal')[0]};
}
// Model browser dispatch: disabled buttons do not receive click events.
function click(node){assert(node,'Expected a rendered control');if(!node.props.disabled)return node.props.onClick()}
function change(node,value){assert(node,'Expected a rendered select');if(!node.props.disabled)node.props.onChange({target:{value}})}
function check(a,checked=true){const node=a.checkbox();assert(node,'Expected explicit confirmation checkbox');if(!node.props.disabled)node.props.onChange({target:{checked}})}
function search(a,value){a.nodes(n=>n.type==='input'&&n.props.type==='search')[0].props.onChange({target:{value}})}
function openAndSelect(a,name='Taylor'){click(a.button('claim-entry'));click(a.option(name));assert(a.confirm(),'Selection should show a separate confirmation')}
function escape(a){let prevented=false;a.dialog().props.onKeyDown({key:'Escape',preventDefault(){prevented=true}});assert(prevented)}
function assertBlocked(options,reason){const a=app({...options,claimPicker:true});const option=a.option('Taylor');assert(option,'Conflicting name remains visible with its explanation');assert.equal(option.props.disabled,true);assert(textOf(option).includes(reason));click(option);assert.equal(a.states[slots.claim],null);return a}

const posts=[];
let serverData,postHandler;
const oldFetch=globalThis.fetch,oldTimeout=globalThis.setTimeout;
globalThis.setTimeout=()=>0;
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'/api/board','Only the isolated mocked board endpoint is allowed');
 if(options?.method==='POST'){
  const body=JSON.parse(options.body);posts.push(body);
  if(body.action==='overrideName'){
   assert.deepEqual(Object.keys(body).sort(),['action','confirm','expectedRevision','expectedUser','key','mode','target']);
   assert.equal(body.confirm,true);
   assert(postHandler,'Owner changes require their own explicit mocked response');
   return postHandler(body);
  }
  assert.equal(body.action,'claimName','The UI must never submit a per-session claim');
  assert.deepEqual(Object.keys(body).sort(),['action','name']);
  if(postHandler)return postHandler(body);
  const key=names.normalizeName(body.name);
  serverData={...serverData,claims:[{key,name:body.name,mine:true}],players:serverData.players.map(p=>names.normalizeName(p.name)===key&&!serverData.sessions.find(s=>s.id===p.session)?.demo?{...p,user:'me',manual:0}:p)};
  return Response.json({ok:true});
 }
 assert(serverData,'Every GET must have explicit mocked data');
 return Response.json(serverData);
};

try{
 let a=app(),html=a.html();
 assert.equal((html.match(/class="claim-entry"/g)||[]).length,1);
 assert(html.indexOf('class="claim-entry"')<html.indexOf('<main>'));
 assert(html.includes('Claim my name'));
 assert(!html.includes('This is me'));
 assert(!html.includes('claim-player'));
 assert(!html.includes('YOU MANAGE THIS SESSION'));
 assert.equal(app({loaded:false}).button('claim-entry').props.disabled,true);

 // Signed-out users can discover the flow but must authenticate before choosing.
 a=app({user:null});click(a.button('claim-entry'));html=a.html();
 assert(html.includes('Sign in to claim'));
 assert(html.includes('choose your name once to link its signups across all sessions'));
 assert.equal(a.options().length,0);
 const signIn=a.nodes(n=>n.props?.className==='primary claim-signin')[0];
 assert.equal(signIn.props.href,'/signin-with-chatgpt?return_to=%2F');
 assert.equal(signIn.props.target,'_top');

 // One normalized exact name groups all real sessions, including past/cancelled.
 const groupedSessions=[s,{...s,id:'other',date:'2099-10-20',court:'2'},{...s,id:'past',date:'2020-10-19',court:'3'},{...s,id:'cancelled',date:'2099-10-21',court:'4',cancelled:1},{...s,id:'sample',demo:1}];
 const groupedPlayers=[manual,{...manual,session:'other',user:'manual-b',name:'  TAYLOR  ',status:'tentative'},{...manual,session:'past',user:'manual-c',name:'taylor',status:'standby'},{...manual,session:'cancelled',user:'manual-d',name:'Taylor'},{...manual,session:'sample',user:'manual-sample'},{...manual,user:'nickname',name:'Tayler'},{...manual,user:'full-name',name:'Taylor Smith'},{...manual,session:'other',user:'full-name-spaced',name:' taylor   SMITH '},{...manual,user:'punctuation',name:'Taylor-Smith'}];
 a=app({sessions:groupedSessions,players:groupedPlayers,claimPicker:true});
 assert.equal(a.options().length,4,'Case/extra spaces combine; nickname, full name and punctuation stay distinct');
 assert(textOf(a.option('Taylor')).includes('4 signups across all sessions'));
 assert(textOf(a.option('Taylor Smith')).includes('2 signups across all sessions'));
 assert(textOf(a.option('Tayler')).includes('1 signup across all sessions'));
 assert(textOf(a.option('Taylor-Smith')).includes('1 signup across all sessions'));
 for(const option of a.options())assert.equal(option.props.disabled,false);
 search(a,'  TAYLOR ');assert.equal(a.options().length,3);
 search(a,'Tayler');assert.equal(a.options().length,1);
 search(a,'Not here');assert(a.html().includes('No matching names. Try another name.'));
 search(a,'');click(a.option('Taylor'));html=a.html();
 assert(html.includes('Is this your name?'));
 assert(html.includes('4 matching signups across all sessions'));
 for(const expected of ['October 19, 2099','October 20, 2099','October 19, 2020','October 21, 2099','Court 1','Court 2','Court 3','Court 4','7:00 PM','Tentative / TBC','If needed / waitlist','Past session','Cancelled'])assert(html.includes(expected),expected);
 for(const expected of ['This group works on trust','no identity check or organizer approval','including past and cancelled sessions','Future signups manually added under this name will also link to you','other accounts cannot claim it','Only case and extra spaces are ignored','Similar names and nicknames stay separate','One permanently claimed name per account','Only the board owner can unbind or transfer it','Attendance status and session details stay the same'])assert(html.includes(expected),expected);
 assert(!html.includes('just this session'));
 assert.equal(posts.length,0,'Opening, searching and selection never submit');

 // Reservations, linked accounts and duplicate/conflicting signups are explained.
 a=assertBlocked({claims:[{...taylor,mine:false}]},'This name is already claimed by another account.');
 assertBlocked({players:[{...manual,manual:0,user:'other'}]},'A signup with this name belongs to another account.');
 assertBlocked({players:[manual,{...manual,user:'duplicate',name:' TAYLOR '}]},'This name appears more than once in a session.');
 assertBlocked({players:[manual,{...manual,user:'me',name:'Me',manual:0,status:'standby'}]},'You already have a different signup in one of these sessions.');
 a=assertBlocked({claims:[{key:'other name',name:'Other Name',mine:true}]},'Your account already has a claimed name.');
 assert(a.html().includes('Other Name</strong> is linked to your account'));
 a=assertBlocked({players:[{...manual,user:'me',manual:0}],claims:[{...taylor,mine:true}]},'This name is already linked to your account.');
 assert(a.html().includes('New matching signups will link automatically. Your name stays permanently reserved, even if you leave every session or change your display name. Only the board owner can change this binding.'));
 a=app({players:[],claims:[{...taylor,mine:true}],claimPicker:true});
 assert(a.html().includes('Taylor</strong> is linked to your account'));
 assert(a.html().includes('No names are available to claim.'));
 a=app({players:[{...manual,user:'me',manual:0}],claimPicker:true});
 assert.equal(a.option('Taylor').props.disabled,false,'An existing own signup may bind its name');
 a=app({sessions:[s,{...s,id:'unrelated'}],players:[manual,{...manual,session:'unrelated',user:'me',manual:0,name:'Me'}],claimPicker:true});
 assert.equal(a.option('Taylor').props.disabled,false,'An unrelated own signup does not block claiming');
 a=app({sessions:[{...s,demo:1}],claimPicker:true});
 assert.equal(a.options().length,0,'Sample names are never claimable');
 assert(a.html().includes('No names are available to claim.'));
 assert.equal(posts.length,0,'Blocked names never submit');

 // Back, the close button, backdrop and Escape dismiss without a POST.
 for(const dismissal of ['back','close','backdrop','escape']){
  a=app();openAndSelect(a);
  if(dismissal==='back'){
   click(a.nodes(n=>n.type==='button'&&textOf(n)==='Back to names')[0]);assert.equal(a.states[slots.claim],null);assert.equal(a.states[slots.picker],true);assert(a.html().includes('Find your name.'));
   click(a.nodes(n=>n.props?.['aria-label']==='Close claim chooser')[0]);
  }else if(dismissal==='close')click(a.nodes(n=>n.props?.['aria-label']==='Close claim chooser')[0]);
  else if(dismissal==='backdrop')a.nodes(n=>n.props?.className==='modal-backdrop')[0].props.onClick();
  else escape(a);
  assert.equal(a.states[slots.claim],null);assert.equal(a.states[slots.picker],false);assert.equal(a.dialog(),undefined);
  a.states[slots.query]='old search';a.states[slots.error]='old error';click(a.button('claim-entry'));
  assert.equal(a.states[slots.query],'');assert.equal(a.states[slots.error],'');assert.equal(a.states[slots.claim],null);
 }
 assert.equal(posts.length,0,'Dismissal and reopening never submit');

 // Refresh rechecks the entire selected group: no stale confirmation can submit.
 for(const changed of ['removed','reserved','conflicting','duplicate','signed-out']){
  a=app();openAndSelect(a);serverData=structuredClone(a.states[slots.data]);
  if(changed==='removed')serverData.players=[];
  if(changed==='reserved')serverData.claims=[{...taylor,mine:false}];
  if(changed==='conflicting')serverData.players=[{...manual,user:'other',manual:0}];
  if(changed==='duplicate')serverData.players.push({...manual,user:'duplicate'});
  if(changed==='signed-out')serverData.user=null;
  await a.nodes(n=>n.props?.['aria-label']==='Refresh board')[0].props.onClick();
  if(changed==='signed-out'){assert(a.html().includes('Sign in to claim'));assert.equal(a.confirm(),undefined)}
  else {assert.equal(a.confirm().props.disabled,true);assert(a.nodes(n=>n.props?.role==='alert').length>0);await click(a.confirm())}
 }
 assert.equal(posts.length,0,'Refresh-invalidated selections never submit');

 // Successful confirmation sends one name-wide request and refreshes ownership.
 a=app({sessions:groupedSessions,players:groupedPlayers});serverData=structuredClone(a.states[slots.data]);
 const beforeData=structuredClone(serverData);openAndSelect(a);assert.equal(posts.length,0);
 await click(a.confirm());
 assert.deepEqual(posts,[{action:'claimName',name:'Taylor'}]);
 assert.equal(a.states[slots.picker],false);assert.equal(a.states[slots.claim],null);assert.equal(a.states[slots.name],'Taylor');
 assert(a.html().includes('Claimed. All matching signups are now yours.'));
 assert.deepEqual(serverData.sessions,beforeData.sessions);
 for(let i=0;i<serverData.players.length;i++){
  const before=beforeData.players[i],after=serverData.players[i];
  assert.equal(after.status,before.status,'Claiming preserves attendance status');
  if(names.normalizeName(before.name)==='taylor'&&before.session!=='sample'){assert.equal(after.user,'me');assert.equal(after.manual,0)}
  else assert.deepEqual(after,before,'Other names and samples stay unchanged');
 }
 click(a.button('claim-entry'));assert.equal(a.option('Taylor').props.disabled,true);assert(a.html().includes('is linked to your account'));
 assert.equal(a.option('Tayler').props.disabled,true,'A second name cannot be claimed after success');

 // A pending request disables repeated clicks and every dismissal route.
 a=app();serverData=structuredClone(a.states[slots.data]);openAndSelect(a);
 let release;postHandler=()=>new Promise(resolve=>{release=resolve});
 const pending=click(a.confirm());
 assert.equal(posts.length,2);assert.equal(a.states[slots.busy],true);
 assert.equal(a.confirm().props.disabled,true);assert(textOf(a.confirm()).includes('Claiming…'));
 await click(a.confirm());await click(a.confirm());
 assert.equal(posts.length,2,'Rendered disabled confirmation ignores repeated clicks');
 assert.equal(a.button('subtle').props.disabled,true);
 click(a.nodes(n=>n.type==='button'&&textOf(n)==='Back to names')[0]);click(a.nodes(n=>n.props?.['aria-label']==='Close claim chooser')[0]);
 a.nodes(n=>n.props?.className==='modal-backdrop')[0].props.onClick();escape(a);
 assert.equal(a.states[slots.picker],true);assert.deepEqual(a.states[slots.claim],taylor);
 release(Response.json({error:'This name is already claimed by another account.'},{status:409}));await pending;postHandler=undefined;
 assert.equal(a.states[slots.busy],false);assert.equal(a.states[slots.picker],true);assert.deepEqual(a.states[slots.claim],taylor);
 assert(a.html().includes('This name is already claimed by another account.'));
 assert.equal(a.states[slots.toast],'','Rejected claim never reports success');
 assert.deepEqual(serverData.players,[manual],'Rejected claim leaves mocked server data unchanged');
 click(a.nodes(n=>n.type==='button'&&textOf(n)==='Back to names')[0]);assert.equal(a.states[slots.error],'');assert.equal(a.states[slots.claim],null);

 // Existing own controls and organizer roster tools are preserved.
 html=app({players:[{...manual,user:'me',manual:0}],claims:[{...taylor,mine:true}],filter:'mine'}).html();
 for(const expected of ['id="test"',' YOU','You’re in','Leave session'])assert(html.includes(expected),expected);
 assert(!html.includes('Edit Taylor'));assert(!html.includes('YOU MANAGE THIS SESSION'));
 html=app({filter:'mine'}).html();assert(!html.includes('id="test"'));assert(html.includes('Use “Claim my name” at the top'));
 html=app({owner:true}).html();
 for(const expected of ['Edit Taylor','Remove Taylor','YOU MANAGE THIS SESSION','Add player','Cancel session'])assert(html.includes(expected),expected);
 assert(!html.includes('This is me'));assert(!html.includes('claim-player'));
 html=app({owner:true,players:[{...manual,user:'me',manual:0}],claims:[{...taylor,mine:true}]}).html();
 assert(!html.includes('Edit Taylor'));assert(!html.includes('Remove Taylor'));assert(html.includes('YOU MANAGE THIS SESSION'));

 // Permanent bindings have owner-only, explicitly confirmed exception controls.
 const ownerAdmin={claims:[{...taylor,user:'account-old',revision:'revision-taylor-1'},{key:'alex',name:'Alex',user:'account-bound',revision:'revision-alex-1'}],accounts:[{id:'account-old',name:'Taylor'},{id:'account-bound',name:'Alex'},{id:'account-target-1',name:'Casey'},{id:'account-target-2',name:'Casey'}]};
 const ownerApp=()=>app({user:{id:'board-owner',name:'Owner'},claimPicker:true,claims:ownerAdmin.claims.map(({key,name})=>({key,name,mine:false})),admin:structuredClone(ownerAdmin)});
 const blankAdmin={key:'',user:'',revision:'',mode:'unbind',target:'',confirmed:false};
 for(const options of [{},{owner:true},{user:{id:'not-the-owner',name:'Owner'}},{user:null,admin:ownerAdmin}]){
  a=app({...options,claimPicker:true});
  assert(!a.html().includes('Owner controls'));
  assert.equal(a.control('Name binding'),undefined,'Session management/display name cannot expose board-owner controls');
  assert.equal(a.adminSubmit(),undefined);
 }
 const ownerStart=posts.length;
 a=ownerApp();serverData=structuredClone(a.states[slots.data]);
 assert(a.html().includes('Owner controls'));assert.equal(a.control('Name binding').props.value,'');
 assert.equal(a.control('Binding change'),undefined);assert.equal(a.checkbox(),undefined);assert.equal(a.adminSubmit(),undefined);
 change(a.control('Name binding'),'taylor');
 assert.deepEqual(a.states[slots.adminEdit],{key:'taylor',user:'account-old',revision:'revision-taylor-1',mode:'unbind',target:'',confirmed:false});
 assert(a.html().includes('Current account: account-old'));
 assert.equal(a.adminSubmit().props.disabled,true);
 await a.adminSubmit().props.onClick();assert.equal(posts.length,ownerStart,'Handler also refuses missing explicit confirmation');
 for(const expected of ['This releases the name for anyone to claim again.','Every current matching-name signup, including past and cancelled sessions, becomes unclaimed.','All signup names, attendance statuses and order stay the same.','Differently named signups on the previous account stay with that account.','Conflicts stop the whole change.'])assert(a.html().includes(expected),expected);
 check(a);assert.equal(a.adminSubmit().props.disabled,false);
 change(a.control('Binding change'),'transfer');
 assert.equal(a.checkbox().props.checked,false,'Changing mode clears confirmation');assert.equal(a.adminSubmit().props.disabled,true);
 assert.equal(a.control('Transfer to account').props.value,'','A target is never chosen automatically');
 const targets=a.control('Transfer to account').props.children.flat(Infinity).filter(n=>n?.type==='option');
 assert.deepEqual(targets.map(n=>n.props.value),['','account-target-1','account-target-2']);
 assert.equal(textOf(targets[1]),'Casey · account-target-1');assert.equal(textOf(targets[2]),'Casey · account-target-2');
 assert(a.html().includes('Check the account ID; display names are not proof of identity.'));
 for(const expected of ['every current matching-name signup, including past and cancelled sessions, to the chosen account.','Future matching signups will link to that account.','Differently named signups on the previous account stay with that account.'])assert(a.html().includes(expected),expected);
 check(a);assert.equal(a.adminSubmit().props.disabled,true,'Checkbox alone cannot select the transfer destination');
 await a.adminSubmit().props.onClick();assert.equal(posts.length,ownerStart);
 change(a.control('Transfer to account'),'account-target-1');assert.equal(a.checkbox().props.checked,false);
 check(a);assert.equal(a.adminSubmit().props.disabled,false);assert(a.html().includes('to account account-target-1 with the scope above.'));
 change(a.control('Transfer to account'),'account-target-2');assert.equal(a.checkbox().props.checked,false,'Changing target clears confirmation');
 check(a);change(a.control('Name binding'),'alex');
 assert.equal(a.checkbox().props.checked,false,'Changing selected binding clears confirmation');
 assert.equal(a.states[slots.adminEdit].target,'');assert.equal(a.states[slots.adminEdit].mode,'unbind');
 change(a.control('Name binding'),'');assert.equal(a.adminSubmit(),undefined);
 assert.equal(posts.length,ownerStart,'Selecting names, actions, targets and checkboxes never changes ownership');

 // Refreshed ownership/revision must match the explicit selection before sending.
 for(const changed of ['revision','owner','removed','admin-removed']){
  a=ownerApp();change(a.control('Name binding'),'taylor');check(a);
  serverData=structuredClone(a.states[slots.data]);
  if(changed==='revision')serverData.admin.claims[0].revision='revision-taylor-2';
  if(changed==='owner')serverData.admin.claims[0].user='new-owner';
  if(changed==='removed')serverData.admin.claims=serverData.admin.claims.filter(c=>c.key!=='taylor');
  if(changed==='admin-removed')delete serverData.admin;
  await a.control('Refresh board').props.onClick();
  if(changed==='removed'||changed==='admin-removed')assert.equal(a.adminSubmit(),undefined);
  else{
   assert(a.html().includes('This binding changed. Choose the name again before confirming.'));
   assert.equal(a.checkbox().props.disabled,true);assert.equal(a.adminSubmit().props.disabled,true);
   await a.adminSubmit().props.onClick();
   change(a.control('Name binding'),'taylor');assert.equal(a.checkbox().props.checked,false);
   assert.equal(a.states[slots.adminEdit].revision,serverData.admin.claims[0].revision);
  }
 }
 assert.equal(posts.length,ownerStart,'Stale revision/account selections never submit');

 // Keyboard traversal must reach the new owner selects before wrapping focus.
 a=ownerApp();
 const oldDocument=globalThis.document;
 try{
  let focused='',prevented=false;
  const closeControl={focus(){focused='close'}},searchControl={focus(){focused='search'}},nameSelect={focus(){focused='name-select'}};
  globalThis.document={activeElement:searchControl};
  const tabEvent={key:'Tab',shiftKey:false,preventDefault(){prevented=true},currentTarget:{querySelectorAll(selector){return selector.includes('select:not(:disabled)')?[closeControl,searchControl,nameSelect]:[closeControl,searchControl]}}};
  a.dialog().props.onKeyDown(tabEvent);
  assert.equal(prevented,false,'Tab from search must be able to reach the owner name select');
  globalThis.document.activeElement=nameSelect;a.dialog().props.onKeyDown(tabEvent);
  assert.equal(prevented,true);assert.equal(focused,'close','Tab wraps only after the owner select');
  prevented=false;globalThis.document.activeElement=closeControl;a.dialog().props.onKeyDown({...tabEvent,shiftKey:true});
  assert.equal(prevented,true);assert.equal(focused,'name-select','Shift+Tab can reach the owner select');
 }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument}

 // Cancelling an owner change must not submit or retain an armed confirmation.
 for(const dismissal of ['close','backdrop','escape']){
  a=ownerApp();change(a.control('Name binding'),'taylor');change(a.control('Binding change'),'transfer');change(a.control('Transfer to account'),'account-target-1');check(a);
  if(dismissal==='close')click(a.control('Close claim chooser'));
  else if(dismissal==='backdrop')a.nodes(n=>n.props?.className==='modal-backdrop')[0].props.onClick();
  else escape(a);
  assert.equal(a.states[slots.picker],false);assert.equal(a.dialog(),undefined);
  click(a.button('claim-entry'));
  assert.deepEqual(a.states[slots.adminEdit],blankAdmin,'Reopening must require a fresh owner selection and confirmation');
  assert.equal(a.adminSubmit(),undefined);
 }
 assert.equal(posts.length,ownerStart,'Cancelled owner changes never submit');

 // Both override actions send the exact selected identity and revision once.
 for(const mode of ['unbind','transfer']){
  a=ownerApp();serverData=structuredClone(a.states[slots.data]);
  const before=structuredClone(serverData.players),previous=posts.length;
  change(a.control('Name binding'),'taylor');
  if(mode==='transfer'){change(a.control('Binding change'),'transfer');change(a.control('Transfer to account'),'account-target-2')}
  check(a);
  postHandler=()=>{
   if(mode==='unbind'){serverData.admin.claims=serverData.admin.claims.filter(c=>c.key!=='taylor');serverData.claims=serverData.claims.filter(c=>c.key!=='taylor')}
   else serverData.admin.claims[0]={...serverData.admin.claims[0],user:'account-target-2',revision:'revision-taylor-2'};
   return Response.json({ok:true});
  };
  await click(a.adminSubmit());postHandler=undefined;
  assert.deepEqual(posts[previous],{action:'overrideName',key:'taylor',expectedUser:'account-old',expectedRevision:'revision-taylor-1',mode,target:mode==='transfer'?'account-target-2':'',confirm:true});
  assert.equal(posts.length,previous+1);assert.deepEqual(a.states[slots.adminEdit],blankAdmin);
  assert(a.html().includes('Name binding updated. Signup details were preserved.'));
  assert.equal(a.adminSubmit(),undefined);assert.equal(a.states[slots.picker],true);
  assert.deepEqual(serverData.players,before,'UI test does not modify signup details');
 }

 // Owner requests also guard repeated clicks and show errors without success.
 a=ownerApp();serverData=structuredClone(a.states[slots.data]);change(a.control('Name binding'),'taylor');check(a);
 const ownerPendingStart=posts.length;
 let releaseOwner;postHandler=()=>new Promise(resolve=>{releaseOwner=resolve});
 const ownerPending=click(a.adminSubmit());
 assert.equal(posts.length,ownerPendingStart+1);assert.equal(a.adminSubmit().props.disabled,true);
 for(const label of ['Name binding','Binding change'])assert.equal(a.control(label).props.disabled,true);
 assert.equal(a.checkbox().props.disabled,true);await click(a.adminSubmit());escape(a);
 assert.equal(posts.length,ownerPendingStart+1);assert.equal(a.states[slots.picker],true);
 releaseOwner(Response.json({error:'This binding changed. Refresh and try again.'},{status:409}));await ownerPending;postHandler=undefined;
 assert(a.html().includes('This binding changed. Refresh and try again.'));assert.equal(a.states[slots.toast],'');
 assert.equal(a.states[slots.busy],false);assert.equal(a.states[slots.picker],true);

 // Optional local-only rendered fixtures for visual inspection.
 if(process.env.RALLY_UI_FIXTURES){
  const path=process.env.RALLY_UI_FIXTURES;mkdirSync(path,{recursive:true});
  const css=readFileSync('app/globals.css','utf8').replace("@import 'tailwindcss';",'');
  const fixture=(filename,options)=>writeFileSync(path+'/'+filename,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body>'+app(options).html()+'</body></html>');
  fixture('board.html',{players:[manual,{...manual,user:'manual-b',name:'Alex'},{...manual,user:'manual-c',name:'Casey',status:'tentative'},{...manual,user:'manual-d',name:'Drew',status:'standby'}]});
  fixture('chooser.html',{claimPicker:true,sessions:groupedSessions,players:groupedPlayers});
  fixture('confirmation.html',{claimPicker:true,claim:taylor,sessions:groupedSessions,players:groupedPlayers});
 }
 console.log('PASS: one header claim entry; normalized exact-name groups; past/cancelled coverage; nickname separation; reservations/conflicts/duplicates; auth gate; own claim; two-step name-wide submission; refresh-invalidated selection; Back/Close/backdrop/Escape; busy/repeated-click prevention; server rejection; own controls and organizer tools preserved; permanent binding; owner-only explicit unbind/transfer; exact target/revision; stale override block; owner cancellation/busy/rejection. All fetches isolated.');
}finally{globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout}

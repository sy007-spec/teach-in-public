import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';import {testMaterial,source} from './fixtures/markdown.mjs';import {testEmbedding} from './fixtures/embedding.mjs';
import {splitTrainingLanguages} from '../src/markdown-import.mjs';
import {pathToFileURL} from 'node:url';
import {dayKey} from '../src/security.mjs';
// The classroom assistant needs the private lark-feishu-assist module, which the hosting platform injects.
// Point LARK_FEISHU_ASSIST at its src/index.mjs to run these tests (the hosting repository does); otherwise they are skipped.
const libPath=process.env.LARK_FEISHU_ASSIST;
const lib=libPath&&fs.existsSync(libPath)?await import(pathToFileURL(path.resolve(libPath)).href):null;
const skip=lib?false:'set LARK_FEISHU_ASSIST to the private lark-feishu-assist module';

// Synthetic values assembled at run time; no real credentials.
const encryptKey=['enc','test','key'].join('-'),verificationToken=['vt','test','token'].join('-');
const phone='1'+'3912345678';

function fakeLark(){
 const sent=[],removed=new Set();
 const fetch=async(url,init={})=>{const u=new URL(url),body=init.body?JSON.parse(init.body):undefined,p=u.pathname;
  // App IDs starting with cli_lark only exist on Lark, so Feishu rejects them (platform detection).
  if(p.endsWith('/tenant_access_token/internal'))return u.origin==='https://open.feishu.cn'&&String(body?.app_id).startsWith('cli_lark')?Response.json({code:10014,msg:'app not found'}):Response.json({code:0,tenant_access_token:'t',expire:7200});
  if(p==='/open-apis/im/v1/chats/oc_class01')return Response.json({code:0,data:{name:'外汇入门 1 班',external:false,owner_id_type:'open_id',owner_id:'ou_owner'}});
  if(p==='/open-apis/im/v1/chats/oc_class01/members'){const union=u.searchParams.get('member_id_type')==='union_id';return Response.json({code:0,data:{items:[['ou_owner','on_owner','王老师'],['ou_m1','on_m1','学员甲'],['ou_m2','on_m2','学员乙']].filter(([id])=>!removed.has(id)).map(([o,n,name])=>({member_id:union?n:o,name})),has_more:false}})}
  if(p==='/open-apis/bot/v3/info')return Response.json({code:0,bot:{open_id:'ou_bot',app_name:'课堂助手'}});
  if(p==='/open-apis/tenant/v2/tenant/query')return Response.json({code:0,data:{tenant:{tenant_key:'tk',name:'Org'}}});
  if(p==='/open-apis/im/v1/chats')return Response.json({code:0,data:{items:[{chat_id:'oc_class01',name:'外汇入门 1 班',external:false},{chat_id:'oc_extern1',name:'外部群',external:true}],has_more:false}});
  // Group history: discussion, a cloud document, a wiki page, an attachment, an unshared document and a spreadsheet.
  if((init.method||'GET')==='GET'&&p==='/open-apis/im/v1/messages'){const t=String(Date.now()-3600000),msg=(id,type,content,from='ou_m1')=>({message_id:id,msg_type:type,create_time:t,sender:{id:from,id_type:'open_id',sender_type:'user'},body:{content:JSON.stringify(content)}});
   return Response.json({code:0,data:{has_more:false,items:[msg('om_h1','text',{text:'止损单要设在关键支撑位下方'}),msg('om_h2','text',{text:'课程大纲在这里 https://example.feishu.cn/docx/DocOutline001'}),msg('om_h3','file',{file_key:'file_v3_handout',file_name:'讲义.md'}),msg('om_h4','text',{text:'参考 https://example.feishu.cn/wiki/WikiRisk00001 和 https://example.feishu.cn/docx/DocPrivate01'}),msg('om_h5','text',{text:'成绩表 https://example.feishu.cn/sheets/SheetScore01'}),msg('om_h6','text',{text:'机器人消息'},'ou_bot')]}})}
  if(p==='/open-apis/docx/v1/documents/DocOutline001')return Response.json({code:0,data:{document:{title:'课程大纲',revision_id:3}}});
  if(p==='/open-apis/docx/v1/documents/DocOutline001/raw_content')return Response.json({code:0,data:{content:'第一课 止损单\n第二课 限价单\n第三课 杠杆与保证金'}});
  if(p==='/open-apis/wiki/v2/spaces/get_node')return Response.json({code:0,data:{node:{obj_type:'docx',obj_token:'DocRiskWiki1',title:'风险提示'}}});
  if(p==='/open-apis/docx/v1/documents/DocRiskWiki1')return Response.json({code:0,data:{document:{title:'风险提示'}}});
  if(p==='/open-apis/docx/v1/documents/DocRiskWiki1/raw_content')return Response.json({code:0,data:{content:'强平风险：保证金低于维持比例时会被强制平仓。'}});
  if(p==='/open-apis/sheets/v3/spreadsheets/SheetScore01')return Response.json({code:0,data:{spreadsheet:{title:'练习题'}}});
  if(p==='/open-apis/sheets/v3/spreadsheets/SheetScore01/sheets/query')return Response.json({code:0,data:{sheets:[{sheet_id:'s1',title:'第一课',resource_type:'sheet'}]}});
  if(p==='/open-apis/sheets/v2/spreadsheets/SheetScore01/values/s1')return Response.json({code:0,data:{valueRange:{values:[['题目','答案'],['止损单何时触发','价格触及止损价'],[null,'']]}}});
  if(p.startsWith('/open-apis/docx/v1/documents/DocPrivate01'))return Response.json({code:1770032,msg:'forbidden'},{status:403});
  if(p==='/open-apis/im/v1/messages/om_h3/resources/file_v3_handout')return new Response('# 讲义\n\n限价单在指定价格或更优价格成交。',{headers:{'content-type':'application/octet-stream'}});
  if(init.method==='POST'&&p.startsWith('/open-apis/im/v1/messages')){sent.push({path:p,origin:u.origin,body});return Response.json({code:0,data:{message_id:'om_sent'+sent.length}})}
  return Response.json({code:404,msg:'unexpected '+p},{status:404});
 };
 return {fetch,sent,removeMember:id=>removed.add(id)};
}

// Stand-in for the official SDK's long connection: records options and exposes the registered handlers.
function fakeSdk(){const state={};return {state,sdk:{Domain:{Feishu:'feishu-domain',Lark:'lark-domain'},LoggerLevel:{fatal:0},EventDispatcher:class{register(h){state.handlers=h;return this}},WSClient:class{constructor(o){state.options=o;state.closed=false}start(){state.started=true}close(){state.closed=true}}}}}

async function fixture({sdk}={}){
 let collectionOwner=null;
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'lark-classroom-')),lark=fakeLark();let aiCalls=0;
 let addon=true;const hosting={collectionOwner:()=>collectionOwner,allowLegacyAdmin:true,status:()=>({active:true,tier:'advanced',limits:{globalModel:true,courses:null},addons:{larkAssistant:addon}}),globalModel:async()=>({baseURL:'https://example.test/v1',model:'test',key:['model','key'].join('-')})};
 const app=createApp({runtime,seedMaterial:testMaterial(),scheduler:false,hosting,larkAssist:lib,larkSdk:sdk,briefSchedule:()=>{},embedding:testEmbedding,larkFetch:lark.fetch,aiFetch:async()=>{aiCalls++;return Response.json({choices:[{message:{content:JSON.stringify(Object.fromEntries(splitTrainingLanguages(source()).map(f=>[f.language,f.markdown])))},finish_reason:'stop'}],usage:{total_tokens:10}})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let csrf='';const jar={};
 const call=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar[k]=v}const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}if(data?.csrf)csrf=data.csrf;return {status:r.status,data,headers:r.headers}};
 await call('/api/session');const password=fs.readFileSync(path.join(runtime,'admin-access.txt'),'utf8').match(/Password: (.*)/)[1];assert.equal((await call('/api/admin/login','POST',{username:'admin',password})).status,200);
 let n=0;
 const deliver=async(type,event)=>{const payload={schema:'2.0',header:{event_id:'ev-'+(++n),event_type:type,token:verificationToken,create_time:String(Date.now())},event};const raw=JSON.stringify({encrypt:lib.encryptPayload(payload,encryptKey)}),ts=String(Math.floor(Date.now()/1000)),nonce='n'+n;
  return fetch(base+'/api/lark/callback',{method:'POST',headers:{'content-type':'application/json','x-lark-request-timestamp':ts,'x-lark-request-nonce':nonce,'x-lark-signature':lib.signature(ts,nonce,encryptKey,raw)},body:raw})};
 let m=0;
 const say=(text,o={})=>deliver('im.message.receive_v1',{sender:{sender_id:{open_id:o.from||'ou_learner1'},sender_type:'user',tenant_key:'tk'},message:{message_id:o.id||'om_in'+(++m),chat_id:o.chat||'oc_class01',chat_type:'group',message_type:'text',create_time:String(o.time||Date.now()),content:JSON.stringify({text:o.at?'@_user_1 '+text:text}),mentions:o.at?[{key:'@_user_1',id:{open_id:'ou_bot'},name:'课堂助手'}]:[]}});
 const until=async(check,label)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10))}assert.fail('timed out: '+label)};
 return {app,store:app.store,call,deliver,say,until,lark,aiCalls:()=>aiCalls,base,setCollectionOwner:v=>{collectionOwner=v},setAddon:v=>{addon=v},async close(){await app.close();fs.rmSync(runtime,{recursive:true,force:true})}};
}

test('classroom group discussion becomes a cleaned course source and an unpublished draft',{skip},async()=>{const f=await fixture();try{
 // The course key description keeps the digest on topic.
 assert.equal((await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'外汇保证金交易入门：止损单、限价单、杠杆、保证金与强平风险。',en:'Forex margin trading basics.',auto:false})).status,200);
 // Credentials are verified against the selected region before they are saved.
 assert.equal((await f.call('/api/admin/lark','PUT',{region:'lark',appId:'cli_test',appSecret:['s','e','c'].join(''),encryptKey,verificationToken,adminOpenIds:['ou_teacher']})).status,200);
 const settings=(await f.call('/api/admin/lark')).data;assert.equal(settings.botName,'课堂助手');assert.equal(settings.appSecret,undefined);
 // Setup guide manifest with the callback URL ready to copy.
 const manifest=(await f.call('/api/admin/lark/setup')).data;
 assert.equal(manifest.platform,'lark');assert.equal(manifest.delivery,'webhook');assert.equal(manifest.eventUrl,'http://127.0.0.1:3140/api/lark/callback'.replace('http://127.0.0.1:3140',manifest.eventUrl.split('/api/')[0]));
 assert.ok(manifest.scopes.includes('im:message.group_msg'));assert.equal(manifest.credentialsDone,true);
 assert.match((await f.call('/lark-setup.js')).headers.get('content-type'),/javascript/);
 // The bot's chats are discovered; an external chat cannot become a classroom.
 const listed=(await f.call('/api/admin/lark/classrooms?refresh=1')).data;assert.deepEqual(listed.classrooms.map(c=>c.chat_id).sort(),['oc_class01','oc_extern1']);
 assert.equal((await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_extern1',courseId:'pamm'})).status,409);
 assert.equal((await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_class01',courseId:'pamm'})).status,200);
 // Discussion, noise, personal data, a question to the bot, a command and a recalled message.
 // Keep both discussion topics on one completed day, including around midnight.
 const day=dayKey(new Date(Date.now()-86400000)),t0=Date.parse(day+'T12:00:00+08:00');
 await f.say('老师，止损单和限价单有什么区别？',{time:t0});await f.say('好的',{time:t0+1000});await f.say('👍',{time:t0+2000});
 await f.say('止损单在价格触及后转为市价单成交',{from:'ou_learner2',time:t0+3000});
 await f.say('有问题联系我 '+phone,{from:'ou_learner2',time:t0+4000});
 await f.say('保证金不足时会怎样',{at:true,time:t0+5000});
 await f.say('课堂',{at:true,id:'om_cmd',time:t0+6000});
 await f.say('这条发错了',{id:'om_recall',time:t0+7000});
 await f.deliver('im.message.recalled_v1',{message_id:'om_recall',chat_id:'oc_class01'});
 await f.say('周末一起去爬山吗',{from:'ou_learner3',time:t0-7200000});await f.say('我报名',{from:'ou_learner4',time:t0-7140000});
 await f.say('无关群的消息',{chat:'oc_other99'});
 await f.until(()=>f.lark.sent.length>=2&&f.store.get("SELECT deleted FROM lark_classroom_messages WHERE message_id='om_recall'")?.deleted===1&&f.store.get("SELECT 1 FROM lark_classrooms WHERE chat_id='oc_other99'"),'events processed');
 assert.ok(f.lark.sent.every(s=>s.origin==='https://open.larksuite.com'),'region honoured');
 const reply=f.lark.sent.find(s=>s.path.endsWith('/reply')&&s.body.msg_type==='text');assert.match(JSON.parse(reply.body.content).text,/本群尚无可用的已发布课程/);
 const card=f.lark.sent.find(s=>s.path==='/open-apis/im/v1/messages/om_cmd/reply');assert.equal(card.body.msg_type,'interactive');
 assert.equal(f.store.get("SELECT status FROM lark_classrooms WHERE chat_id='oc_other99'").status,'pending','unbound chats are listed for binding, not collected');
 assert.equal(f.store.get("SELECT COUNT(*) n FROM lark_classroom_messages WHERE chat_id='oc_other99'").n,0);
 // Replayed delivery of the same message is not stored twice.
 const before=f.store.get('SELECT COUNT(*) n FROM lark_classroom_messages').n;await f.say('止损单在价格触及后转为市价单成交',{id:'om_in4',from:'ou_learner2',time:t0+3000});await new Promise(r=>setTimeout(r,50));
 assert.equal(f.store.get('SELECT COUNT(*) n FROM lark_classroom_messages').n,before);
 // Digest + draft.
 const first=(await f.call('/api/admin/lark/classrooms/digest','POST',{chatId:'oc_class01',day,draft:true})).data;
 assert.equal(first.digest.state,'saved');assert.equal(first.draft.state,'drafted',JSON.stringify(first.draft));assert.equal(first.draft.replaced,false);
 const doc=f.store.get("SELECT * FROM preparation_documents WHERE course_id='pamm' AND kind='reference'");
 assert.match(doc.raw,/止损单和限价单/);assert.match(doc.raw,/保证金不足/);assert.doesNotMatch(doc.raw,new RegExp(phone));assert.doesNotMatch(doc.raw,/这条发错了|好的|👍|ou_learner/);
 assert.match(doc.raw,/参与者A/);assert.doesNotMatch(doc.raw,/爬山/,'off-topic discussion is left out by the key description');assert.match(doc.raw,/关键说明范围外/);assert.equal(doc.source_ref.startsWith('lark:oc_class01:'),true);
 const course=()=>({...f.store.get("SELECT draft,published FROM courses WHERE id='pamm'")});assert.deepEqual(course(),{draft:2,published:1});
 // Nothing new → unchanged; new discussion → same source updated and the classroom's own draft replaced, still unpublished.
 assert.equal((await f.call('/api/admin/lark/classrooms/digest','POST',{chatId:'oc_class01',day})).data.digest.state,'unchanged');
 await f.say('杠杆比例越高，强平风险越大',{from:'ou_learner3',time:t0+8000});await f.until(()=>f.store.get('SELECT COUNT(*) n FROM lark_classroom_messages WHERE text LIKE ?','%强平%').n===1,'new message');
 const second=(await f.call('/api/admin/lark/classrooms/digest','POST',{chatId:'oc_class01',day,draft:true})).data;
 assert.equal(second.digest.documentId,first.digest.documentId);assert.equal(second.draft.replaced,true);assert.deepEqual(course(),{draft:2,published:1});
 assert.equal(f.store.get("SELECT COUNT(*) n FROM preparation_documents WHERE kind='reference'").n,1);
 assert.equal(f.aiCalls(),2);
 // Card approval callbacks keep working next to classroom events.
 assert.equal((await f.deliver('card.action.trigger',{operator:{open_id:'ou_outsider'},action:{value:{action:'approve',requestId:'x'}}})).status,403);
}finally{await f.close()}});

test('without the paid add-on the classroom assistant stays off and free cards keep working',{skip},async()=>{const f=await fixture();try{
 f.setAddon(false);
 assert.equal((await f.call('/api/admin/lark')).data.assistant.enabled,false);
 assert.equal((await f.call('/api/admin/lark/setup')).status,403);
 assert.equal((await f.call('/api/admin/lark/classrooms')).status,403);
 assert.equal((await f.call('/api/admin/lark','PUT',{encryptKey,verificationToken})).status,200);
 assert.equal((await f.say('课堂讨论')).status,200);await new Promise(r=>setTimeout(r,50));
 assert.equal(f.store.get("SELECT COUNT(*) n FROM lark_classroom_messages").n,0);
}finally{await f.close()}});

test('only App ID and App Secret: platform detected, long connection, owner is the admin, members form the roster',{skip},async()=>{const ws=fakeSdk(),f=await fixture({sdk:ws.sdk});try{
 // Nothing but the two credentials: the Lark platform is detected and the bot verified; daily cards need no recipient list.
 const saved=await f.call('/api/admin/lark','PUT',{appId:'cli_lark_only',appSecret:['s','e','c'].join(''),enabled:true});
 assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.region,'lark');assert.equal(saved.data.botName,'课堂助手');
 const settings=(await f.call('/api/admin/lark')).data;assert.equal(settings.assistant.longConnection,true);
 const manifest=(await f.call('/api/admin/lark/setup')).data;assert.equal(manifest.delivery,'long_connection');assert.equal(manifest.eventUrl,null);assert.ok(!manifest.steps.some(x=>x.id==='encryption'));
 // The long connection opens on the detected platform and also listens for member changes.
 assert.equal(f.app.classroom.connect().state,'started');assert.equal(ws.state.options.domain,'lark-domain');assert.equal(ws.state.options.appId,'cli_lark_only');
 assert.ok(ws.state.handlers['im.chat.member.user.added_v1']&&ws.state.handlers['card.action.trigger']);
 let e=0;const push=(type,body)=>ws.state.handlers[type]({event_id:'ws-'+(++e),...body});
 await push('im.chat.member.bot.added_v1',{chat_id:'oc_class01',name:'外汇入门 1 班',external:false});
 assert.equal(f.store.get("SELECT status FROM lark_classrooms WHERE chat_id='oc_class01'").status,'pending');
 // Linking the group to a course reads the owner and members at once.
 const bound=(await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_class01',courseId:'pamm'})).data;
 assert.equal(bound.owner_open_id,'ou_owner');assert.equal(bound.owner_name,'王老师');
 assert.deepEqual((await f.call('/api/admin/lark/classrooms/members?chatId=oc_class01')).data.members.map(m=>m.name),['学员乙','学员甲','王老师'].sort());
 assert.deepEqual((await f.call('/api/admin/lark')).data.assistant.owners,[{name:'王老师',id:'ou_owner'}]);
 // Members signed in with Feishu/Lark may read the course (open_id of this app, or union_id from another app of the tenant).
 assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m1'}),true);assert.equal(f.app.classroom.allows('pamm',{lark_union:'on_m2'}),true);
 assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_stranger'}),false);assert.equal(f.app.classroom.allows('other',{lark_id:'ou_m1'}),false);
 // Joins and leaves arrive over the connection and update the roster.
 await push('im.chat.member.user.added_v1',{chat_id:'oc_class01',users:[{name:'新同学',user_id:{open_id:'ou_new',union_id:'on_new'}}]});
 assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_new'}),true);
 await push('im.chat.member.user.deleted_v1',{chat_id:'oc_class01',users:[{name:'学员甲',user_id:{open_id:'ou_m1',union_id:'on_m1'}}]});
 assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m1'}),false);
 // The owner receives the daily card and may use its buttons; other people may not.
 const synced=await f.app.lark.sync(true);assert.deepEqual(synced.recipients.map(r=>r.destination),['open_id:ou_owner']);
 const card=f.lark.sent.find(x=>x.body?.receive_id==='ou_owner');assert.equal(card.origin,'https://open.larksuite.com');assert.equal(card.body.msg_type,'interactive');
 const denied=await push('card.action.trigger',{operator:{open_id:'ou_m2'},action:{value:{action:'range',from:'2026-11-01',to:'2026-11-07'}}});assert.equal(denied.toast.type,'error');
 const allowed=await push('card.action.trigger',{operator:{open_id:'ou_owner'},action:{value:{action:'range',from:'2026-11-01',to:'2026-11-07'}}});assert.equal(allowed.card?.type,'raw',JSON.stringify(allowed));
 // Markdown form values and message binding survive the SDK long-connection path.
 const author=f.store.get('SELECT id FROM users LIMIT 1').id,qid='ws-card-question';
 f.store.run('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',qid,'pamm','manager-01',author,null,qid,'Question from web',0,0,0,f.store.now(),1,'discussion');
 f.app.questionCards.enqueue(qid);await f.app.questionCards.tick();
 const row=f.store.get('SELECT * FROM lark_question_cards WHERE question_id=?',qid),rendered=f.app.questionCards.render(row);
 const action=rendered.body.elements.find(e=>e.tag==='form').elements.find(e=>e.name==='publish').behaviors[0].value;
 const submitted=await push('card.action.trigger',{operator:{open_id:'ou_owner'},context:{open_message_id:row.message_id},action:{value:action,form_value:{reply_0:'**SDK reply**',reply_1:'',reply_2:'',reply_3:''}}});
 assert.equal(submitted.toast.type,'success');assert.equal(f.store.get('SELECT q.body FROM lark_question_replies r JOIN questions q ON q.id=r.reply_id WHERE r.question_id=?',qid).body,'**SDK reply**');
 // Unlinking removes both the admin role and the roster access.
 await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_class01',courseId:null});
 assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m2'}),false);assert.deepEqual(f.app.classroom.owners(),[]);
 // Changed credentials reopen the connection; turning the add-on off is handled by the scheduler.
 f.app.classroom.disconnect();assert.equal(ws.state.closed,true);
}finally{await f.close()}});

test('一键备课: group history, shared documents and attachments become course sources and a draft',{skip},async()=>{const ws=fakeSdk(),f=await fixture({sdk:ws.sdk});try{
 assert.equal((await f.call('/api/admin/lark','PUT',{appId:'cli_feishu_app',appSecret:['s','e','c'].join('')})).status,200);
 f.app.classroom.connect();let e=0;const push=(type,body)=>ws.state.handlers[type]({event_id:'ws-'+(++e),...body});
 assert.equal((await f.call('/api/admin/lark/classrooms/prepare','POST',{chatId:'oc_class01'})).status,409,'only linked groups');
 await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_class01',courseId:'pamm'});
 const before=f.store.get("SELECT draft FROM courses WHERE id='pamm'").draft;
 assert.equal((await f.call('/api/admin/lark/classrooms/prepare','POST',{chatId:'oc_class01'})).status,202);
 const state=()=>JSON.parse(f.store.get("SELECT prepare_state FROM lark_classrooms WHERE chat_id='oc_class01'").prepare_state||'{}');
 for(let i=0;i<500&&state().state==='running';i++)await new Promise(r=>setTimeout(r,20));
 const p=state();assert.equal(p.state,'done',JSON.stringify(p));
 assert.equal(p.messages,5,'bot messages are left out');assert.equal(p.documents,4);assert.equal(p.documentsFailed,1);assert.equal(p.documentsSkipped,0);assert.equal(p.draft,'drafted');
 const docs=f.store.all("SELECT title,raw FROM preparation_documents WHERE course_id='pamm' AND kind='reference'");
 const by=t=>docs.find(d=>d.title===t)?.raw||'';
 assert.match(by('飞书资料 · 课程大纲'),/第三课 杠杆与保证金/);assert.match(by('飞书资料 · 风险提示'),/强制平仓/);assert.match(by('飞书资料 · 讲义.md'),/限价单在指定价格/);
 assert.ok(docs.some(d=>/止损单要设在关键支撑位/.test(d.raw)),'history discussion is digested');
 assert.ok(f.store.get("SELECT draft FROM courses WHERE id='pamm'").draft>before,'a course draft was generated');
 const sources=(await f.call('/api/admin/lark/classrooms/sources?chatId=oc_class01')).data.sources;
 assert.match(sources.find(x=>x.ref==='doc:docx:DocPrivate01').error,/分享/);assert.equal(sources.find(x=>x.ref==='doc:sheets:SheetScore01').status,'saved');assert.match(by('飞书资料 · 练习题'),/\| 止损单何时触发 \| 价格触及止损价 \|/);
 // Running again re-reads documents but does not duplicate sources.
 const count=docs.length;await f.app.classroom.prepare('oc_class01');assert.equal(f.store.get("SELECT COUNT(*) n FROM preparation_documents WHERE course_id='pamm' AND kind='reference'").n,count);
 // A document shared later is queued live and read by the scheduler's ingest step.
 await push('im.message.receive_v1',{sender:{sender_id:{open_id:'ou_m2'},sender_type:'user'},message:{message_id:'om_live1',chat_id:'oc_class01',chat_type:'group',message_type:'text',create_time:String(Date.now()),content:JSON.stringify({text:'补充 https://example.feishu.cn/wiki/WikiRisk00001'})}});
 await push('im.message.receive_v1',{sender:{sender_id:{open_id:'ou_m2'},sender_type:'user'},message:{message_id:'om_live2',chat_id:'oc_class01',chat_type:'group',message_type:'file',create_time:String(Date.now()),content:JSON.stringify({file_key:'file_v3_handout',file_name:'讲义.md'})}});
 assert.equal(f.store.get("SELECT COUNT(*) n FROM lark_classroom_sources WHERE chat_id='oc_class01'").n,5,'already known materials are not queued twice');
 // Only the owner may start it from the group.
 await push('im.message.receive_v1',{sender:{sender_id:{open_id:'ou_m2'},sender_type:'user'},message:{message_id:'om_cmd2',chat_id:'oc_class01',chat_type:'group',message_type:'text',create_time:String(Date.now()),content:JSON.stringify({text:'@_user_1 备课'}),mentions:[{key:'@_user_1',id:{open_id:'ou_bot'},name:'课堂助手'}]}});
 await f.until(()=>f.lark.sent.some(x=>x.path==='/open-apis/im/v1/messages/om_cmd2/reply'),'reply');
 assert.match(JSON.parse(f.lark.sent.find(x=>x.path==='/open-apis/im/v1/messages/om_cmd2/reply').body.content).text,/只有群主/);
}finally{await f.close()}});


test('collection handoff disables consumers and writes while preserving verified course members',{skip},async()=>{
 const ws=fakeSdk(),f=await fixture({sdk:ws.sdk});try{
  assert.equal((await f.call('/api/admin/lark','PUT',{appId:'cli_test',appSecret:'test-only',encryptKey,verificationToken})).status,200);
  assert.equal((await f.call('/api/admin/lark/classrooms','PUT',{chatId:'oc_class01',courseId:'pamm'})).status,200);
  f.app.classroom.connect();assert.equal(ws.state.started,true);
  const before=f.store.get('SELECT COUNT(*) n FROM lark_classroom_messages').n;
  f.setCollectionOwner({source:'coworker',url:'https://coworker.example.test/'});
  assert.equal(f.app.classroom.connect().state,'external');assert.equal(ws.state.closed,true);
  assert.equal((await f.say('should not be ingested')).status,200);
  await new Promise(r=>setTimeout(r,30));
  assert.equal(f.store.get('SELECT COUNT(*) n FROM lark_classroom_messages').n,before);
  for(const [endpoint,body] of [['/api/admin/lark',{appId:'cli_other'}],['/api/admin/lark/classrooms',{chatId:'oc_class01',courseId:null}]])assert.equal((await f.call(endpoint,'PUT',body)).status,409);
  for(const endpoint of ['prepare','digest'])assert.equal((await f.call('/api/admin/lark/classrooms/'+endpoint,'POST',{chatId:'oc_class01'})).status,409);
  assert.equal((await f.call('/api/materials/documents?course=pamm','POST',{title:'blocked'})).status,409);
  for(const name of ['scanHistory','ingest','prepare','distill','draft'])await assert.rejects(()=>f.app.classroom[name]('oc_class01'),{status:409});
  await f.app.classroom.tick({force:true});
  assert.equal(f.aiCalls(),0);assert.equal(f.lark.sent.length,0);
  assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m1'}),true);
  assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_unknown'}),false);
  const data=(await f.call('/api/admin/lark/classrooms?refresh=1')).data;
  assert.equal(data.collectionOwner.source,'coworker');assert.equal(data.classrooms.length,1,'refresh does not discover or bind new chats');
  assert.equal(f.store.get("SELECT published FROM courses WHERE id='pamm'").published,1);
  f.store.run("UPDATE lark_classrooms SET members_synced='2000-01-01T00:00:00.000Z' WHERE chat_id='oc_class01'");
  assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m1'}),false,'stale membership cannot preserve access indefinitely');
  assert.deepEqual(f.app.classroom.owners(),[],'stale group ownership cannot approve course access');
  f.lark.removeMember('ou_m1');await f.app.classroom.tick({force:true});
  assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m1'}),false,'removed member loses access after read-only refresh');
  assert.equal(f.app.classroom.allows('pamm',{lark_union:'on_m1'}),false,'union identity is revoked too');
  assert.equal(f.app.classroom.allows('pamm',{lark_id:'ou_m2'}),true,'remaining member keeps access');

 }finally{await f.close()}
});

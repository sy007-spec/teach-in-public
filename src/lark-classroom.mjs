// Feishu/Lark classrooms: one group = one training classroom (course).
// Group discussion is collected, cleaned (noise, duplicates, bots and personal data removed; speakers pseudonymous) and saved
// once per classroom per day as a reference source of the course. When the digest changes, the course draft is regenerated
// from all reference sources: the classroom's own never-published draft is updated in place, otherwise a new draft is saved.
// Nothing is ever published or approved for the AI tutor automatically. Spec: LARK_CLASSROOM_SPEC.md.
// The Feishu/Lark layer is the private lark-feishu-assist module, injected by the hosting platform as `lib`
// (paid add-on); this public repository never imports it directly.
// Administrators only enter App ID and App Secret: events arrive over the official long connection (SDK injected as `sdk`),
// the group owner of a linked group becomes its classroom administrator (cards, approvals, digest command) and group members
// form the course roster: a member who signs in with Feishu/Lark (open_id, or union_id across apps of the same tenant) can read it.
// Group materials: cloud documents linked in the group and file attachments become course reference sources. Linking a group
// (or "一键备课") backfills its history, reads every document, digests the discussion and regenerates the course draft.
import {dayKey,digest} from './security.mjs';
import {larkSettings,larkDomain} from './lark.mjs';

const DAY_MS=86400000,QUIET_MS=10*60000,DRAFT_INTERVAL_MS=6*3600000,TEXT_MAX=8000;
const shanghaiDay=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const dayStart=day=>Date.parse(day+'T00:00:00+08:00');

export function larkClassroom(store,{lib,preparation,generateDraft,origin,brief=()=>'',fetch,now=Date.now,sdk=null,manualAdmins=()=>[],onCardAction,onQuestion,onQuestionReview,onRemoved,extract=null,vision=null,autoPrepare=false,historyDays=180,collectionOwner=()=>null}){
 const {createAssistant,cleanDiscussion,discussionMarkdown,cards}=lib;
 const requireCollection=()=>{if(collectionOwner())throw Object.assign(Error('采集已迁移至 coworker / Collection is managed by coworker'),{status:409})};
 let clientValue=null,clientKey='';
 const larkClient=()=>{const c=larkSettings(store);if(!c.appId||!c.appSecret)throw Error('Lark app credentials missing');const key=[larkDomain(c),c.appId,c.appSecret].join('\u0000');if(!clientValue||clientKey!==key){clientValue=lib.createLarkClient({domain:larkDomain(c),appId:c.appId,appSecret:c.appSecret,fetch});clientKey=key}return clientValue};
 store.db.exec(`CREATE TABLE IF NOT EXISTS lark_classrooms(chat_id TEXT PRIMARY KEY,course_id TEXT,name TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',collect INTEGER NOT NULL DEFAULT 1,auto_draft INTEGER NOT NULL DEFAULT 1,external INTEGER NOT NULL DEFAULT 0,last_draft_at TEXT,last_draft_version INTEGER,last_error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lark_classroom_messages(message_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,course_id TEXT NOT NULL,sender TEXT NOT NULL,sender_type TEXT NOT NULL,type TEXT NOT NULL,text TEXT NOT NULL,thread_id TEXT,mentions_bot INTEGER NOT NULL DEFAULT 0,time INTEGER NOT NULL,day TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,received TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS lark_classroom_messages_day ON lark_classroom_messages(chat_id,day);
 CREATE TABLE IF NOT EXISTS lark_classroom_members(chat_id TEXT NOT NULL,id_type TEXT NOT NULL,member_id TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL,PRIMARY KEY(chat_id,id_type,member_id));
 CREATE INDEX IF NOT EXISTS lark_classroom_members_id ON lark_classroom_members(member_id);
 CREATE TABLE IF NOT EXISTS lark_classroom_sources(chat_id TEXT NOT NULL,ref TEXT NOT NULL,message_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,document_id TEXT,fingerprint TEXT,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(chat_id,ref));
 CREATE TABLE IF NOT EXISTS lark_classroom_digests(chat_id TEXT,day TEXT,document_id TEXT,kept INTEGER,input INTEGER,fingerprint TEXT,drafted INTEGER NOT NULL DEFAULT 0,updated TEXT,PRIMARY KEY(chat_id,day));`);
 const columns=table=>store.all(`PRAGMA table_info(${table})`).map(c=>c.name);
 for(const [name,type] of [['manager_open_ids',"TEXT NOT NULL DEFAULT '[]'"],['owner_open_id','TEXT'],['owner_name','TEXT'],['members_synced','TEXT'],['cards','INTEGER NOT NULL DEFAULT 1'],['prepare_state','TEXT'],['sources_dirty','INTEGER NOT NULL DEFAULT 0'],['history_scanned','TEXT']])if(!columns('lark_classrooms').includes(name))store.db.exec(`ALTER TABLE lark_classrooms ADD COLUMN ${name} ${type}`);
 // Filled by the host's Feishu/Lark sign-in; lets members match across apps of the same tenant.
 if(!columns('users').includes('lark_union'))store.db.exec('ALTER TABLE users ADD COLUMN lark_union TEXT');
 const row=chat=>store.get('SELECT * FROM lark_classrooms WHERE chat_id=?',chat);
 const active=chat=>{const r=row(chat);return r&&r.status==='active'&&r.course_id&&store.get('SELECT id FROM courses WHERE id=?',r.course_id)?r:null};
 const discover=(chat,name='',external=false)=>store.run("INSERT INTO lark_classrooms(chat_id,name,external,created,updated) VALUES(?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE lark_classrooms.name END,status=CASE WHEN lark_classrooms.status='removed' THEN CASE WHEN lark_classrooms.course_id IS NULL THEN 'pending' ELSE 'active' END ELSE lark_classrooms.status END,updated=excluded.updated",chat,String(name).slice(0,200),external?1:0,store.now(),store.now());
 const record=(item,courseId,{question=false}={})=>{
  const text=String(item.text||(item.file?.name?'【附件】'+item.file.name:'')).slice(0,TEXT_MAX),time=Number(item.time)||now();
  store.run('INSERT OR IGNORE INTO lark_classroom_messages(message_id,chat_id,course_id,sender,sender_type,type,text,thread_id,mentions_bot,time,day,received) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',item.messageId,item.chatId,courseId,item.sender?.openId||'',item.sender?.type||'user',item.type||'text',text,item.threadId||null,question?1:0,time,shanghaiDay(time),store.now());
 };
 /** Classroom administrators: owners of linked groups plus any manually registered open_ids. */
 const owners=({cardsOnly=false}={})=>store.all("SELECT DISTINCT owner_open_id id FROM lark_classrooms WHERE status='active' AND course_id IS NOT NULL AND owner_open_id IS NOT NULL"+(cardsOnly?' AND cards=1':'')+(collectionOwner()?' AND members_synced>?':''),...(collectionOwner()?[new Date(now()-10*60000).toISOString()]:[])).map(r=>r.id);
 const admins=()=>new Set([...manualAdmins(),...owners()]);
 const MEMBER_ID=/^o[nu]_[A-Za-z0-9_-]{1,140}$/;
 const putMember=(chat,type,id,name)=>{if(id&&MEMBER_ID.test(id))store.run('INSERT INTO lark_classroom_members VALUES(?,?,?,?,?) ON CONFLICT DO UPDATE SET name=excluded.name,updated=excluded.updated',chat,type,id,String(name||'').slice(0,100),store.now())};
 const putMembers=(chat,users)=>{for(const u of users){putMember(chat,'open_id',u.openId,u.name);putMember(chat,'union_id',u.unionId,u.name)}};
 /** Reads the group owner and the full member list (open_id, plus union_id when the app may read it). */
 async function syncMembers(chat){
  const client=larkClient(),raw=await client.api('im/v1/chats/'+encodeURIComponent(chat),{query:{user_id_type:'open_id'},code:'CHAT_INFO_FAILED'}),info={ownerOpenId:/^ou_/.test(String(raw.owner_id||''))?raw.owner_id:null,name:String(raw.name||''),managers:(Array.isArray(raw.user_manager_id_list)?raw.user_manager_id_list:[]).filter(x=>typeof x==='string'&&/^ou_[a-zA-Z0-9]+$/.test(x))},open=await client.members(chat);
  let union=null;try{union=await client.members(chat,{idType:'union_id'})}catch{/* union_id is optional */}
  const ownerName=open.find(m=>m.openId===info.ownerOpenId)?.name||'';
  store.transaction(()=>{
   store.run('UPDATE lark_classrooms SET manager_open_ids=? WHERE chat_id=?',JSON.stringify(info.managers.filter(id=>open.some(m=>m.openId===id))),chat);store.run('DELETE FROM lark_classroom_members WHERE chat_id=? AND id_type=?',chat,'open_id');putMembers(chat,open);
   if(union||collectionOwner()){store.run('DELETE FROM lark_classroom_members WHERE chat_id=? AND id_type=?',chat,'union_id');if(union)putMembers(chat,union)}
   store.run("UPDATE lark_classrooms SET owner_open_id=?,owner_name=?,name=CASE WHEN ?<>'' THEN ? ELSE name END,members_synced=?,updated=? WHERE chat_id=?",info.ownerOpenId,ownerName,info.name,String(info.name).slice(0,200),store.now(),store.now(),chat);
  });
  return {owner:info.ownerOpenId,members:open.length};
 }
 /** True when the signed-in user (Feishu/Lark identity) is a member of a group linked to the course. */
 function allows(courseId,user){
  const freshAfter=collectionOwner()?new Date(now()-10*60000).toISOString():null;
  const ids=[['open_id',user?.lark_id],['union_id',user?.lark_union]].filter(([,v])=>typeof v==='string'&&MEMBER_ID.test(v));
  return ids.some(([type,id])=>!!store.get("SELECT 1 FROM lark_classroom_members m JOIN lark_classrooms c ON c.chat_id=m.chat_id WHERE m.id_type=? AND m.member_id=? AND c.course_id=? AND c.status='active' AND (? IS NULL OR c.members_synced>?)",type,id,courseId,freshAfter,freshAfter));
 }

 // ---- Group materials → course reference sources ----
 const READABLE_FILES=new Set(['txt','md','markdown','csv','html','htm','pdf','docx','pptx','xlsx']),FILE_MAX=10*1024*1024,SOURCE_CHARS=40000;
 const extOf=name=>String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]||'';
 function enqueue(chat,ref,{messageId,kind,name,skip=null}){
  store.run('INSERT OR IGNORE INTO lark_classroom_sources(chat_id,ref,message_id,kind,name,status,error,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',chat,ref,String(messageId||''),kind,String(name||'').slice(0,200),skip?'skipped':'pending',skip,store.now(),store.now());
 }
 /** Queues the cloud documents and attachments of one message (live or from history). */
 function queueMaterials(chat,m){
  for(const key of m.imageKeys||[])enqueue(chat,'image:'+key,{messageId:m.messageId,kind:'image',name:'群图片.jpg'});
  for(const d of m.docLinks||[])enqueue(chat,'doc:'+d.kind+':'+d.token,{messageId:m.messageId,kind:d.kind,name:d.url,skip:['docx','wiki','sheets'].includes(d.kind)?null:'暂只支持飞书新版文档、电子表格与知识库页面；多维表格、旧版文档请导出为文件发到群里 / Only docx, sheets and wiki pages are read'});
  if(m.file?.key&&m.type==='file')enqueue(chat,'file:'+m.file.key,{messageId:m.messageId,kind:'file',name:m.file.name,skip:READABLE_FILES.has(extOf(m.file.name))?null:'不支持的文件类型（支持 md/txt/pdf/docx/pptx/xlsx/csv/html）/ Unsupported file type'});
 }
 const explain=e=>{const code=Number(e.providerCode);
  if([99991672,99991679,99991663].includes(code))return '应用缺少文档/附件读取权限：请在开发者后台导入最新权限 JSON 并发布新版本 / The app lacks document permissions; import the latest permission JSON and publish';
  if([1770032,1770039,131006,1069902].includes(code)||e.status===403)return '机器人无权读取：请在文档“分享”中把本群或本应用加为可阅读协作者 / Share the document with this group or app';
  return String(e.code||e.message||e).slice(0,200)};
 /** Reads pending materials and saves each as a reference source of the course (updated in place when it changes). */
 async function ingest(chat,{limit=40}={}){
  requireCollection();
  const r=active(chat);if(!r)return {saved:0,unchanged:0,failed:0};
  const client=larkClient(),out={saved:0,unchanged:0,failed:0};
  for(const src of store.all("SELECT * FROM lark_classroom_sources WHERE chat_id=? AND status IN ('pending','failed') AND attempts<3 ORDER BY created LIMIT ?",chat,limit)){
   try{
    let title=src.name,text;
    if(src.kind==='file'||src.kind==='image'){
     if(!extract)throw Error('文件解析不可用 / File extraction unavailable');
     const data=await client.downloadResource(src.message_id,src.ref.slice(src.kind==='image'?6:5),src.kind==='image'?'image':'file',FILE_MAX);
     const extracted=await extract({name:src.name,data:Buffer.from(data).toString('base64')},{maxBytes:FILE_MAX});text=extracted.text;if(extracted.images?.length){if(!vision)throw Error('视觉模型未配置 / Vision model unavailable');text=await vision({course:r.course_id,chat,text,images:extracted.images});if(!text)throw Error('视觉解析失败 / Vision extraction failed');}
    }else{
     let token=src.ref.split(':')[2],type=src.kind;
     if(type==='wiki'){const node=await client.wikiNode(token);if(!['docx','sheet'].includes(node.objType))throw Error('知识库页面不是新版文档或电子表格，暂不支持 / Wiki page is not a docx document or spreadsheet');token=node.objToken;title=node.title;type=node.objType==='sheet'?'sheets':'docx'}
     if(type==='sheets'){const sheet=await client.sheetText(token);title=sheet.title||title;text=sheet.text}
     else{title=(await client.docMeta(token)).title||title;text=await client.docText(token)}
    }
    text=String(text||'').trim();if(!text)throw Error('内容为空或无法提取文字 / No readable text');
    const fingerprint=digest(text);if(src.fingerprint===fingerprint&&src.document_id){store.run("UPDATE lark_classroom_sources SET status='saved',error=NULL,updated=? WHERE chat_id=? AND ref=?",store.now(),chat,src.ref);out.unchanged++;continue}
    const cut=text.length>SOURCE_CHARS,name=String(title||'飞书资料').slice(0,90);
    const raw='# '+name+'\n\n> 来源：飞书/Lark 课堂群'+(r.name?'「'+r.name+'」':'')+(src.kind==='file'?'附件':'云文档')+(cut?'（原文较长，已截取前 '+SOURCE_CHARS+' 字）':'')+'\n\n'+text.slice(0,SOURCE_CHARS);
    const doc=src.document_id?store.get('SELECT id,revision FROM preparation_documents WHERE course_id=? AND id=?',r.course_id,src.document_id):null;
    const saved=preparation.save(r.course_id,{...(doc?{id:doc.id,baseRevision:doc.revision}:{}),kind:'reference',title:('飞书资料 · '+name).slice(0,120),raw,language:/[\u4e00-\u9fff]/.test(text.slice(0,2000))?'zh':'other',source_ref:('lark:'+chat+':'+src.ref).slice(0,1000)},'lark:classroom');
    store.run("UPDATE lark_classroom_sources SET status='saved',document_id=?,fingerprint=?,name=?,error=NULL,updated=? WHERE chat_id=? AND ref=?",saved.id,fingerprint,name,store.now(),chat,src.ref);
    store.run('UPDATE lark_classrooms SET sources_dirty=1 WHERE chat_id=?',chat);out.saved++;
   }catch(e){store.run("UPDATE lark_classroom_sources SET status='failed',attempts=attempts+1,error=?,updated=? WHERE chat_id=? AND ref=?",explain(e),store.now(),chat,src.ref);out.failed++}
  }
  if(out.saved)store.audit('lark:classroom','lark.classroom_sources_saved',{chat,course:r.course_id,...out});
  return out;
 }
 /** Backfills the group's history: discussion for the digest and every document/attachment ever shared. */
 async function scanHistory(chat,{days=historyDays,maxPages=60}={}){
  requireCollection();
  const r=active(chat);if(!r)return {messages:0,materials:0};
  const client=larkClient(),bot=larkSettings(store).botOpenId,from=new Date(now()-days*DAY_MS);let token,pages=0,messages=0;
  const before=store.get('SELECT COUNT(*) n FROM lark_classroom_sources WHERE chat_id=?',chat).n;
  do{
   const page=await client.listMessages(chat,{from,pageToken:token});
   for(const h of page.items){
    if(h.deleted||h.senderType==='app'||(bot&&h.senderOpenId===bot))continue;
    const m=lib.normalizeMessage({message:{message_id:h.messageId,chat_id:chat,chat_type:'group',message_type:h.type,content:h.content,create_time:String(h.createTime),...(h.threadId?{thread_id:h.threadId}:{})},sender:{sender_id:{open_id:h.senderOpenId},sender_type:h.senderType||'user'}},{botOpenId:bot});
    if(!m)continue;queueMaterials(chat,m);
    if(r.collect&&(m.text||m.file)&&!m.mentionsBot){record({...m,time:m.createTime},r.course_id);messages++}
   }
   token=page.nextToken;pages++;
  }while(token&&pages<maxPages);
  store.run('UPDATE lark_classrooms SET history_scanned=? WHERE chat_id=?',new Date(now()).toISOString(),chat);
  return {messages,materials:store.get('SELECT COUNT(*) n FROM lark_classroom_sources WHERE chat_id=?',chat).n-before,complete:!token};
 }
 const running=new Set();
 const setPrepare=(chat,state)=>store.run('UPDATE lark_classrooms SET prepare_state=?,updated=? WHERE chat_id=?',JSON.stringify({...state,at:store.now()}),store.now(),chat);
 /** 一键备课: history → materials → daily digests → key description (via the draft) → course draft. */
 async function prepare(chat){
  requireCollection();
  if(running.has(chat))return {state:'running'};const r=active(chat);if(!r)return {state:'inactive'};
  running.add(chat);const summary={};
  try{
   setPrepare(chat,{state:'running',step:'history'});
   try{Object.assign(summary,await scanHistory(chat))}catch(e){summary.historyError=explain(e)}
   setPrepare(chat,{state:'running',step:'materials',...summary});
   store.run("UPDATE lark_classroom_sources SET status='pending',attempts=0 WHERE chat_id=? AND kind<>'file' AND status IN ('saved','failed')",chat);
   store.run("UPDATE lark_classroom_sources SET attempts=0 WHERE chat_id=? AND status='failed'",chat);
   const got={saved:0,unchanged:0,failed:0};for(let i=0;i<10;i++){const x=await ingest(chat);for(const k in got)got[k]+=x[k];if(!store.get("SELECT 1 FROM lark_classroom_sources WHERE chat_id=? AND status='pending'",chat))break}
   Object.assign(summary,{documents:got.saved,documentsUnchanged:got.unchanged,documentsFailed:store.get("SELECT COUNT(*) n FROM lark_classroom_sources WHERE chat_id=? AND status='failed'",chat).n,documentsSkipped:store.get("SELECT COUNT(*) n FROM lark_classroom_sources WHERE chat_id=? AND status='skipped'",chat).n});
   setPrepare(chat,{state:'running',step:'digest',...summary});let digests=0;
   for(const d of store.all('SELECT DISTINCT day FROM lark_classroom_messages WHERE chat_id=? AND course_id=? ORDER BY day',chat,r.course_id)){const x=await distill(chat,d.day);if(x.state==='saved')digests++}
   summary.digests=digests;
   setPrepare(chat,{state:'running',step:'draft',...summary});
   const hasSources=store.get("SELECT 1 FROM preparation_documents WHERE course_id=? AND kind='reference' AND raw<>''",r.course_id);
   const d=hasSources?await draft(chat,{force:true}):{state:'empty'};summary.draft=d.state;if(d.version)summary.version=d.version;if(d.error)summary.draftError=String(d.error).slice(0,200);
   setPrepare(chat,{state:d.state==='failed'?'failed':'done',...summary});
   store.audit('lark:classroom','lark.classroom_prepared',{chat,course:r.course_id,...summary});
   return {state:'done',...summary};
  }catch(e){setPrepare(chat,{state:'failed',error:explain(e),...summary});return {state:'failed',error:explain(e)}}
  finally{running.delete(chat)}
 }
 /** Starts 一键备课 in the background; `notify` posts the result to the group. */
 function startPrepare(chat,{notify=false}={}){
  requireCollection();
  if(running.has(chat))return {state:'running'};if(!active(chat))return {state:'inactive'};
  setPrepare(chat,{state:'running',step:'queued'});
  setImmediate(async()=>{const x=await prepare(chat);if(notify){try{await larkClient().sendText({type:'chat_id',id:chat},prepareText(x))}catch{/* best effort */}}});
  return {state:'started'};
 }
 const prepareText=x=>x.state!=='done'?'备课未完成：'+(x.error||x.state)+'。可在后台“飞书课堂助手”查看。':
  `备课完成：补抓历史讨论 ${x.messages||0} 条，新整理群资料 ${x.documents||0} 份`+(x.documentsFailed?`（${x.documentsFailed} 份读取失败，见后台）`:'')+`，讨论整理 ${x.digests||0} 天；`+
  (x.draft==='drafted'?`课程草稿已更新为 R${x.version}，请讲师审核后发布。`:x.draft==='failed'?'草稿生成失败：'+(x.draftError||'')+'。':'暂无可生成草稿的资料。');

 function statusCard(r){
  const c=store.get('SELECT * FROM courses WHERE id=?',r.course_id),title=(()=>{try{const t=JSON.parse(c.title);return t.zh||t.en||c.id}catch{return c.id}})();
  const today=store.get('SELECT COUNT(*) n FROM lark_classroom_messages WHERE chat_id=? AND day=? AND deleted=0',r.chat_id,dayKey()).n,last=store.get('SELECT * FROM lark_classroom_digests WHERE chat_id=? ORDER BY day DESC LIMIT 1',r.chat_id);
  return cards.reportCard({title:'课堂 / Classroom · '+title,template:'turquoise',metrics:[{label:'今日讨论 / Today',value:today},{label:'已发布版本 / Published',value:'R'+(c.published||0)},{label:'草稿版本 / Draft',value:c.draft>c.published?'R'+c.draft:'—'},{label:'最近整理 / Last digest',value:last?last.day+' · '+last.kept+'/'+last.input:'—'}],...(brief(r.course_id)?{sections:[{title:'关键说明 / Key description',lines:[brief(r.course_id).split('\n')[0]]}]}:{}),footnote:'讨论按关键说明每天自动整理进课程资料并更新草稿；发布仍需讲师审核。Discussions are digested daily into course sources and drafts; publishing stays manual.',link:{text:'打开课堂 / Open classroom',url:origin+'/'}});
 }

 let assistantValue=null,assistantKey='';
 function assistant(){
  const c=larkSettings(store),key=[c.region,c.appId,c.appSecret,c.botOpenId].join('\u0000');
  if(assistantValue&&assistantKey===key)return assistantValue;
  const client=larkClient();assistantKey=key;
  assistantValue=createAssistant({client,botOpenId:c.botOpenId||undefined,
   seen:id=>store.db.prepare('INSERT OR IGNORE INTO callbacks VALUES(?,?)').run('lark:'+id,store.now()).changes===1,
   resolveChat:async m=>{const r=active(m.chatId);if(!r){discover(m.chatId);return null}return {projectId:r.course_id,name:r.name,brief:brief(r.course_id),collect:!!r.collect,external:!!r.external,externalAllowed:false}},
   knowledge:{save:async item=>{record(item,item.projectId);queueMaterials(item.chatId,item)}},
   commands:[
    {names:['问答审核','review'],description:'提交群问答审核（本群管理员）',scope:'group',run:async ctx=>onQuestionReview?.(ctx)||'问答审核暂不可用'},
    {names:['课堂','统计','stats','class'],description:'本课堂概况 / Classroom status',scope:'group',run:async ctx=>({card:statusCard(active(ctx.message.chatId))})},
    {names:['整理','digest'],description:'立即整理今天的讨论（管理员）/ Digest today now (admins)',scope:'group',run:async ctx=>{if(!admins().has(ctx.sender.openId))return '只有群主或后台登记的管理员可以触发整理。Only the group owner or registered administrators can trigger a digest.';const r=await distill(ctx.message.chatId,dayKey());return r.state==='saved'?`已整理 ${r.kept}/${r.input} 条讨论，保存为课程资料“${r.title}”。`:r.state==='unchanged'?'今天的讨论没有新内容。Nothing new today.':'今天还没有可整理的讨论。No discussion to digest yet.'}},
    {names:['备课','prepare'],description:'整理群里全部历史讨论和文档并生成课程草稿（群主）/ Prepare the course from this group (owner)',scope:'group',run:async ctx=>{if(!admins().has(ctx.sender.openId))return '只有群主或后台登记的管理员可以发起备课。Only the group owner or registered administrators can start.';const x=startPrepare(ctx.message.chatId,{notify:true});return x.state==='running'?'正在备课中，完成后会在群里告诉大家。Already running.':'开始备课：补抓群历史讨论、读取群里的文档与附件、整理并生成课程草稿，完成后在群里回报。Started.'}},
   ],
   // A question to the bot is part of the class discussion: keep it for the digest and tell the asker where it goes.
   answer:async(question,ctx)=>{if(ctx.scope!=='group'||!ctx.chat)return '请在已关联课程的课堂群里 @我 提问，或发送“帮助”。Ask in a classroom group, or send "help".';record({...ctx.message,time:ctx.message.createTime,text:question},ctx.chat.projectId,{question:true});return onQuestion?onQuestion(question,ctx):'群答疑暂不可用，请联系讲师。'},
   onBotAdded:async e=>{discover(e.chatId,e.chatName,e.external);try{await client.sendText({type:'chat_id',id:e.chatId},'我是 TeachInPublic 课堂助手。管理员在后台“飞书课堂助手”中把本群关联到课程后：群主成为课堂管理员，群成员自动加入课程名单（用飞书登录即可访问课程），群内讨论每天整理进课程资料并更新草稿（发布需讲师审核）。@我 可依据已发布课程答疑；问答批量提交管理员卡片审核，确认后才补充到课程留言。群主可发送“问答审核”立即整理。@我 发送“帮助”查看命令。',`welcome:${e.chatId}`.slice(0,50))}catch{/* welcome is best effort */}},
   onEvent:async n=>{
    const change=lib.normalizeMemberEvent?.(n);
    if(change){if(!row(change.chatId))return;if(change.kind==='added')putMembers(change.chatId,change.users);else for(const u of change.users)store.run('DELETE FROM lark_classroom_members WHERE chat_id=? AND member_id IN (?,?)',change.chatId,u.openId||'',u.unionId||'');return}
    if(n.eventType==='im.chat.updated_v1'){const chat=String(n.event?.chat_id||'');if(active(chat))await syncMembers(chat)}
   },
   ...(onCardAction?{onCardAction:a=>onCardAction({...a,admins:admins()})}:{}),
   onRemoved:async ref=>{if(ref.kind==='message')store.run('UPDATE lark_classroom_messages SET deleted=1 WHERE message_id=?',ref.messageId);else store.run("UPDATE lark_classrooms SET status='removed',updated=? WHERE chat_id=?",store.now(),ref.chatId);onRemoved?.(ref)},
   onError:e=>store.set('larkClassroomLastError',{code:e.code||e.message,at:store.now()}),
  });
  return assistantValue;
 }

 /** Digest one classroom-day into a course reference source. Returns {state:'saved'|'unchanged'|'empty'|'inactive'}. */
 async function distill(chat,day){
  requireCollection();
  const r=active(chat);if(!r)return {state:'inactive'};
  const messages=store.all('SELECT * FROM lark_classroom_messages WHERE chat_id=? AND day=? AND course_id=? ORDER BY time',chat,day,r.course_id);
  const cleaned=cleanDiscussion(messages.map(m=>({messageId:m.message_id,text:m.text,time:m.time,sender:{openId:m.sender,type:m.sender_type},threadId:m.thread_id||undefined,deleted:!!m.deleted,mentionsBot:!!m.mentions_bot})),{brief:brief(r.course_id)});
  const old=store.get('SELECT * FROM lark_classroom_digests WHERE chat_id=? AND day=?',chat,day);
  if(!cleaned.stats.kept&&!old)return {state:'empty'};
  const title=('飞书课堂讨论 · '+(r.name||chat)+' · '+day).slice(0,120);
  const markdown=cleaned.stats.kept?discussionMarkdown({title:'飞书课堂讨论 · '+(r.name||'课堂群'),period:day,topics:cleaned.topics,stats:cleaned.stats,source:'飞书/Lark 课堂群'}):'# '+title+'\n\n> 当天讨论已全部撤回或被过滤。';
  const fingerprint=digest(markdown);if(old?.fingerprint===fingerprint)return {state:'unchanged'};
  let doc=null;if(old?.document_id)doc=store.get('SELECT id,revision FROM preparation_documents WHERE course_id=? AND id=?',r.course_id,old.document_id);
  const saved=preparation.save(r.course_id,{...(doc?{id:doc.id,baseRevision:doc.revision}:{}),kind:'reference',title,raw:markdown,language:'zh',source_ref:'lark:'+chat+':'+day},'lark:classroom');
  store.run('INSERT INTO lark_classroom_digests(chat_id,day,document_id,kept,input,fingerprint,drafted,updated) VALUES(?,?,?,?,?,?,0,?) ON CONFLICT(chat_id,day) DO UPDATE SET document_id=excluded.document_id,kept=excluded.kept,input=excluded.input,fingerprint=excluded.fingerprint,drafted=0,updated=excluded.updated',chat,day,saved.id,cleaned.stats.kept,cleaned.stats.input,fingerprint,store.now());
  store.audit('lark:classroom','lark.classroom_digested',{chat,day,course:r.course_id,kept:cleaned.stats.kept,input:cleaned.stats.input});
  return {state:'saved',documentId:saved.id,title,kept:cleaned.stats.kept,input:cleaned.stats.input,stats:cleaned.stats};
 }

 /** Regenerates the course draft when a digest changed since the last draft, at most once per interval. */
 async function draft(chat,{force=false}={}){
  requireCollection();
  const r=active(chat);if(!r||!r.auto_draft&&!force)return {state:'disabled'};
  if(!store.get('SELECT 1 FROM lark_classroom_digests WHERE chat_id=? AND drafted=0',chat)&&!r.sources_dirty)return {state:'unchanged'};
  if(!force&&r.last_draft_at&&now()-Date.parse(r.last_draft_at)<DRAFT_INTERVAL_MS)return {state:'waiting'};
  try{
   const result=await generateDraft(r.course_id,{replaceVersion:r.last_draft_version||null});
   store.run('UPDATE lark_classrooms SET last_draft_at=?,last_draft_version=?,last_error=NULL,updated=? WHERE chat_id=?',new Date(now()).toISOString(),result.version,store.now(),chat);
   store.run('UPDATE lark_classroom_digests SET drafted=1 WHERE chat_id=?',chat);store.run('UPDATE lark_classrooms SET sources_dirty=0 WHERE chat_id=?',chat);
   store.audit('lark:classroom','lark.classroom_draft_updated',{chat,course:r.course_id,version:result.version,replaced:!!result.replaced});
   return {state:'drafted',version:result.version,replaced:!!result.replaced};
  }catch(e){store.run('UPDATE lark_classrooms SET last_error=?,last_draft_at=?,updated=? WHERE chat_id=?',String(e.message).slice(0,300),new Date(now()).toISOString(),store.now(),chat);return {state:'failed',error:e.message}}
 }

 let busy=false,lastTick=0;
 /** Scheduler step: digest classroom-days that went quiet (or ended), then refresh drafts. */
 async function tick({force=false}={}){
  if(busy||!force&&now()-lastTick<5*60000)return;busy=true;lastTick=now();
  try{
   for(const r of store.all("SELECT * FROM lark_classrooms WHERE status='active' AND course_id IS NOT NULL")){
    if(!collectionOwner()){
    const days=store.all('SELECT m.day,MAX(m.time) last FROM lark_classroom_messages m LEFT JOIN lark_classroom_digests d ON d.chat_id=m.chat_id AND d.day=m.day WHERE m.chat_id=? AND m.day>=? AND (d.updated IS NULL OR m.received>d.updated) GROUP BY m.day',r.chat_id,shanghaiDay(now()-2*DAY_MS));
    for(const d of days)if(now()-d.last>QUIET_MS||dayStart(d.day)+DAY_MS<=now()){try{await distill(r.chat_id,d.day)}catch(e){store.run('UPDATE lark_classrooms SET last_error=? WHERE chat_id=?',String(e.message).slice(0,300),r.chat_id)}}
    if(store.get("SELECT 1 FROM lark_classroom_sources WHERE chat_id=? AND status='pending'",r.chat_id)){try{await ingest(r.chat_id,{limit:10})}catch{/* retried next tick */}}
    await draft(r.chat_id);
    }
    if(!r.members_synced||now()-Date.parse(r.members_synced)>300000){try{await syncMembers(r.chat_id)}catch(e){store.run("UPDATE lark_classrooms SET last_error=?,manager_open_ids='[]' WHERE chat_id=?",String(e.code||e.message).slice(0,300),r.chat_id)}}
   }
  }finally{busy=false}
 }

 function list(){return store.all("SELECT c.*,(SELECT COUNT(*) FROM lark_classroom_sources x WHERE x.chat_id=c.chat_id AND x.status='saved') sources_saved,(SELECT COUNT(*) FROM lark_classroom_sources x WHERE x.chat_id=c.chat_id AND x.status IN ('failed','skipped')) sources_problem,(SELECT COUNT(*) FROM lark_classroom_members p WHERE p.chat_id=c.chat_id AND p.id_type='open_id') members,(SELECT COUNT(*) FROM lark_classroom_messages m WHERE m.chat_id=c.chat_id AND m.deleted=0) messages,(SELECT MAX(day) FROM lark_classroom_digests d WHERE d.chat_id=c.chat_id) last_digest FROM lark_classrooms c ORDER BY c.status,c.updated DESC")}
 function sources(chat){return store.all('SELECT ref,kind,name,status,error,updated FROM lark_classroom_sources WHERE chat_id=? ORDER BY created DESC LIMIT 200',chat)}
 function roster(chat){return store.all("SELECT member_id open_id,name FROM lark_classroom_members WHERE chat_id=? AND id_type='open_id' ORDER BY name",chat)}
 async function bind(chat,{courseId,collect,autoDraft,cards,name}){
  requireCollection();
  if(!/^oc_[A-Za-z0-9_-]{4,80}$/.test(String(chat)))throw Object.assign(Error('Valid chat ID required'),{status:400});
  if(courseId&&!store.get('SELECT id FROM courses WHERE id=?',courseId))throw Object.assign(Error('Course not found'),{status:404});
  discover(chat,name||'');const r=row(chat);
  if(r.external&&courseId)throw Object.assign(Error('External chats cannot be classrooms'),{status:409});
  store.run('UPDATE lark_classrooms SET course_id=?,status=?,collect=?,auto_draft=?,cards=?,last_error=NULL,updated=? WHERE chat_id=?',courseId||null,courseId?'active':'pending',collect===false?0:1,autoDraft===false?0:1,cards===false?0:1,store.now(),chat);
  // Linking reads the owner and members right away; a failure is shown on the row and retried by the scheduler.
  if(courseId){try{await syncMembers(chat)}catch(e){store.run('UPDATE lark_classrooms SET last_error=? WHERE chat_id=?',String(e.code||e.message).slice(0,300),chat)}}
  // A newly linked group is prepared right away: history, documents and a first draft.
  if(courseId&&autoPrepare&&(r.course_id!==courseId||!r.history_scanned))startPrepare(chat);
  return row(chat);
 }
 async function chats(){if(!collectionOwner()){const remote=await larkClient().listChats();for(const c of remote)discover(c.id,c.name,c.external);}for(const r of store.all("SELECT chat_id FROM lark_classrooms WHERE status='active' AND course_id IS NOT NULL")){try{await syncMembers(r.chat_id)}catch(e){store.run('UPDATE lark_classrooms SET last_error=? WHERE chat_id=?',String(e.code||e.message).slice(0,300),r.chat_id)}}return list()}

 // Long connection: one per classroom app, opened when credentials exist and reopened when they change.
 let socket=null,socketKey='',socketState={state:sdk?'idle':'unavailable'};
 function disconnect(){if(socket){socket.close();socket=null}socketKey='';socketState={state:sdk?'idle':'unavailable'}}
 function connect(){
  if(collectionOwner()){disconnect();socketState={state:"external"};return socketState;}
  if(!sdk||!lib.startLongConnection)return socketState;
  const c=larkSettings(store),key=c.appId&&c.appSecret?[larkDomain(c),c.appId,c.appSecret].join('\u0000'):'';
  if(key&&key===socketKey&&socket)return socketState;
  disconnect();if(!key)return socketState;
  socketKey=key;socketState={state:'connecting',since:store.now()};
  try{socket=lib.startLongConnection({sdk,domain:larkDomain(c),appId:c.appId,appSecret:c.appSecret,handle:payload=>{if(socketState.state!=='connected')socketState={state:'connected',since:store.now()};return handle(payload)},onError:e=>{socketState={state:'error',error:String(e.code||e.message).slice(0,200),since:store.now()}}});if(socketState.state==='connecting')socketState={state:'started',since:store.now()}}
  catch(e){socket=null;socketKey='';socketState={state:'error',error:String(e.code||e.message).slice(0,200),since:store.now()}}
  return socketState;
 }
 const handle=payload=>collectionOwner()?Promise.resolve({state:"external"}):assistant().handle(payload);
 return {assistant,handle,distill,draft,tick,list,roster,bind,chats,syncMembers,allows,admins,owners,connect,disconnect,connection:()=>socketState,scanHistory,ingest,prepare,startPrepare,sources};
}

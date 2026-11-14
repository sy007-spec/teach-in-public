import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {applicationAccess,freshMfa,accessError as fail} from './application-access.mjs';
import {stripTeacher} from './security.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'), token=()=>randomBytes(32).toString('base64url');
export function courseContentAccess({store,business,origin,config={},fetcher=fetch,keySet}){
 const db=store.db,resource=origin+'/api/content/v1';
 if(!store.setting('contentInstanceId'))store.set('contentInstanceId',randomUUID());
 const instanceId=store.setting('contentInstanceId');
 db.exec('CREATE TABLE IF NOT EXISTS content_notices(resource TEXT PRIMARY KEY,status TEXT NOT NULL,reason TEXT NOT NULL,replacement TEXT,updated TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS content_identity_bindings(owner TEXT PRIMARY KEY,issuer TEXT,subject TEXT); CREATE TABLE IF NOT EXISTS content_oidc_flows(id TEXT PRIMARY KEY,owner TEXT,session TEXT,data TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS content_mfa_proofs(session TEXT PRIMARY KEY,owner TEXT,data TEXT,expires INTEGER);');
 if(!store.all('PRAGMA table_info(content_identity_bindings)').some(c=>c.name==='admin_generation'))db.exec('ALTER TABLE content_identity_bindings ADD COLUMN admin_generation TEXT');
 if(!store.all('PRAGMA table_info(content_identity_bindings)').some(c=>c.name==='admin_kind'))db.exec('ALTER TABLE content_identity_bindings ADD COLUMN admin_kind TEXT');
 const generation=()=>hash(JSON.stringify(store.setting('adminHash')));
 // Migrate only bindings that would pass the previous eligibility rule now.
 // Expired browser sessions must not interrupt an already approved grant later.
 store.run("UPDATE content_identity_bindings SET admin_generation=?,admin_kind='root' WHERE (admin_generation IS NULL OR admin_kind IS NULL) AND owner IN (SELECT user_id FROM sessions WHERE admin=1 AND expires>?)",generation(),store.now());
 const bound=(owner,i)=>{const b=store.get('SELECT * FROM content_identity_bindings WHERE owner=?',owner);return i.issuer===config.issuer&&b?.issuer===i.issuer&&b?.subject===i.subject&&b.admin_generation===generation()&&!!store.get('SELECT id FROM users WHERE id=?',owner)&&(b.admin_kind==='root'||b.admin_kind==='delegated'&&!!store.get('SELECT user_id FROM user_admins WHERE user_id=?',owner));};
 const apps=applicationAccess(db,{resource,scopes:['content:read'],eligible:bound});
 let discovery,key=keySet;
 async function metadata(){
  if(!config.issuer||!config.clientId)fail(503,'统一账户接入尚未配置');
  if(discovery)return discovery;
  const base=new URL(config.issuer);if(base.protocol!=='https:')fail(503,'身份服务必须使用HTTPS');
  const r=await fetcher(config.issuer+'/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail(503,'身份服务不可用');const d=await r.json();
  if(d.issuer!==config.issuer)fail(503,'身份服务issuer不匹配');
  for(const k of ['authorization_endpoint','token_endpoint','jwks_uri'])if(new URL(d[k]).origin!==base.origin)fail(503,'身份端点必须同源');
  key ||= createRemoteJWKSet(new URL(d.jwks_uri));return discovery=d;
 }
 function catalog(grant){
  const selected=new Set(grant.resources);
  return store.all('SELECT * FROM courses WHERE enabled=1').flatMap(c=>business.list(c,true).filter(v=>v.published>0&&selected.has(c.id+'/'+v.id)).map(v=>({courseId:c.id,versionId:v.id,revision:String(v.published),title:JSON.parse(c.title)})));
 }
 function content(grant,courseId,versionId,revision){
  if(!grant.resources.includes(courseId+'/'+versionId))fail(403,'课程不在授权范围');
  const c=store.get('SELECT * FROM courses WHERE id=? AND enabled=1',courseId);
  if(!c)fail(404,'课程不可用');const scoped=business.resolve(c,{admin:true},versionId);
  if(String(scoped.published)!==revision||!business.history(scoped).some(r=>String(r.version)===revision))fail(409,'当前发布修订已变化');
  const material=stripTeacher(business.read(scoped,Number(revision)));
  const text=JSON.stringify(material,null,2);
  return {instanceId,courseId,versionId,title:JSON.parse(c.title),usage:grant.usage,content:{revision,text,hash:hash(text)},material};
 }
 const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json;charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
 async function read(req){let data='',size=0;for await(const part of req){size+=part.length;if(size>65536)fail(413,'请求过大');data+=part;}try{return JSON.parse(data||'{}');}catch{fail(400,'无效JSON');}}
 async function route(req,res,session){
  try{
   const u=new URL(req.url,origin),p=u.pathname;
   if(p==='/api/content-access/metadata'&&req.method==='GET')return json(res,200,{protocol:'sts-content-v1',resource,token_endpoint:origin+'/api/content-access/token',instanceId});
   if(p==='/api/content-access/token'&&req.method==='POST')return json(res,200,apps.exchange(String(req.headers.authorization||'').replace(/^Bearer /,''),await read(req)));
   if(p.startsWith('/api/content/v1/')){
    if(req.method!=='GET')fail(405,'只读接口');
    const object=p.endsWith('/revision')?u.searchParams.get('course')+'/'+u.searchParams.get('version'):undefined;
    const grant=apps.verify(String(req.headers.authorization||'').replace(/^Bearer /,''),'content:read',object);
    if(p.endsWith('/catalog')){
     const items=catalog(grant),notices=store.all('SELECT * FROM content_notices ORDER BY resource').filter(x=>grant.resources.includes(x.resource));
     const etag=hash(JSON.stringify({items,notices,usage:grant.usage}));
     if(u.searchParams.get('snapshot')&&u.searchParams.get('snapshot')!==etag)fail(409,'snapshot_expired');
     const offset=Number(u.searchParams.get('cursor')||0),limit=Math.min(200,Number(u.searchParams.get('limit')||200));
     if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1)fail(422,'目录游标无效');
     return json(res,200,{items:items.slice(offset,offset+limit),next:offset+limit<items.length?String(offset+limit):null,etag,notices,usage:grant.usage});
    }
    if(p.endsWith('/revision')){const result=content(grant,u.searchParams.get('course'),u.searchParams.get('version'),u.searchParams.get('revision'));apps.verify(String(req.headers.authorization||'').replace(/^Bearer /,''),'content:read',object);return json(res,200,result);}
    fail(404,'接口不存在');
   }
   const s=session(req,res);if(!s.admin)fail(403,'请先登录课堂管理员');
   if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['x-csrf-token']!==s.csrf))fail(403,'管理会话校验失败');
   if(p==='/api/content-access/apps'&&req.method==='GET')return json(res,200,{apps:apps.list(s.user_id),courses:store.all('SELECT * FROM courses WHERE enabled=1').flatMap(c=>business.list(c,true).filter(v=>v.published>0).map(v=>({resource:c.id+'/'+v.id,title:JSON.parse(c.title),revision:v.published}))),configured:!!config.issuer});
   if(p==='/api/content-access/apps'&&req.method==='POST')return json(res,201,apps.create(s.user_id,await read(req)));
   if(p==='/api/content-access/notices'&&req.method==='GET')return json(res,200,store.all('SELECT * FROM content_notices ORDER BY resource'));
   if(p==='/api/content-access/notices'&&req.method==='POST'){
    const input=await read(req),parts=String(input.resource||'').split('/'),course=store.get('SELECT * FROM courses WHERE id=?',parts[0]);
    if(parts.length!==2||!course||!business.list(course,true).some(v=>v.id===parts[1]))fail(404,'课程版本不存在');
    if(!['active','withdrawn','stopped'].includes(input.status)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>3000)fail(422,'请说明状态和原因');
    store.run('INSERT OR REPLACE INTO content_notices VALUES(?,?,?,?,?)',input.resource,input.status,input.reason,String(input.replacement||'').slice(0,300),new Date().toISOString());return json(res,200,{ok:true});
   }
   if(p==='/api/content-access/start'&&req.method==='POST'){
    const d=await metadata(),state=token(),verifier=token(),nonce=token();
    store.run('DELETE FROM content_oidc_flows WHERE expires<?',Date.now());
    store.run('INSERT INTO content_oidc_flows VALUES(?,?,?,?,?)',hash(state),s.user_id,s.id,JSON.stringify({verifier,nonce}),Date.now()+600000);
    const target=new URL(d.authorization_endpoint);
    for(const [k,v]of Object.entries({client_id:config.clientId,redirect_uri:origin+'/api/content-access/callback',response_type:'code',scope:'openid profile',state,nonce,code_challenge:hashBase64(verifier),code_challenge_method:'S256',prompt:'login',max_age:'0'}))target.searchParams.set(k,v);
    return json(res,200,{url:target.href});
   }
   if(p==='/api/content-access/callback'&&req.method==='GET'){
    const state=u.searchParams.get('state'),code=u.searchParams.get('code');if(!state||!code||code.length>4096)fail(401,'授权回调无效');
    const flow=store.get('SELECT * FROM content_oidc_flows WHERE id=?',hash(state));if(!flow||flow.session!==s.id||flow.owner!==s.user_id||flow.expires<Date.now())fail(401,'授权会话不匹配');
    store.run('DELETE FROM content_oidc_flows WHERE id=?',hash(state));
    const data=JSON.parse(flow.data),d=await metadata();
    const r=await fetcher(d.token_endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,...(config.clientSecret?{client_secret:config.clientSecret}:{}),code,redirect_uri:origin+'/api/content-access/callback',code_verifier:data.verifier})});
    if(!r.ok)fail(401,'身份授权码交换失败');const result=await r.json();
    const {payload}=await jwtVerify(result.id_token,key,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','nonce','auth_time','amr'],maxTokenAge:'10m',clockTolerance:5});
    if(payload.nonce!==data.nonce||(payload.azp&&payload.azp!==config.clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==config.clientId))fail(401,'身份随机数或应用不匹配');
    const proof={issuer:payload.iss,subject:payload.sub,authTime:payload.auth_time,amr:payload.amr};
    if(!freshMfa(proof))fail(403,'必须完成最近十分钟内的多因素验证');
    const existing=store.get('SELECT * FROM content_identity_bindings WHERE owner=?',s.user_id);
    if(existing&&(existing.issuer!==proof.issuer||existing.subject!==proof.subject))fail(403,'统一账户与既有绑定不一致');
    store.run('INSERT OR REPLACE INTO content_mfa_proofs VALUES(?,?,?,?)',s.id,s.user_id,JSON.stringify(proof),Date.now()+600000);
    res.writeHead(303,{location:'/content-access','cache-control':'no-store'});return res.end();
   }
   if(p==='/api/content-access/approve'&&req.method==='POST'){
    const input=await read(req),proof=store.get('SELECT * FROM content_mfa_proofs WHERE session=? AND owner=? AND expires>?',s.id,s.user_id,Date.now());
    if(!proof)fail(403,'请先完成统一账户MFA');
    const identity=JSON.parse(proof.data);
    const allowed=new Set(store.all('SELECT * FROM courses WHERE enabled=1').flatMap(c=>business.list(c,true).filter(v=>v.published>0).map(v=>c.id+'/'+v.id)));
    if(!Array.isArray(input.resources)||input.resources.some(x=>!allowed.has(x)))fail(403,'包含不可开放课程');
    if(input.usage?.persistentDisplay!==true||input.usage?.retain!==true||input.usage?.compile!==true||!['members','authenticated'].includes(input.usage?.audience?.mode)||!Array.isArray(input.usage?.audience?.subjects))fail(422,'须明确持续成果使用授权及读者范围');
    const outcome=store.transaction(()=>{
     const kind=store.get('SELECT admin FROM sessions WHERE id=?',s.id)?.admin?'root':store.get('SELECT user_id FROM user_admins WHERE user_id=?',s.user_id)?'delegated':null;if(!kind)fail(403,'课堂管理权限已撤销');
     store.run('INSERT INTO content_identity_bindings(owner,issuer,subject,admin_generation,admin_kind) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET admin_generation=excluded.admin_generation,admin_kind=excluded.admin_kind WHERE issuer=excluded.issuer AND subject=excluded.subject',s.user_id,identity.issuer,identity.subject,generation(),kind);
     return apps.approve(input.application,s.user_id,identity,{...input,scopes:['content:read'],usage:{...input.usage,receiptId:randomUUID(),grantedBy:{issuer:identity.issuer,subject:identity.subject},grantedAt:new Date().toISOString()}});
    });return json(res,200,outcome);
   }
   if(p==='/api/content-access/revoke'&&req.method==='POST'){const input=await read(req);apps.revoke(input.application,s.user_id,{key:!!input.key});return json(res,200,{ok:true});}
   fail(404,'接口不存在');
  }catch(e){return json(res,e.status||500,{error:e.status?e.message:'课程接入服务暂不可用'});}
 }
 return {route,apps};
}
function hashBase64(x){return createHash('sha256').update(x).digest('base64url');}

import {randomBytes,randomUUID,createHash} from 'node:crypto';
export const accessError=(status,message)=>{throw Object.assign(new Error(message),{status});};
const digest=x=>createHash('sha256').update(x).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
export function freshMfa(identity,now=Date.now()){
 const amr=identity?.amr;
 return !!identity?.issuer&&!!identity?.subject&&Number.isFinite(identity.authTime)&&identity.authTime*1000<=now+5000&&now-identity.authTime*1000<=600000&&Array.isArray(amr)&&(amr.includes('mfa')||(amr.includes('pwd')&&amr.some(x=>['otp','hwk','swk'].includes(x))));
}
export function applicationAccess(db,{resource,scopes,clock=()=>Date.now(),eligible=()=>false}){
 db.exec('CREATE TABLE IF NOT EXISTS content_apps(id TEXT PRIMARY KEY,owner TEXT,key_hash TEXT UNIQUE,data TEXT,revoked INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS content_grants(app TEXT PRIMARY KEY,version INTEGER,expires INTEGER,identity TEXT,data TEXT); CREATE TABLE IF NOT EXISTS content_tokens(hash TEXT PRIMARY KEY,app TEXT,version INTEGER,expires INTEGER,data TEXT);');
 function app(id){const a=db.prepare('SELECT * FROM content_apps WHERE id=? AND revoked=0').get(id);if(!a)accessError(401,'Application unavailable');return {...a,config:JSON.parse(a.data)};}
 const validScopes=list=>Array.isArray(list)&&list.length>0&&list.length<=scopes.length&&new Set(list).size===list.length&&list.every(s=>scopes.includes(s));
 function create(owner,input){
  if(typeof owner!=='string'||!owner||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)accessError(422,'Application owner/name required');
  const id=randomUUID(),key=secret();
  db.prepare('INSERT INTO content_apps(id,owner,key_hash,data) VALUES(?,?,?,?)').run(id,owner,digest(key),JSON.stringify({name:input.name,target:input.target||''}));
  return {id,key};
 }
 function list(owner){return db.prepare('SELECT id,data,revoked FROM content_apps WHERE owner=?').all(owner).map(a=>({id:a.id,...JSON.parse(a.data),revoked:!!a.revoked,grant:grantInfo(a.id)}));}
 function grantInfo(id){const g=db.prepare('SELECT version,expires,data FROM content_grants WHERE app=?').get(id);return g?{version:g.version,expires:g.expires,...JSON.parse(g.data)}:null;}
 function approve(id,owner,identity,input){
  const a=app(id);if(a.owner!==owner||!freshMfa(identity,clock())||!eligible(owner,identity))accessError(403,'Fresh bound unified MFA and current owner permission required');
  if(!validScopes(input.scopes)||!Array.isArray(input.resources)||!input.resources.length||input.resources.length>1000||input.resources.some(x=>typeof x!=='string'||!x||x.length>300)||new Set(input.resources).size!==input.resources.length)accessError(422,'Select explicit scope and resources');
  if(!Number.isInteger(input.hours)||input.hours<1||input.hours>720)accessError(422,'Grant must expire within 30 days');
  const old=grantInfo(id),version=(old?.version||0)+1,expires=clock()+input.hours*3600000;
  const data={scopes:input.scopes,resources:input.resources,usage:input.usage||null};
  db.prepare('INSERT INTO content_grants VALUES(?,?,?,?,?) ON CONFLICT(app) DO UPDATE SET version=excluded.version,expires=excluded.expires,identity=excluded.identity,data=excluded.data').run(id,version,expires,JSON.stringify({issuer:identity.issuer,subject:identity.subject}),JSON.stringify(data));
  return {version,expires,...data};
 }
 function revoke(id,owner,{key=false}={}){
  const a=app(id);if(a.owner!==owner)accessError(403,'Owner required');
  db.prepare('UPDATE content_grants SET version=version+1,expires=0 WHERE app=?').run(id);
  if(key)db.prepare('UPDATE content_apps SET revoked=1 WHERE id=?').run(id);
 }
 function live(id){
  const a=app(id),g=db.prepare('SELECT * FROM content_grants WHERE app=?').get(id);
  if(!g||g.expires<=clock()||!eligible(a.owner,JSON.parse(g.identity)))accessError(401,'Grant expired or owner permission changed');
  return {a,g,data:JSON.parse(g.data)};
 }
 function exchange(key,input){
  if(typeof key!=='string'||key.length>200)accessError(401,'Application key required');
  const a=db.prepare('SELECT id FROM content_apps WHERE key_hash=? AND revoked=0').get(digest(key));if(!a)accessError(401,'Invalid application key');
  const {g,data}=live(a.id);
  if(input.resource!==resource||!validScopes(input.scopes)||input.scopes.some(s=>!data.scopes.includes(s)))accessError(403,'Resource or scope not granted');
  const token=secret(),expires=Math.min(g.expires,clock()+600000);
  db.prepare('DELETE FROM content_tokens WHERE expires<=?').run(clock());
  db.prepare('INSERT INTO content_tokens VALUES(?,?,?,?,?)').run(digest(token),a.id,g.version,expires,JSON.stringify({scopes:input.scopes}));
  return {access_token:token,token_type:'Bearer',expires_in:Math.floor((expires-clock())/1000)};
 }
 function verify(token,scope,object){
  if(typeof token!=='string'||token.length>200)accessError(401,'Bearer token required');
  const t=db.prepare('SELECT * FROM content_tokens WHERE hash=? AND expires>?').get(digest(token),clock());if(!t)accessError(401,'Token invalid or expired');
  const {a,g,data}=live(t.app);
  if(g.version!==t.version)accessError(401,'Grant version changed');
  if(!JSON.parse(t.data).scopes.includes(scope)||object&&!data.resources.includes(object))accessError(403,'Scope or object not granted');
  return {application:a.id,owner:a.owner,identity:JSON.parse(g.identity),...data,scopes:JSON.parse(t.data).scopes};
 }
 return {create,list,approve,revoke,exchange,verify,grantInfo};
}

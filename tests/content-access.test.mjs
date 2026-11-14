import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {generateKeyPair,SignJWT} from 'jose';
import {openStore} from '../src/store.mjs';
import {businessVersions} from '../src/business-versions.mjs';
import {courseContentAccess} from '../src/content-access.mjs';

test('course API requires explicit MFA approval, isolates versions and strips instructor notes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'content-access-'));
 const store=openStore(dir,null,true),business=businessVersions(store),origin='https://class.example',issuer='https://identity.example';
 const now=store.now(),s={id:'session',user_id:'owner',csrf:'csrf',admin:1};
 store.run('INSERT INTO users(id,device_hash,created) VALUES(?,?,?)','owner','device',now);
 store.run('INSERT INTO sessions(id,user_id,csrf,ip,admin,expires,created) VALUES(?,?,?,?,?,?,?)',s.id,s.user_id,s.csrf,'127.0.0.1',1,'2099-01-01T00:00:00Z',now);
 store.run('INSERT INTO courses VALUES(?,?,?,?,?,?,?,?)','course',JSON.stringify({zh:'虚构课程'}),'unused','lookup',1,1,1,now);
 const material={lessons:[{id:'lesson',title:{zh:'演示'},pages:[{id:'page',title:{zh:'页面'},body:{zh:'公开正文'},speaker:'私有讲师备注'}]}]};
 store.run('INSERT INTO versions VALUES(?,?,?,?,?)','course',1,JSON.stringify(material),'fixture',now);
 const course=store.get('SELECT * FROM courses WHERE id=?','course');business.initialize(course);business.publish({...course,businessId:'v1'},1);
 const {privateKey,publicKey}=await generateKeyPair('RS256');let nonce;
 const config={issuer,clientId:'client'},fetcher=async url=>{
  if(String(url).endsWith('openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks'});
  return Response.json({id_token:await new SignJWT({nonce,auth_time:Math.floor(Date.now()/1000),amr:['pwd','otp']}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setAudience('client').setSubject('unified-owner').setIssuedAt().setExpirationTime('5m').sign(privateKey)});
 };
 const service=courseContentAccess({store,business,origin,config,fetcher,keySet:publicKey});
 const server=createServer((req,res)=>service.route(req,res,()=>s));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',headers:{origin,'content-type':'application/json','x-csrf-token':'csrf',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.status===303?null:await r.json()};}
 try{
  const app=(await request('/api/content-access/apps',{name:'虚构接入',target:'book'})).data;
  const approval={application:app.id,hours:720,resources:['course/v1'],usage:{retain:true,compile:true,persistentDisplay:true,audience:{mode:'members',subjects:['unified-owner']}}};
  assert.equal((await request('/api/content-access/approve',approval)).status,403);
  const begin=(await request('/api/content-access/start',{})).data,auth=new URL(begin.url);nonce=auth.searchParams.get('nonce');
  const callback='/api/content-access/callback?code=code&state='+auth.searchParams.get('state');
  assert.equal((await request(callback)).status,303);assert.equal((await request(callback)).status,401);
  assert.equal((await request('/api/content-access/approve',approval)).status,200);
  const access=(await request('/api/content-access/token',{resource:origin+'/api/content/v1',scopes:['content:read']},app.key)).data.access_token;
  assert.equal((await request('/api/content/v1/catalog',null,app.key)).status,401);
  const catalog=await request('/api/content/v1/catalog',null,access);assert.equal(catalog.data.items.length,1);
  const content=await request('/api/content/v1/revision?course=course&version=v1&revision=1',null,access);
  assert.equal(content.status,200);assert(!content.data.content.text.includes('私有讲师备注'));assert(content.data.usage.receiptId);
  assert.equal((await request('/api/content/v1/revision?course=other&version=v1&revision=1',null,access)).status,403);
  assert.equal((await request('/api/content-access/notices',{resource:'other/v1',status:'withdrawn',reason:'纠错'})).status,404);
  assert.equal((await request('/api/content-access/notices',{resource:'course/v1',status:'withdrawn',reason:'虚构纠错通知'})).status,200);
  const changed=await request('/api/content/v1/catalog',null,access);assert.notEqual(changed.data.etag,catalog.data.etag);assert.equal(changed.data.notices[0].status,'withdrawn');
  assert.equal((await request('/api/content/v1/catalog?snapshot='+catalog.data.etag,null,access)).status,409);
  assert.equal((await request('/api/content/v1/catalog?cursor=-1',null,access)).status,422);
  await request('/api/content-access/revoke',{application:app.id});
  assert.equal((await request('/api/content/v1/catalog',null,access)).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();rmSync(dir,{recursive:true,force:true});}
});

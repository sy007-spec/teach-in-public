import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {courseCodes} from '../src/course-codes.mjs';
import {courseList} from '../public/course-list.js';
test('only administrators receive authenticated encrypted course codes; rotation and legacy recovery persist',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'code-display-'));
 let app=createApp({runtime,emptyCourses:true,scheduler:false,briefSchedule:()=>{}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let csrf='';const jar={};
 const call=async(url,method='GET',body,anonymous=false)=>{const r=await fetch(base+url,{method,headers:{'content-type':'application/json',cookie:anonymous?'':Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),'x-csrf-token':anonymous?'':csrf},body:body===undefined?undefined:JSON.stringify(body)});if(!anonymous){for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar[k]=v}}const data=await r.json();if(!anonymous&&data.csrf)csrf=data.csrf;return {status:r.status,data}};
 try{
  await call('/api/session');const password=fs.readFileSync(path.join(runtime,'admin-access.txt'),'utf8').match(/Password: (.*)/)[1];assert.equal((await call('/api/admin/login','POST',{username:'admin',password})).status,200);
  for(const id of ['alpha','beta'])assert.equal((await call('/api/admin/courses','POST',{id,title:{zh:id,en:id},code:'test-'+id})).status,201);
  assert.equal((await call('/api/admin/courses')).data.find(c=>c.id==='alpha').code,'test-alpha');
  assert.equal((await call('/api/admin/courses','GET',undefined,true)).status,401);
  assert(!JSON.stringify((await call('/api/session','GET',undefined,true)).data).includes('test-alpha'));
  const codes=courseCodes(app.store);const sealed=app.store.get('SELECT sealed FROM course_display_codes WHERE course_id=?','alpha').sealed;assert(!sealed.includes('test-alpha'));
  app.store.run('UPDATE course_display_codes SET sealed=? WHERE course_id=?',sealed,'beta');assert.equal(codes.read('beta'),null);
  assert.throws(()=>codes.remember('beta','test-alpha'),/does not match/);codes.remember('beta','test-beta');
  assert.equal((await call('/api/admin/course','PATCH',{id:'alpha',code:'new-alpha'})).status,200);assert.equal(codes.read('alpha'),'new-alpha');
  assert.equal((await call('/api/admin/course','PATCH',{id:'alpha',code:'test-beta'})).status,409);assert.equal(codes.read('alpha'),'new-alpha');
  app.store.run('DELETE FROM course_display_codes WHERE course_id=?','beta');assert.equal(codes.read('beta'),null);
  assert.equal((await call('/api/access','POST',{code:'test-beta'})).status,400);assert.equal(codes.read('beta'),'test-beta');
  assert(!JSON.stringify(app.store.all('SELECT detail FROM audit')).includes('new-alpha'));
  await app.close();app=createApp({runtime,emptyCourses:true,scheduler:false});assert.equal(courseCodes(app.store).read('alpha'),'new-alpha');
  const html=courseList([{id:'x',title:{zh:'X',en:'X'},code:'<img src=x>',enabled:1}],null,z=>z);assert(html.includes('&lt;img'));assert(!html.includes('<img'));
 }finally{await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
});

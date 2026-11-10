import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';

test('trusted project identity remains course scoped and source revocation invalidates the session',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'project-identity-http-'));
 let authorized=true,identity;
 const app=createApp({runtime,emptyCourses:true,scheduler:false,origin:'http://teaching.test',projectAuthorization:async()=>authorized});
 // The fixture stands in for the trusted host broker. No public header can set identity.
 const gateway=http.createServer((req,res)=>{if(req.url==='/fixture-login'){req.url='/_project/enter';req.projectIdentity=identity;}app.server.emit('request',req,res);});
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+gateway.address().port,cookies={};let csrf='';
 async function request(url,headers={}){const response=await fetch(origin+url,{redirect:'manual',headers:{cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),...headers}});for(const h of response.headers.getSetCookie()){const kv=h.split(';')[0],i=kv.indexOf('=');cookies[kv.slice(0,i)]=kv.slice(i+1);}const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={};}csrf=data.csrf||csrf;return {status:response.status,data};}
 try{
  const project={deployment:'source',merchant:'m',workspace:'w',project:'p'},principal={issuer:'https://identity.example.test',subject:'editor-1',name:'Editor'};
  app.deliveries.bind(project);
  const input={id:'delivery-1',externalCourseKey:'first',title:{zh:'验收课程',en:'Acceptance course'},sourceRevision:'r1',baseVersion:0,markdown:'# Candidate',actor:'project-actor',administrator:principal};
  const first=app.deliveries.receive(project,input),second=app.deliveries.receive(project,{...input,id:'delivery-2',externalCourseKey:'second',administrator:undefined});
  identity={...principal,course:first.course_id};
  assert.equal((await request('/_project/enter',{'x-project-identity':JSON.stringify(identity)})).status,404);
  assert.equal((await request('/fixture-login')).status,303);
  const session=await request('/api/session');assert.equal(session.status,200);assert.equal(session.data.admin,false);
  assert.equal((await request('/api/project-deliveries/delivery-1')).status,200);
  assert.equal((await request('/api/project-deliveries/delivery-2')).status,403);
  const courses=await request('/api/instructor/courses');assert.equal(courses.status,200);assert.deepEqual(courses.data.map(c=>c.id),[first.course_id]);
  assert(!courses.data.some(c=>c.id===second.course_id));
  authorized=false;
  assert.equal((await request('/api/project-deliveries/delivery-1')).status,403);
  assert.equal((await request('/api/project-deliveries/delivery-1')).status,401);
  assert.equal((await request('/fixture-login')).status,403);
  authorized={allowed:true};assert.equal((await request('/fixture-login')).status,403);
 }finally{await new Promise(resolve=>gateway.close(resolve));await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
});

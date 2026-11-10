import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {source} from './fixtures/markdown.mjs';

test('project delivery enters the real editor without publishing or exposing candidates to learners',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'project-delivery-http-'));
 process.env.ADMIN_PASSWORD='project-delivery-test-password-987';
 const app=createApp({runtime,emptyCourses:true,scheduler:false,origin:'http://teaching.test'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const cookies={};let csrf='';
 async function request(url,method='GET',body){const response=await fetch(origin+url,{method,headers:{cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});for(const h of response.headers.getSetCookie()){const kv=h.split(';')[0],i=kv.indexOf('=');cookies[kv.slice(0,i)]=kv.slice(i+1);}const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};}
 try{
  const project={deployment:'coworker',merchant:'m',workspace:'w',project:'p'};app.deliveries.bind(project);
  const input={id:'delivery-1',externalCourseKey:'accounts',title:{zh:'开户',en:'Accounts'},sourceRevision:'r1',baseVersion:0,markdown:source(),actor:'verified-project-author'};
  const receipt=app.deliveries.receive(project,input);
  app.deliveries.receive(project,{...input,id:'delivery-2',externalCourseKey:'leverage'});
  assert.equal(app.store.get('SELECT COUNT(*) n FROM courses').n,2);
  assert.equal((await fetch(origin+'/project-deliveries.js')).status,200);
  assert.equal((await request('/api/project-deliveries/delivery-1')).status,401);
  await request('/api/session');assert.equal((await request('/api/admin/login','POST',{username:'admin',password:process.env.ADMIN_PASSWORD})).status,200);
  const before=await request('/api/project-deliveries?course='+receipt.course_id);assert.equal(before.status,200);assert.equal(before.data.items[0].status,'received');
  const accepted=await request('/api/project-deliveries/delivery-1','POST',{});assert.equal(accepted.status,200,JSON.stringify(accepted.data));assert.equal(accepted.data.accepted_version,1);assert.equal(accepted.data.published,false);
  const material=await request('/api/admin/material?course='+receipt.course_id);assert.equal(material.status,200);assert.equal(material.data.draft,1);assert.equal(material.data.published,0);
  const unreviewed=await request('/api/admin/publish','POST',{course:receipt.course_id,version:1});assert.equal(unreviewed.status,409);
  const published=await request('/api/admin/publish','POST',{course:receipt.course_id,version:1,confirmMarkdown:true,basePublished:0});assert.equal(published.status,200,JSON.stringify(published.data));
  assert.equal(app.deliveries.receipt('delivery-1').published,true);
  const other=app.deliveries.receipt('delivery-2');assert.equal(other.draft,0);assert.equal(other.published,false);
  const learnerPreview=await fetch(origin+'/api/project-deliveries/delivery-1',{headers:{cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),'x-learning-view':'learner'}});assert.equal(learnerPreview.status,403);
 }finally{await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
});

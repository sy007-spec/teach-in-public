import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
import {roleService} from '../src/roles.mjs';
import {projectPrincipals} from '../src/project-principals.mjs';
import {projectDelivery} from '../src/project-delivery.mjs';

test('explicit identity grants are course scoped, issuer scoped and cannot restore revoked authority',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-principal-')),store=openStore(dir,null,true);
 try{
  store.db.exec('CREATE TABLE user_admins(user_id TEXT PRIMARY KEY REFERENCES users(id))');
  const roles=roleService(store),principals=projectPrincipals(store);
  const project={deployment:'source',merchant:'merchant',workspace:'workspace',project:'project'};
  let n=0;
  const service=projectDelivery(store,{createCourse:({title})=>{const id='course-'+(++n);store.run('INSERT INTO courses VALUES(?,?,?,?,0,0,1,?)',id,JSON.stringify(title),'hash',id,store.now());return {id};},grantInitial:principals.grantInitial,canDraft:()=>false,importDraft:()=>{throw Error('unused');}});
  service.bind(project);
  const principal={issuer:'https://identity.example.test',subject:'subject-1',name:'Editor'};
  const input={id:'delivery-1',externalCourseKey:'a',sourceRevision:'r1',actor:'project-admin',title:{zh:'课程',en:'Course'},markdown:'# Candidate',baseVersion:0,administrator:principal};
  const receipt=service.receive(project,input),identity=principals.enter(principal,receipt.course_id);
  const session={staff_id:identity.instructor,admin:false};
  assert.equal(roles.capabilities(session,receipt.course_id).publish,true);
  assert.equal(store.get('SELECT count(*) n FROM user_admins WHERE user_id=?',identity.user).n,0);
  assert.throws(()=>principals.enter({...principal,issuer:'https://other.example.test'},receipt.course_id),/permission/);
  const other=service.receive(project,{...input,id:'delivery-2',externalCourseKey:'b',administrator:undefined});
  assert.equal(roles.capabilities(session,other.course_id).present,false);
  assert.throws(()=>principals.enter(principal,other.course_id),/permission/);
  assert.equal(service.receive(project,input).duplicate,true);
  assert.throws(()=>service.receive(project,{...input,administrator:{...principal,subject:'other'}}),/different content/);
  assert.throws(()=>service.receive(project,{...input,id:'delivery-3'}),/Existing course authority/);
  store.run('DELETE FROM instructor_grants WHERE instructor_id=?',identity.instructor);
  assert.equal(service.receive(project,input).duplicate,true);
  assert.throws(()=>principals.enter(principal,receipt.course_id),/permission/);
  store.run('UPDATE instructors SET enabled=0 WHERE id=?',identity.instructor);
  assert.throws(()=>service.receive(project,{...input,id:'delivery-4',externalCourseKey:'c'}),/unavailable/);
  assert.equal(store.get('SELECT count(*) n FROM courses').n,2);
  assert.equal(store.get('SELECT count(*) n FROM project_course_bindings').n,2);
  assert.throws(()=>service.receive(project,{...input,id:'delivery-5',externalCourseKey:'d',administrator:{...principal,issuer:'http://insecure.test'}}),/administrator/);
  assert.equal(store.get('SELECT count(*) n FROM courses').n,2);
 }finally{store.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('verified merchant identity is pending until a separate course manager approves, and revocation wins over login',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-enrollment-')),store=openStore(dir,null,true);
 try{
  const roles=roleService(store),principals=projectPrincipals(store);for(const id of ['a','b'])store.run('INSERT INTO courses VALUES(?,?,?,?,0,0,1,?)',id,JSON.stringify({zh:id,en:id}),'hash',id,store.now());
  const admin={issuer:'https://identity.test',subject:'admin',name:'Manager'},learner={issuer:'https://identity.test',subject:'student',name:'Student'};
  const owner=principals.grantInitial('a',admin),s={user_id:owner.user,staff_id:owner.instructor},caps=roles.capabilities(s,'a');assert.equal(caps.manage,true);
  const entered=principals.admit(learner,'a');assert.equal(entered.instructor,null);assert.equal(entered.principal.authorization,'member');assert.equal(principals.allowed(entered.user,'a'),false);assert.equal(principals.enrollment(entered.user,'a').status,'pending');
  assert.throws(()=>principals.decide('a',{user:owner.user,status:'approved',days:1},s,caps),/Another/);
  assert.throws(()=>principals.decide('b',{user:entered.user,status:'approved',days:1},s,roles.capabilities(s,'b')),/manager/);
  principals.decide('a',{user:entered.user,status:'approved',days:2,capabilities:{}},s,caps);assert.equal(principals.allowed(entered.user,'a'),true);assert.equal(principals.allowed(entered.user,'b'),false);assert.equal(principals.admit(learner,'a').instructor,null);
  principals.decide('a',{user:entered.user,status:'approved',days:2,capabilities:{draft:true}},s,caps);const teacher=principals.admit(learner,'a');assert.equal(roles.capabilities({staff_id:teacher.instructor},'a').draft,true);assert.equal(roles.capabilities({staff_id:teacher.instructor},'a').publish,false);assert.equal(roles.capabilities({staff_id:teacher.instructor},'a').manage,false);
  principals.decide('a',{user:entered.user,status:'revoked'},s,caps);assert.equal(principals.allowed(entered.user,'a'),false);assert.equal(principals.admit(learner,'a').instructor,null);assert.equal(principals.enrollment(entered.user,'a').status,'revoked');
  assert.equal(store.get('SELECT COUNT(*) n FROM project_principals').n,2);
 }finally{store.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

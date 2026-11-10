import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../src/store.mjs';
import {projectDelivery} from '../src/project-delivery.mjs';

const project={deployment:'coworker',merchant:'merchant-a',workspace:'workspace-a',project:'project-a'};
const input=(id,key='course-a',baseVersion=0)=>({id,externalCourseKey:key,title:{zh:'开户规则',en:'Account rules'},sourceRevision:'source-r1',baseVersion,markdown:'# Internal teaching candidate',actor:'issuer:subject'});
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teaching-delivery-')),store=openStore(dir,null,true);let counter=0;
 const options={createCourse:({title})=>{const id=randomUUID();store.run('INSERT INTO courses VALUES(?,?,?,?,0,0,1,?)',id,JSON.stringify(title),'hash','lookup-'+(++counter),store.now());return {id};},canDraft:(session,course)=>session?.course===course.id&&session.draft===true,
 importDraft:(course,body)=>{const version=course.draft+1;store.run('UPDATE courses SET draft=? WHERE id=?',version,course.id);if(body.markdown==='FAIL')throw Error('Import failed');return {version};}};
 return {store,options,service:projectDelivery(store,options),close(){store.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('one project per space, multiple courses and immutable idempotency',()=>{const f=fixture();try{
 assert.throws(()=>f.service.receive(project,input('d1')),/binding/);
 f.service.bind(project);f.service.bind(project);
 assert.throws(()=>f.service.bind({...project,project:'other'}),/another project/);
 assert.throws(()=>f.service.receive({...project,merchant:'other'},input('d1')),/binding/);
 const a=f.service.receive(project,input('d1')),b=f.service.receive(project,input('d2','course-b'));
 assert.notEqual(a.course_id,b.course_id);assert.equal(a.status,'received');assert.equal(a.draft,0);assert.equal(a.published,false);
 assert.equal(f.service.receive(project,input('d1')).duplicate,true);
 assert.throws(()=>f.service.receive(project,{...input('d1'),markdown:'changed'}),/different content/);
 assert.equal(f.store.get('SELECT COUNT(*) n FROM courses').n,2);
 assert.equal(projectDelivery(f.store,f.options).receipt('d1').course_id,a.course_id);
 assert(!JSON.stringify(f.service.receipt('d1')).includes('Internal teaching'));
 assert(!JSON.stringify(f.service.receipt('d1')).includes('issuer:subject'));
}finally{f.close();}});
test('live course permissions, conflicts and rollback protect existing drafts',()=>{const f=fixture();try{
 f.service.bind(project);const a=f.service.receive(project,input('d1')),session={course:a.course_id,draft:true,user_id:'author'};
 assert.throws(()=>f.service.inspect('d1',{...session,course:'other'}),/permission/);
 assert.throws(()=>f.service.accept('d1',{...session,draft:false}),/permission/);
 assert.equal(f.service.inspect('d1',session).markdown,input('d1').markdown);
 assert.equal(f.service.accept('d1',session).accepted_version,1);
 assert.equal(f.service.accept('d1',session).duplicate,true);
 f.service.receive(project,input('d2'));assert.throws(()=>f.service.accept('d2',session),/Course changed/);
 assert.equal(f.service.receipt('d2').status,'received');assert.equal(f.service.receipt('d2').draft,1);
 f.service.receive(project,{...input('d3','course-a',1),markdown:'FAIL'});
 assert.throws(()=>f.service.accept('d3',session),/Import failed/);assert.equal(f.service.receipt('d3').draft,1);
 assert.throws(()=>f.service.receive(project,input('bad-new','new-course',1)),/base version zero/);
 assert.equal(f.store.get('SELECT COUNT(*) n FROM courses').n,1);
}finally{f.close();}});

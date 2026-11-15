import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openStore} from '../src/store.mjs';import {courseShares} from '../src/course-shares.mjs';
test('course entry policy persists, preserves legacy updates and rejects unauthorized or invalid writes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'entry-mode-'));let store=openStore(dir);const id='entry-test';store.run('INSERT INTO courses VALUES(?,?,?,?,?,?,?,?)',id,'{}','hash','digest',0,0,1,store.now());let api=courseShares(store,{origin:'https://example.test'});const admin={admin:true,user_id:'admin'},body={course:id,allowAll:false,maxHours:24};
 try{assert.equal(api.policy(id).entryMode,undefined);assert.throws(()=>api.savePolicy({}, {...body,entryMode:'ppt'}));assert.throws(()=>api.savePolicy(admin,{...body,entryMode:'invalid'}));api.savePolicy(admin,{...body,entryMode:'ppt'});api.savePolicy(admin,body);assert.equal(api.policy(id).entryMode,'ppt');store.db.close();store=openStore(dir);api=courseShares(store,{origin:'https://example.test'});assert.equal(api.policy(id).entryMode,'ppt');api.savePolicy(admin,{...body,entryMode:'classroom'});assert.equal(api.policy(id).entryMode,'classroom');}finally{store.db.close();fs.rmSync(dir,{recursive:true,force:true})}
});

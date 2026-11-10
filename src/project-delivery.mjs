import {createHash} from 'node:crypto';
import {fail} from './security.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value,name,max=200)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(400,'Invalid '+name);
 return value;
};
const reference=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Project reference required');
 return Object.fromEntries(['deployment','merchant','workspace','project'].map(key=>[key,text(value[key],key)]));
};

// This is an internal application service, not an authentication boundary.
// Hosts authenticate delivery calls; course readers still need live capabilities.
export function projectDelivery(store,{createCourse,importDraft,canDraft,beforeReceive=()=>{},grantInitial}){
 store.db.exec(`
 CREATE TABLE IF NOT EXISTS project_teaching_binding(singleton INTEGER PRIMARY KEY CHECK(singleton=1),reference TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS project_course_bindings(external_key TEXT PRIMARY KEY,course_id TEXT NOT NULL UNIQUE REFERENCES courses(id),created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS project_deliveries(id TEXT PRIMARY KEY,external_key TEXT NOT NULL REFERENCES project_course_bindings(external_key),fingerprint TEXT NOT NULL,source_revision TEXT NOT NULL,base_version INTEGER NOT NULL,markdown TEXT NOT NULL,actor TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('received','accepted')),accepted_version INTEGER,created TEXT NOT NULL,accepted_at TEXT);
 `);
 function bind(project){const normalized=reference(project),serialized=JSON.stringify(normalized);return store.transaction(()=>{
  const existing=store.get('SELECT reference FROM project_teaching_binding WHERE singleton=1');
  if(existing&&existing.reference!==serialized)fail(409,'Teaching space is bound to another project');
  if(!existing)store.run('INSERT INTO project_teaching_binding VALUES(1,?,?)',serialized,store.now());
  return normalized;
 });}
 function requireBinding(project){const row=store.get('SELECT reference FROM project_teaching_binding WHERE singleton=1');if(!row||row.reference!==JSON.stringify(reference(project)))fail(403,'Project binding does not match');}
 function receipt(id){const row=store.get(`SELECT d.id,d.status,d.source_revision,d.base_version,d.accepted_version,d.created,d.accepted_at,b.course_id,c.published,c.draft FROM project_deliveries d JOIN project_course_bindings b ON b.external_key=d.external_key JOIN courses c ON c.id=b.course_id WHERE d.id=?`,id);if(!row)fail(404,'Delivery not found');return {...row,published:row.accepted_version!==null&&row.published===row.accepted_version};}
 function receive(project,input){
  requireBinding(project);
  beforeReceive();
  const id=text(input?.id,'delivery ID',100),externalKey=text(input.externalCourseKey,'course key',100),sourceRevision=text(input.sourceRevision,'source revision',200),actor=text(input.actor,'actor',300);
  const title={zh:text(input.title?.zh,'Chinese title',200),en:text(input.title?.en,'English title',200)};
  const markdown=text(input.markdown,'Markdown',1000000),baseVersion=input.baseVersion;
  if(!Number.isSafeInteger(baseVersion)||baseVersion<0)fail(400,'Invalid base version');
  const administrator=input.administrator;
  if(administrator!==undefined&&(!grantInitial||!administrator||typeof administrator!=='object'||Array.isArray(administrator)))fail(400,'Invalid explicit course administrator');
  const fingerprint=hash({id,externalKey,sourceRevision,actor,title,markdown,baseVersion,administrator});
  return store.transaction(()=>{
   const old=store.get('SELECT fingerprint FROM project_deliveries WHERE id=?',id);
   if(old){if(old.fingerprint!==fingerprint)fail(409,'Delivery ID already has different content');return {...receipt(id),duplicate:true};}
   let binding=store.get('SELECT course_id FROM project_course_bindings WHERE external_key=?',externalKey);
   if(!binding){if(baseVersion!==0)fail(409,'New course requires base version zero');const course=createCourse({title});binding={course_id:course.id};store.run('INSERT INTO project_course_bindings VALUES(?,?,?)',externalKey,course.id,store.now());if(administrator!==undefined)grantInitial(course.id,administrator);}
   else if(administrator!==undefined)fail(409,'Existing course authority must be managed in the teaching system');
   if(!store.get('SELECT id FROM courses WHERE id=? AND enabled=1',binding.course_id))fail(409,'Course unavailable');
   store.run("INSERT INTO project_deliveries(id,external_key,fingerprint,source_revision,base_version,markdown,actor,status,created) VALUES(?,?,?,?,?,?,?,'received',?)",id,externalKey,fingerprint,sourceRevision,baseVersion,markdown,actor,store.now());
   store.audit(actor,'project.delivery-received',{delivery:id,course:binding.course_id,sourceRevision,baseVersion});
   return receipt(id);
  });
 }
 function courseFor(id){const row=receipt(id),course=store.get('SELECT * FROM courses WHERE id=? AND enabled=1',row.course_id);if(!course)fail(404,'Course unavailable');return course;}
 function inspect(id,session){const course=courseFor(id);if(!canDraft(session,course))fail(403,'Course author permission required');return {...receipt(id),markdown:store.get('SELECT markdown FROM project_deliveries WHERE id=?',id).markdown};}
 function accept(id,session,editedMarkdown){return store.transaction(()=>{
  const course=courseFor(id);if(!canDraft(session,course))fail(403,'Course author permission required');
  const candidate=store.get('SELECT * FROM project_deliveries WHERE id=?',id);
  if(candidate.status==='accepted')return {...receipt(id),duplicate:true};
  if(candidate.base_version!==course.draft)fail(409,'Course changed; review and merge the candidate before importing');
  const markdown=editedMarkdown===undefined?candidate.markdown:text(editedMarkdown,'edited Markdown',1000000);
  const result=importDraft(course,{markdown,baseVersion:candidate.base_version,replaceLatest:false},session);
  if(!Number.isSafeInteger(result.version)||result.version<=candidate.base_version)throw Error('Invalid imported draft revision');
  store.run("UPDATE project_deliveries SET status='accepted',accepted_version=?,accepted_at=? WHERE id=?",result.version,store.now(),id);
  store.audit(session.user_id,'project.delivery-accepted',{delivery:id,course:course.id,version:result.version,acceptedSha256:createHash('sha256').update(markdown).digest('hex'),edited:markdown!==candidate.markdown});
  return receipt(id);
 });}
 function list(courseId,session){const course=store.get('SELECT * FROM courses WHERE id=? AND enabled=1',courseId);if(!course||!canDraft(session,course))fail(403,'Course author permission required');return store.all('SELECT d.id FROM project_deliveries d JOIN project_course_bindings b ON b.external_key=d.external_key WHERE b.course_id=? ORDER BY d.created DESC,d.id DESC LIMIT 100',courseId).map(row=>receipt(row.id));}
 return {bind,receive,receipt,inspect,accept,list};
}

import {createHash} from 'node:crypto';
import {uid,token,passwordHash,fail} from './security.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function projectPrincipals(store){
 store.db.exec('CREATE TABLE IF NOT EXISTS project_principals(issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),instructor_id TEXT NOT NULL UNIQUE REFERENCES instructors(id),created TEXT NOT NULL,PRIMARY KEY(issuer,subject));');
 if(!store.all('PRAGMA table_info(project_principals)').some(c=>c.name==='authorization'))store.db.exec("ALTER TABLE project_principals ADD COLUMN authorization TEXT NOT NULL DEFAULT 'manager'");
 store.db.exec("CREATE TABLE IF NOT EXISTS project_enrollments(course_id TEXT NOT NULL REFERENCES courses(id),user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','approved','revoked')),expires TEXT,created TEXT NOT NULL,PRIMARY KEY(course_id,user_id));");
 if(!store.setting('projectAuthorityMigrationV1',false))store.transaction(()=>{
  for(const g of store.all("SELECT g.* FROM instructor_grants g JOIN project_principals p ON p.instructor_id=g.instructor_id WHERE p.authorization='manager'")){const capabilities=JSON.parse(g.capabilities);capabilities.manage=true;store.run('UPDATE instructor_grants SET capabilities=? WHERE instructor_id=? AND course_id=?',JSON.stringify(capabilities),g.instructor_id,g.course_id);store.audit('project-migration','project.course-management-migrated',{course:g.course_id,instructor:g.instructor_id});}
  store.set('projectAuthorityMigrationV1',true);
 });
 function validate(p){if(!p||typeof p.issuer!=='string'||p.issuer.length>300||!/^https:\/\//.test(p.issuer)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>200||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)fail(400,'Explicit verified course administrator required');const u=new URL(p.issuer);if(u.username||u.password||u.search||u.hash)fail(400,'Invalid identity issuer');return {issuer:p.issuer,subject:p.subject,name:p.name};}
 function find(p){return store.get('SELECT * FROM project_principals WHERE issuer=? AND subject=?',p.issuer,p.subject);}
 function grantInitial(course,input){const p=validate(input);return store.transaction(()=>{
  if(!store.get('SELECT id FROM courses WHERE id=?',course))fail(404,'Course not found');
  if(store.get('SELECT instructor_id FROM instructor_grants WHERE course_id=?',course))fail(409,'Course already has explicit teaching authority');
  let row=find(p);const expires=new Date(Date.now()+365*86400000).toISOString();
  if(!row){const user=uid(),instructor=uid();store.run('INSERT INTO users(id,device_hash,name,created) VALUES(?,?,?,?)',user,'project:'+digest(p.issuer+'\0'+p.subject),p.name,store.now());store.run('INSERT INTO instructors VALUES(?,?,?,?,?,?,?)',instructor,'project.'+digest(p.issuer+'\0'+p.subject).slice(0,40),p.name,passwordHash(token()),1,expires,store.now());store.run('INSERT INTO instructor_users VALUES(?,?)',instructor,user);store.run('INSERT INTO project_principals(issuer,subject,user_id,instructor_id,created) VALUES(?,?,?,?,?)',p.issuer,p.subject,user,instructor,store.now());row=find(p);}
  // An administrator disabled in the teaching system is not re-enabled by a delivery.
  if(!store.get('SELECT id FROM instructors WHERE id=? AND enabled=1 AND expires>?',row.instructor_id,store.now()))fail(403,'Course administrator is unavailable');
  store.run('INSERT INTO instructor_grants VALUES(?,?,?,?,?)',row.instructor_id,course,JSON.stringify({annotate:true,draft:true,publish:true,moderate:true,stats:true,versions:true,manage:true}),expires,store.now());store.audit('project-bootstrap','project.course-authority',{course,instructor:row.instructor_id});return {user:row.user_id,instructor:row.instructor_id};
 });}
 function enter(input,course){const p=validate(input),row=find(p);if(!row||!store.get('SELECT i.id FROM instructors i JOIN instructor_grants g ON g.instructor_id=i.id JOIN courses c ON c.id=g.course_id WHERE i.id=? AND i.enabled=1 AND i.expires>? AND g.course_id=? AND g.expires>? AND c.enabled=1',row.instructor_id,store.now(),course,store.now()))fail(403,'Explicit course permission required');return {user:row.user_id,instructor:row.instructor_id};}
 function forUser(user){return store.get('SELECT issuer,subject,authorization FROM project_principals WHERE user_id=?',user)||null;}
 function admit(input,course){const p=validate(input);if(!store.get('SELECT id FROM courses WHERE id=? AND enabled=1',course))fail(404,'Course unavailable');return store.transaction(()=>{
  let row=find(p);if(!row){const user=uid(),instructor=uid(),expires=new Date(Date.now()+365*86400000).toISOString();store.run('INSERT INTO users(id,device_hash,name,created) VALUES(?,?,?,?)',user,'project:'+digest(p.issuer+'\0'+p.subject),p.name,store.now());store.run('INSERT INTO instructors VALUES(?,?,?,?,?,?,?)',instructor,'project.'+digest(p.issuer+'\0'+p.subject).slice(0,40),p.name,passwordHash(token()),1,expires,store.now());store.run('INSERT INTO instructor_users VALUES(?,?)',instructor,user);store.run("INSERT INTO project_principals VALUES(?,?,?,?,?,'member')",p.issuer,p.subject,user,instructor,store.now());row=find(p);}
  if(!store.get('SELECT id FROM instructors WHERE id=? AND enabled=1 AND expires>?',row.instructor_id,store.now()))fail(403,'Course identity unavailable');
  const grant=store.get('SELECT instructor_id FROM instructor_grants WHERE instructor_id=? AND course_id=? AND expires>?',row.instructor_id,course,store.now());
  if(!grant)store.run("INSERT OR IGNORE INTO project_enrollments VALUES(?,?,'pending',NULL,?)",course,row.user_id,store.now());
  return {user:row.user_id,instructor:grant?row.instructor_id:null,principal:forUser(row.user_id)};
 });}
 function allowed(user,course){return !!store.get("SELECT user_id FROM project_enrollments WHERE course_id=? AND user_id=? AND status='approved' AND expires>?",course,user,store.now());}
 function enrollment(user,course){return store.get('SELECT status,expires FROM project_enrollments WHERE course_id=? AND user_id=?',course,user)||null;}
 function list(course){return store.all(`SELECT p.user_id AS id,u.name,p.issuer,p.subject,e.status,e.expires,g.capabilities,g.expires AS teaching_expires
  FROM project_principals p JOIN users u ON u.id=p.user_id LEFT JOIN project_enrollments e ON e.user_id=p.user_id AND e.course_id=?
  LEFT JOIN instructor_grants g ON g.instructor_id=p.instructor_id AND g.course_id=? WHERE e.user_id IS NOT NULL OR g.instructor_id IS NOT NULL`,course,course).map(r=>({...r,capabilities:r.capabilities?JSON.parse(r.capabilities):{}}));}
 function decide(course,body,session,managerCaps){
  if(!managerCaps?.manage)fail(403,'Course authorization manager required');if(body.user===session.user_id)fail(403,'Another course manager must change your authority');
  const row=store.get('SELECT * FROM project_principals WHERE user_id=?',body.user);if(!row||!list(course).some(r=>r.id===body.user))fail(404,'Course applicant not found');
  if(!['approved','revoked'].includes(body.status))fail(400,'Invalid enrollment decision');
  const days=body.status==='revoked'?1:Number(body.days),keys=['annotate','draft','publish','moderate','stats','versions','manage'];
  if(body.status==='approved'&&(!Number.isInteger(days)||days<1||days>365))fail(400,'Validity must be 1–365 days');
  const capabilities=Object.fromEntries(keys.map(k=>[k,body.capabilities?.[k]===true])),expires=new Date(Math.min(Date.now()+days*86400000,Date.parse(managerCaps.expires)||Infinity,Date.parse(store.get('SELECT expires FROM instructors WHERE id=?',row.instructor_id).expires))).toISOString();
  if(body.status==='approved'&&expires<=store.now())fail(403,'Course identity expired');
  return store.transaction(()=>{
   store.run('DELETE FROM instructor_grants WHERE instructor_id=? AND course_id=?',row.instructor_id,course);
   store.run('INSERT INTO project_enrollments VALUES(?,?,?,?,?) ON CONFLICT(course_id,user_id) DO UPDATE SET status=excluded.status,expires=excluded.expires',course,row.user_id,body.status,body.status==='approved'?expires:null,store.now());
   if(body.status==='approved'&&Object.values(capabilities).some(Boolean))store.run('INSERT INTO instructor_grants VALUES(?,?,?,?,?)',row.instructor_id,course,JSON.stringify(capabilities),expires,store.now());
   store.audit(session.user_id,'project.course-authorization',{course,user:row.user_id,status:body.status,capabilities,expires:body.status==='approved'?expires:null});return {ok:true};
  });
 }
 return {grantInitial,enter,forUser,admit,allowed,enrollment,list,decide};
}

import {createHash} from 'node:crypto';
import {uid,token,passwordHash,fail} from './security.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function projectPrincipals(store){
 store.db.exec('CREATE TABLE IF NOT EXISTS project_principals(issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),instructor_id TEXT NOT NULL UNIQUE REFERENCES instructors(id),created TEXT NOT NULL,PRIMARY KEY(issuer,subject));');
 function validate(p){if(!p||typeof p.issuer!=='string'||p.issuer.length>300||!/^https:\/\//.test(p.issuer)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>200||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)fail(400,'Explicit verified course administrator required');const u=new URL(p.issuer);if(u.username||u.password||u.search||u.hash)fail(400,'Invalid identity issuer');return {issuer:p.issuer,subject:p.subject,name:p.name};}
 function find(p){return store.get('SELECT * FROM project_principals WHERE issuer=? AND subject=?',p.issuer,p.subject);}
 function grantInitial(course,input){const p=validate(input);return store.transaction(()=>{
  if(!store.get('SELECT id FROM courses WHERE id=?',course))fail(404,'Course not found');
  if(store.get('SELECT instructor_id FROM instructor_grants WHERE course_id=?',course))fail(409,'Course already has explicit teaching authority');
  let row=find(p);const expires=new Date(Date.now()+365*86400000).toISOString();
  if(!row){const user=uid(),instructor=uid();store.run('INSERT INTO users(id,device_hash,name,created) VALUES(?,?,?,?)',user,'project:'+digest(p.issuer+'\0'+p.subject),p.name,store.now());store.run('INSERT INTO instructors VALUES(?,?,?,?,?,?,?)',instructor,'project.'+digest(p.issuer+'\0'+p.subject).slice(0,40),p.name,passwordHash(token()),1,expires,store.now());store.run('INSERT INTO instructor_users VALUES(?,?)',instructor,user);store.run('INSERT INTO project_principals VALUES(?,?,?,?,?)',p.issuer,p.subject,user,instructor,store.now());row=find(p);}
  // An administrator disabled in the teaching system is not re-enabled by a delivery.
  if(!store.get('SELECT id FROM instructors WHERE id=? AND enabled=1 AND expires>?',row.instructor_id,store.now()))fail(403,'Course administrator is unavailable');
  store.run('INSERT INTO instructor_grants VALUES(?,?,?,?,?)',row.instructor_id,course,JSON.stringify({annotate:true,draft:true,publish:true,moderate:true,stats:true,versions:true}),expires,store.now());store.audit('project-bootstrap','project.course-authority',{course,instructor:row.instructor_id});return {user:row.user_id,instructor:row.instructor_id};
 });}
 function enter(input,course){const p=validate(input),row=find(p);if(!row||!store.get('SELECT i.id FROM instructors i JOIN instructor_grants g ON g.instructor_id=i.id JOIN courses c ON c.id=g.course_id WHERE i.id=? AND i.enabled=1 AND i.expires>? AND g.course_id=? AND g.expires>? AND c.enabled=1',row.instructor_id,store.now(),course,store.now()))fail(403,'Explicit course permission required');return {user:row.user_id,instructor:row.instructor_id};}
 function forUser(user){return store.get('SELECT issuer,subject FROM project_principals WHERE user_id=?',user)||null;}
 return {grantInitial,enter,forUser};
}

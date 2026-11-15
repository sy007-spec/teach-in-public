import {uid,fail} from './security.mjs';
import {validEmail} from './email-identity.mjs';
import {grantInvitedInstructor} from './share-instructor.mjs';

// One course invitation, shared by all entry points.
export function shareEntry(store,{find,eligible,timing,code,origin,value,claims,classroomName,classroomLogos}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS share_entries(share_id TEXT PRIMARY KEY,classroom_hours INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS share_enrollments(course_id TEXT,user_id TEXT,share_id TEXT,request_id TEXT,PRIMARY KEY(course_id,user_id));`);
 const config=row=>store.get('SELECT * FROM share_entries WHERE share_id=?',row.id);
 function enable(row,hours){store.run('INSERT INTO share_entries VALUES(?,?)',row.id,hours)}
 function describe(raw){const row=find(raw),c=eligible(row),settings=config(row);if(!settings)fail(404,'Share unavailable');const claim=claims.get(row.id);claims.assertAvailable(row.id,'classroom');const courseCode=code(c.id);if(!courseCode)fail(409,'Course code unavailable');return {classroomName:classroomName(),classroomLogos:classroomLogos(),course:c.id,title:JSON.parse(c.title),code:courseCode,instructor:!!claim?.instructor,singleUse:false,invitationExpires:claim?.invitation_expires||null,businessVersion:row.business_id,revision:row.revision,previewPages:1,durationHours:timing.info(row).durationHours,classroomHours:settings.classroom_hours,pptUrl:claim?.instructor?null:origin+'/ppt#share='+value(row.id),classroomUrl:origin+'/#invite='+value(row.id)}}
 function redeem(raw,s){const row=find(raw),c=eligible(row),settings=config(row);if(!settings)fail(404,'Share unavailable');if(s.course_id!==c.id||!validEmail(s.user.contact))fail(403,'Register for this course first');return store.transaction(()=>{
  claims.assertAvailable(row.id,'classroom',s.user_id);
  const claim=claims.get(row.id);
  if(claim?.instructor){
   if(claims.received(row.id,s.user_id)){const g=store.get('SELECT g.expires FROM instructor_grants g JOIN instructors i ON i.id=g.instructor_id WHERE i.username=? AND i.enabled=1 AND i.expires>? AND g.course_id=? AND g.expires>?',s.user.contact.trim().toLowerCase(),store.now(),c.id,store.now());return {ok:true,status:g?'approved':'revoked',role:'instructor',expires:g?.expires||null}}
   const expires=new Date(Date.now()+settings.classroom_hours*3600000).toISOString(),result=grantInvitedInstructor(store,s,c.id,expires,row.id);claims.claim(row.id,'classroom',s.user_id);return result;
  }
  // Reopening a link cannot reset an expired or revoked formal authorization.
  const enrollment=store.get('SELECT request_id FROM share_enrollments WHERE course_id=? AND user_id=?',c.id,s.user_id);
  if(enrollment){const r=store.get('SELECT * FROM requests WHERE id=?',enrollment.request_id);if(r?.status==='approved'&&r.expires>store.now())claims.claim(row.id,'classroom',s.user_id);return {ok:true,status:r?.status||'revoked',expires:r?.expires||null}}
  const prior=store.get('SELECT * FROM requests WHERE course_id=? AND user_id=? ORDER BY created DESC LIMIT 1',c.id,s.user_id);
  if(prior){if(prior.status==='approved'&&prior.expires>store.now())claims.claim(row.id,'classroom',s.user_id);return {ok:true,status:prior.status,expires:prior.expires||null}};
  const id=uid(),now=store.now(),expires=new Date(Date.parse(now)+settings.classroom_hours*3600000).toISOString();
  store.run("INSERT INTO requests(id,user_id,course_id,ip,status,expires,actor,created,decided,device_hash) VALUES(?,?,?,?,'approved',?,?,?,?,?)",id,s.user_id,c.id,s.ip,expires,'share:'+row.id,now,now,s.device_hash);
  store.run('INSERT INTO share_enrollments VALUES(?,?,?,?)',c.id,s.user_id,row.id,id);
  claims.claim(row.id,'classroom',s.user_id);
  store.audit(s.user_id,'share.classroom-enrolled',{share:row.id,course:c.id,request:id,expires});return {ok:true,status:'approved',expires};
 })}
 return {config,enable,describe,redeem};
}

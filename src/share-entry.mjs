import {uid,fail} from './security.mjs';
import {validEmail} from './email-identity.mjs';

// A dual-mode invitation is explicitly created by a permitted course sharer.
// Legacy PPT links never acquire this capability implicitly.
export function shareEntry(store,{find,eligible,timing,code,origin,value}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS share_entries(share_id TEXT PRIMARY KEY,classroom_hours INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS share_enrollments(course_id TEXT,user_id TEXT,share_id TEXT,request_id TEXT,PRIMARY KEY(course_id,user_id));`);
 const config=row=>store.get('SELECT * FROM share_entries WHERE share_id=?',row.id);
 function enable(row,hours){store.run('INSERT INTO share_entries VALUES(?,?)',row.id,hours);store.run('INSERT INTO ppt_share_review VALUES(?,1)',row.id)}
 function describe(raw){const row=find(raw),c=eligible(row),settings=config(row);if(!settings)fail(404,'Share unavailable');const courseCode=code(c.id);if(!courseCode)fail(409,'Course code unavailable');return {course:c.id,title:JSON.parse(c.title),code:courseCode,businessVersion:row.business_id,revision:row.revision,previewPages:1,durationHours:timing.info(row).durationHours,classroomHours:settings.classroom_hours,pptUrl:origin+'/ppt#share='+value(row.id),classroomUrl:origin+'/#invite='+value(row.id)}}
 function redeem(raw,s){const row=find(raw),c=eligible(row),settings=config(row);if(!settings)fail(404,'Share unavailable');if(s.course_id!==c.id||!validEmail(s.user.contact))fail(403,'Register for this course first');return store.transaction(()=>{
  // Reopening a link cannot reset an expired or revoked formal authorization.
  const enrollment=store.get('SELECT request_id FROM share_enrollments WHERE course_id=? AND user_id=?',c.id,s.user_id);
  if(enrollment){const r=store.get('SELECT * FROM requests WHERE id=?',enrollment.request_id);return {ok:true,status:r?.status||'revoked',expires:r?.expires||null}}
  const prior=store.get('SELECT * FROM requests WHERE course_id=? AND user_id=? ORDER BY created DESC LIMIT 1',c.id,s.user_id);
  if(prior)return {ok:true,status:prior.status,expires:prior.expires||null};
  const id=uid(),now=store.now(),expires=new Date(Date.parse(now)+settings.classroom_hours*3600000).toISOString();
  store.run("INSERT INTO requests(id,user_id,course_id,ip,status,expires,actor,created,decided,device_hash) VALUES(?,?,?,?,'approved',?,?,?,?,?)",id,s.user_id,c.id,s.ip,expires,'share:'+row.id,now,now,s.device_hash);
  store.run('INSERT INTO share_enrollments VALUES(?,?,?,?)',c.id,s.user_id,row.id,id);
  store.audit(s.user_id,'share.classroom-enrolled',{share:row.id,course:c.id,request:id,expires});return {ok:true,status:'approved',expires};
 })}
 return {config,enable,describe,redeem};
}

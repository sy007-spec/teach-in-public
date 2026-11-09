import {fail,uid} from './security.mjs';

export function accessCampaigns(store,{eligible=()=>true}={}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS access_campaigns(course_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,starts_at TEXT,ends_at TEXT,hours INTEGER NOT NULL DEFAULT 24,revision INTEGER NOT NULL DEFAULT 0,updated TEXT,actor TEXT);
 CREATE TABLE IF NOT EXISTS course_first_access(course_id TEXT,user_id TEXT,created TEXT NOT NULL,PRIMARY KEY(course_id,user_id));
 CREATE TABLE IF NOT EXISTS automatic_access_grants(request_id TEXT PRIMARY KEY,course_id TEXT,user_id TEXT,policy_revision INTEGER NOT NULL,created TEXT NOT NULL,UNIQUE(course_id,user_id));`);
 function describe(course){if(!store.get('SELECT id FROM courses WHERE id=?',course))fail(404,'Course not found');const r=store.get('SELECT * FROM access_campaigns WHERE course_id=?',course)||{course_id:course,enabled:0,starts_at:null,ends_at:null,hours:24,revision:0};const now=store.now();return {...r,enabled:!!r.enabled,serverTime:now,state:!r.enabled?'disabled':now<r.starts_at?'scheduled':now>=r.ends_at?'ended':'active',granted:store.get('SELECT COUNT(*) n FROM automatic_access_grants WHERE course_id=?',course).n};}
 function save(body,actor){const prior=describe(body.course);if(typeof body.enabled!=='boolean'||body.revision!==prior.revision)fail(409,'Configuration changed; reload before saving');const hours=body.hours??24;if(!Number.isInteger(hours)||hours<1||hours>2160)fail(400,'Access duration: 1–2160 hours');const date=value=>{if(!value)return null;if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,'Provide a valid date with timezone');return new Date(value).toISOString()};const start=date(body.startsAt),end=date(body.endsAt);if((body.enabled&&(!start||!end))||(start&&end&&start>=end))fail(400,'End time must be after start time');store.transaction(()=>{store.run('INSERT INTO access_campaigns VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,hours=excluded.hours,revision=excluded.revision,updated=excluded.updated,actor=excluded.actor',body.course,body.enabled?1:0,start,end,hours,prior.revision+1,store.now(),actor);store.audit(actor,'access.campaign-updated',{course:body.course,enabled:body.enabled,start,end,hours})});return describe(body.course);}
 function firstVisit(s,c,skip=false){if(!c?.enabled||!s.user_id||!eligible(c))return null;return store.transaction(()=>{
  if(store.get('SELECT 1 FROM course_first_access WHERE course_id=? AND user_id=?',c.id,s.user_id))return null;
  const now=store.now();store.run('INSERT INTO course_first_access VALUES(?,?,?)',c.id,s.user_id,now);
  // Historical visitors, pending applicants and revoked/expired grants never get a fresh trial.
  if(skip||store.get('SELECT 1 FROM course_visits WHERE course_id=? AND user_id=?',c.id,s.user_id)||store.get('SELECT 1 FROM requests WHERE course_id=? AND user_id=?',c.id,s.user_id)||store.get('SELECT 1 FROM inherited_access WHERE course_id=? AND user_id=?',c.id,s.user_id)||store.get('SELECT 1 FROM visits WHERE course_id=? AND user_id=?',c.id,s.user_id))return null;
  const policy=store.get('SELECT * FROM access_campaigns WHERE course_id=? AND enabled=1 AND starts_at<=? AND ends_at>?',c.id,now,now);if(!policy)return null;
  const id=uid(),expires=new Date(Date.parse(now)+policy.hours*3600000).toISOString();
  store.run("INSERT INTO requests(id,user_id,course_id,ip,status,expires,actor,created,decided,device_hash) VALUES(?,?,?,?,'approved',?,'automatic:first-visit',?,?,?)",id,s.user_id,c.id,s.ip,expires,now,now,s.device_hash);
  store.run('INSERT INTO automatic_access_grants VALUES(?,?,?,?,?)',id,c.id,s.user_id,policy.revision,now);
  store.audit('automatic:first-visit','access.auto-approved',{id,course:c.id,user:s.user_id,hours:policy.hours,expires,policyRevision:policy.revision});return {id,expires};
 });}
 return {describe,save,firstVisit};
}

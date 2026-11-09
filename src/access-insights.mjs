// Learning aggregates are business records, not diagnostic logs.
export function accessRows(rows,query){
 const now=Date.now(),status=query.get('status'),course=query.get('course'),q=(query.get('q')||'').trim().toLowerCase();
 const enriched=rows.map(r=>({...r,remainingSeconds:r.status!=='approved'||r.share_revoked?0:r.expires?Math.max(0,(Date.parse(r.expires)-now)/1000):r.durationHours? r.durationHours*3600:null}));
 const filtered=enriched.filter(r=>(!status||(r.effectiveStatus||r.status)===status)&&(!course||r.course_id===course)&&(!q||[r.name,r.email,r.contact,r.course_id].some(v=>String(v||'').toLowerCase().includes(q))));
 const keys={created:'created',name:'name',email:'email',visits:'visits',seconds:'seconds',remaining:'remainingSeconds',status:'status',lastVisit:'lastVisit'},key=keys[query.get('sort')]||'created',direction=query.get('direction')==='asc'?1:-1;
 filtered.sort((a,b)=>{const x=key==='email'?(a.email||a.contact):a[key],y=key==='email'?(b.email||b.contact):b[key];return direction*(typeof x==='number'||typeof y==='number'?(Number(x)||0)-(Number(y)||0):String(x||'').localeCompare(String(y||'')))||String(a.id).localeCompare(String(b.id))});return filtered;
}
export function personalAccess(store,query){
 const rows=store.all(`SELECT r.*,u.name,u.contact,EXISTS(SELECT 1 FROM automatic_access_grants ag WHERE ag.request_id=r.id) automatic,COALESCE(v.visits,0) visits,v.lastVisit,COALESCE(e.seconds,0) seconds FROM requests r JOIN users u ON u.id=r.user_id
 LEFT JOIN (SELECT user_id,course_id,COUNT(*) visits,MAX(created) lastVisit FROM visits WHERE created>=? GROUP BY user_id,course_id) v ON v.user_id=r.user_id AND v.course_id=r.course_id
 LEFT JOIN (SELECT user_id,course_id,SUM(seconds) seconds FROM events WHERE created>=? GROUP BY user_id,course_id) e ON e.user_id=r.user_id AND e.course_id=r.course_id`,new Date(Date.now()-7*86400000).toISOString(),new Date(Date.now()-7*86400000).toISOString());
 const source=query.get('source'),now=Date.now();const marked=rows.map(r=>({...r,effectiveStatus:r.status==='approved'&&r.expires&&Date.parse(r.expires)<=now?'expired':r.status})).filter(r=>!source||(source==='automatic'?!!r.automatic:source==='manual'?!r.automatic:true));
 const offset=Math.max(0,Math.min(100000,Number(query.get('offset'))||0));return accessRows(marked,query).slice(offset,offset+250);
}

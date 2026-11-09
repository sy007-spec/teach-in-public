import {fail} from './security.mjs';
import {knowledgeTerms} from './course-knowledge.mjs';
const text=value=>typeof value==='string'?value:Object.values(value||{}).filter(v=>typeof v==='string').join('\n');
const normalize=value=>String(value).normalize('NFKC').toLowerCase();
export function courseSearch(store,{knowledge,discussionScope,discussions,tutor}){
 function documents(c){const snap=knowledge.publicSnapshot(c),rows=[];for(const lesson of snap.courseMaterial.lessons)for(const p of lesson.pages)rows.push({id:p.id,type:'material',title:p.title,page:p.id,lesson:lesson.id,body:{zh:[p.objective?.zh,p.body?.zh,p.exercise?.question?.zh,p.exercise?.answer?.zh].filter(Boolean).join('\n\n'),en:[p.objective?.en,p.body?.en,p.exercise?.question?.en,p.exercise?.answer?.en].filter(Boolean).join('\n\n')}});for(const d of snap.references)rows.push({id:d.id,type:'knowledge',title:{zh:d.title,en:d.title},body:{zh:d.raw,en:d.raw}});return rows;}
 function source(c,type,id){const row=documents(c).find(r=>r.type===type&&r.id===id);if(!row)fail(404,'Source withdrawn, changed or unavailable');return {...row,revision:c.published};}
 function search(c,s,query){const raw=(query.get('q')||'').trim();if(!raw||raw.length>200)fail(400,'Search requires 1–200 characters');const phrase=normalize(raw),terms=knowledgeTerms(raw).slice(0,12);if(!terms.length)terms.push(phrase);
 const rank=(title,body)=>{const a=normalize(text(title)),b=normalize(text(body));return (a.includes(phrase)?20:0)+(b.includes(phrase)?10:0)+terms.reduce((n,t)=>n+(a.includes(t)?4:0)+(b.includes(t)?1:0),0)};
 const snippet=body=>{const value=text(body).replace(/[#*_`]/g,''),lower=normalize(value);let at=lower.indexOf(phrase);if(at<0)at=terms.map(t=>lower.indexOf(t)).find(i=>i>=0)??0;return value.slice(Math.max(0,at-70),Math.max(0,at-70)+320)};
 let rows=documents(c).map(r=>({...r,score:rank(r.title,r.body)})).filter(r=>r.score>0);
 // Filter in SQL before limiting; recheck current translation/AI validity before returning text.
 const access=discussionScope(c,s,'COALESCE(q.root_id,q.id)'),patterns=terms.map(t=>'%'+t.replace(/[\\%_]/g,'\\$&')+'%');
 const match=patterns.map(()=>"(q.body||COALESCE(a.translations,'')||COALESCE(a.body,'')||COALESCE((SELECT group_concat(body,' ') FROM discussion_translations WHERE question_id=q.id),'')) LIKE ? ESCAPE '\\'").join(' OR ');
 const candidates=store.all(`SELECT q.*,root.body root_body FROM questions q JOIN questions root ON root.id=COALESCE(q.root_id,q.id) LEFT JOIN ai_answers a ON a.question_id=q.id WHERE q.course_id=? AND q.removed=0 AND root.removed=0 AND ${access} AND (${match}) ORDER BY q.created DESC,q.id LIMIT 1001`,c.id,...patterns);
 for(const q of candidates.slice(0,1000)){const view=discussions.view(q,s.user_id),ai=tutor.view(q,c),body=[q.body,text(view.translations),...(ai?.status==='answered'?[text(ai.answers),ai.body]:[])].filter(Boolean).join('\n\n'),score=rank(q.root_body,body);if(score)rows.push({id:q.root_id||q.id,type:'discussion',title:{zh:q.root_body.slice(0,150),en:q.root_body.slice(0,150)},page:q.page_id,body,score});}
 const unique=new Map();for(const r of rows){const key=r.type+':'+r.id;if(!unique.has(key)||unique.get(key).score<r.score)unique.set(key,r)}rows=[...unique.values()];const counts=Object.fromEntries(['material','knowledge','discussion'].map(k=>[k,rows.filter(r=>r.type===k).length]));const type=query.get('type');if(type&&type!=='all'&&!Object.hasOwn(counts,type))fail(400,'Invalid source type');if(type&&type!=='all')rows=rows.filter(r=>r.type===type);rows.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return {items:rows.slice(offset,offset+20).map(({body,score,...r})=>({...r,snippet:snippet(body)})),total:rows.length,counts,offset,limited:candidates.length>1000,revision:c.published};
 }
 return {search,source};
}

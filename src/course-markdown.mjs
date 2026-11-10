import {createHash} from 'node:crypto';
import {fail,validateMaterial} from './security.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fields=['body','speaker','objective','question','answer'];
const value=(p,k,lang)=>(['question','answer'].includes(k)?p.exercise?.[k]:p[k])?.[lang];
export function serializeCourseMarkdown(material){
 validateMaterial(material);
 const safe=text=>{if(/^<!--\s*training:|^#\s+(?:业务版本|Business version)\s/m.test(text)||/^\s*:::v[1-9]/m.test(text))fail(400,'Material contains reserved structural markers');return text;};
 return '<!-- training:course -->\n\n'+['zh','en'].map(lang=>(lang==='en'?'<!-- training:en -->\n\n':'')+material.lessons.map(l=>'<!-- training:lesson '+l.id+' -->\n## '+safe(l.title[lang]).replace(/[\r\n]+/g,' ')+'\n\n'+l.pages.map(p=>'<!-- training:page '+p.id+' -->\n### '+safe(p.title[lang]).replace(/[\r\n]+/g,' ')+'\n\n'+fields.filter(k=>value(p,k,lang)).map(k=>'<!-- training:'+k+' -->\n'+safe(value(p,k,lang))).join('\n\n')).join('\n\n')).join('\n\n')).join('\n\n');
}
export function parseCourseMarkdown(text,{previous,filename='training.md'}={}){
 const halves=text.split(/^<!--\s*training:en\s*-->\s*$/m);if(halves.length>2)fail(400,'Only one English language marker is allowed');
 function language(raw){
  const lessons=[...raw.matchAll(/^<!--\s*training:lesson ([a-zA-Z0-9_-]{1,60})\s*-->\s*$/gm)];
  if(!lessons.length||lessons.length>12)fail(400,'Material needs 1–12 lessons');
  if(raw.slice(0,lessons[0].index).replace(/^<!--\s*training:course\s*-->\s*$/m,'').trim())fail(400,'Unexpected content before course lessons');
  return lessons.map((l,i)=>{
   const section=raw.slice(l.index+l[0].length,lessons[i+1]?.index??raw.length).trim(),heading=section.match(/^## ([^\n]+)\n/),pages=[...section.matchAll(/^<!--\s*training:page ([a-zA-Z0-9_-]{1,80})\s*-->\s*$/gm)];
   if(!heading||!pages.length||section.slice(heading[0].length,pages[0].index).trim())fail(400,'Lesson needs a title followed by page markers');
   return {id:l[1],title:heading[1].trim(),pages:pages.map((p,j)=>{
    const part=section.slice(p.index+p[0].length,pages[j+1]?.index??section.length).trim(),title=part.match(/^### ([^\n]+)\n/),blocks=[...part.matchAll(/^<!--\s*training:(body|speaker|objective|question|answer)\s*-->\s*$/gm)];
    if(!title||!blocks.length||part.slice(title[0].length,blocks[0].index).trim())fail(400,'Page title and fields required');
    const row={id:p[1],title:title[1].trim()};for(const [n,b] of blocks.entries()){if(row[b[1]]!==undefined)fail(400,'Duplicate page field');row[b[1]]=part.slice(b.index+b[0].length,blocks[n+1]?.index??part.length).trim();}
    if(!row.body||!!row.question!==!!row.answer)fail(400,'Page body and paired exercise required');return row;
   })};
  });
 }
 const zh=language(halves[0]),en=halves[1]?.trim()?language(halves[1]):null,warnings=[],checks={};
 if(!en)warnings.push('English translation is missing.');
 if(en&&JSON.stringify(zh.map(l=>[l.id,l.pages.map(p=>p.id)]))!==JSON.stringify(en.map(l=>[l.id,l.pages.map(p=>p.id)])))fail(400,'Chinese and English lesson/page IDs must match');
 const stamp=(p,lang)=>hash(JSON.stringify([p.title[lang],...fields.map(k=>value(p,k,lang))]));
 const old=new Map(previous?.lessons?.flatMap(l=>l.pages).map(p=>[p.id,p])||[]);
 const lessons=zh.map((z,i)=>({id:z.id,title:{zh:z.title,en:en?.[i].title||'Translation pending'},pages:z.pages.map((p,j)=>{
  const q=en?.[i].pages[j],page={id:p.id,title:{zh:p.title,en:q?.title||'Translation pending'}};
  for(const k of fields){if(q&&!!p[k]!==!!q[k])fail(400,'Chinese and English page fields must match');if(!p[k])continue;const pair={zh:p[k],en:q?.[k]||'Translation pending'};if(['question','answer'].includes(k)){page.exercise??={};page.exercise[k]=pair;}else page[k]=pair;}
  const prior=old.get(p.id),baseline=previous?.source?.translationChecks?.[p.id]||(prior?{zh:stamp(prior,'zh'),en:stamp(prior,'en')}:null),zhHash=stamp(page,'zh'),enHash=stamp(page,'en');
  const unresolved=previous?.source?.languageReady===false&&(!previous.source.translationChecks?.[p.id]||previous.source.warnings?.some(w=>w.includes(p.id)))&&prior&&stamp(prior,'en')===enHash;
  const stale=!!(en&&baseline&&(baseline.zh!==zhHash&&baseline.en===enHash||unresolved));if(stale)warnings.push(p.id+': English translation requires review');if(en)checks[p.id]=stale?baseline:{zh:zhHash,en:enHash};return page;
 })}));
 const material={lessons,source:{format:'course-pages-md',parserVersion:3,filename:String(filename).split(/[\\/]/).pop().slice(0,200),sha256:hash(text),languageReady:!!en&&!warnings.length,translationChecks:checks,warnings}};
 validateMaterial(material);return {material,markdown:text,summary:{lessons:lessons.length,pages:lessons.reduce((n,l)=>n+l.pages.length,0),features:0,sha256:material.source.sha256,warnings}};
}

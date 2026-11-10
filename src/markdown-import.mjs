import {parseCourseMarkdown,serializeCourseMarkdown} from './course-markdown.mjs';
import {createHash} from 'node:crypto';
import {fail,validateMaterial} from './security.mjs';
// Stable layout, not teaching prose. Feature IDs remain the source of grouping.
const layouts=[['manager','A',[[],[1,2],[3,4,5],[6],[7,8],[9,12],[10,11],[13],[]]],['investor','B',[[],[1,2],[3,4],[5,6],[7,8],[9],[10],[11,12,13],[14,15],[]]],['operations','C',[[],[1,2],[3],[4,5,6],[7,8],[9],[10],[11,12],[]]]];
export const markdownHash=text=>createHash('sha256').update(text).digest('hex');
function parseLanguage(text,lang){
 text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(match,label,url)=>/^https?:\/\//i.test(url)?match:label);
 const headings=[...text.matchAll(/^##\s+(?:第([一二三])讲[：:]|Lesson\s+([123])\s*:)(.+)$/gm)];
 if(headings.length!==3)fail(400,lang+': expected three lesson headings');
 const preamble=text.slice(0,headings[0].index).trim();
 return headings.map((h,i)=>{if((h[1]?['一','二','三'].indexOf(h[1]):Number(h[2])-1)!==i)fail(400,'Lesson order must be 1, 2, 3');const section=text.slice(h.index+h[0].length,headings[i+1]?.index??text.length).trim(),rows=new Map();
 const lines=section.split('\n');let first=-1,last=-1;const prefix=layouts[i][1];
 lines.forEach((line,n)=>{if(!/^\s*\|\s*[A-Z]\d+\s*\|/.test(line))return;const cells=line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(s=>s.trim());const id=cells[0];if(!new RegExp('^'+prefix+'\\d{2}$').test(id)||cells.length!==4||cells.some(s=>!s)||rows.has(id))fail(400,'Invalid or duplicate feature row: '+id);rows.set(id,{id,title:cells[1],line});if(first<0)first=n;last=n});
 if(!rows.size)fail(400,'Lesson feature table is missing');
 const headerStart=first-2;if(headerStart<0||!/^\s*\|[\s:|\-]+\|\s*$/.test(lines[first-1]))fail(400,'Feature table needs a header and separator');
 const before=lines.slice(0,headerStart).join('\n').trim(),after=lines.slice(last+1).join('\n').trim();
 // Do not silently drop explanatory text inserted between feature rows.
 for(let n=first;n<=last;n++)if(lines[n].trim()&&!/^\s*\|\s*[A-Z]\d+\s*\|/.test(lines[n]))fail(400,'Keep explanatory paragraphs outside the feature table');
 return {title:h[3].trim(),before,after,preamble:i===0?preamble:'',rows,header:lines.slice(headerStart,first).join('\n')};
 });
}
export function parseTrainingMarkdown(raw,{previous=null,filename='training.md'}={}){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>22000000||raw.includes('\0'))fail(400,'Upload a UTF-8 Markdown file no larger than 22 MB');
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(/^<!--\s*training:course\s*-->\s*$/m.test(text))return parseCourseMarkdown(text,{previous,filename});if(/^<!--\s*training:pages\s*-->\s*$/m.test(text))return parsePageSnapshot(text,{previous,filename});const halves=text.split(/^<!--\s*training:en\s*-->\s*$/m);if(halves.length>2)fail(400,'Only one English language marker is allowed');
 const zh=parseLanguage(halves[0],'zh'),en=halves[1]?.trim()?parseLanguage(halves[1],'en'):null;const warnings=[];if(!en)warnings.push('English translation is missing. Add <!-- training:en --> followed by the English version before publishing.');
 const translationChecks={};const old=new Map(previous?.lessons?.flatMap(l=>l.pages).map(p=>[p.id,p])||[]);
 const lessons=layouts.map(([id,prefix,groups],li)=>{const z=zh[li],e=en?.[li];if(e&&JSON.stringify([...z.rows.keys()].sort())!==JSON.stringify([...e.rows.keys()].sort()))fail(400,'Chinese and English feature IDs must match');const used=new Set();const pages=groups.map((numbers,pi)=>{const pageId=id+'-'+String(pi+1).padStart(2,'0');let ids=numbers.map(n=>prefix+String(n).padStart(2,'0'));for(const key of ids){if(!z.rows.has(key))fail(400,'Missing stable feature '+key);used.add(key)}const render=(section,language)=>{if(!section)return {title:'Translation pending',body:'English translation pending. This draft cannot be published.'};if(pi===0)return {title:section.title,body:[section.preamble,section.before].filter(Boolean).join('\n\n')||section.title};if(pi===groups.length-1)return {title:language==='zh'?'讲解与核验':'Discussion and verification',body:section.after||section.before||section.title};return {title:ids.map(key=>section.rows.get(key).title).join(' / '),body:section.header+'\n'+ids.map(key=>section.rows.get(key).line).join('\n')};};const a=render(z,'zh'),b=render(e,'en');return {id:pageId,title:{zh:a.title,en:b.title},body:{zh:a.body,en:b.body},sourceFeatures:ids}});
 for(const [key,row]of z.rows)if(!used.has(key)){const translated=e?.rows.get(key);pages.splice(pages.length-1,0,{id:id+'-'+key.toLowerCase(),title:{zh:row.title,en:translated?.title||'Translation pending'},body:{zh:z.header+'\n'+row.line,en:translated?e.header+'\n'+translated.line:'English translation pending. This draft cannot be published.'},sourceFeatures:[key]})}
 for(const page of pages){const prior=old.get(page.id),zhHash=markdownHash(JSON.stringify([page.title.zh,page.body.zh])),enHash=markdownHash(JSON.stringify([page.title.en,page.body.en]));const baseline=previous?.source?.translationChecks?.[page.id]||(previous?.source?.languageReady&&prior?{zh:markdownHash(JSON.stringify([prior.title.zh,prior.body.zh])),en:markdownHash(JSON.stringify([prior.title.en,prior.body.en]))}:null);const stale=!!(en&&baseline&&baseline.zh!==zhHash&&baseline.en===enHash);if(stale)warnings.push(page.id+': Chinese changed but English did not; review and update the translation.');if(en)translationChecks[page.id]=stale?baseline:{zh:zhHash,en:enHash};}

 return {id,title:{zh:z.title,en:e?.title||'Translation pending'},pages};});
 const material={lessons,source:{format:'pamm-three-lessons-md',parserVersion:1,filename:String(filename).split(/[\\/]/).pop().slice(0,200),sha256:markdownHash(text),languageReady:!!en&&!warnings.length,translationChecks,warnings}};validateMaterial(material);return {material,markdown:text,summary:{lessons:3,pages:lessons.reduce((n,l)=>n+l.pages.length,0),features:zh.reduce((n,l)=>n+l.rows.size,0),sha256:material.source.sha256,warnings}};
}

// Existing authoring syntax: unmarked text is shared; each version block is exclusive.
// Fenced examples are literal text, never version directives.
export function projectBusinessMarkdown(raw){
 const lines=raw.split('\n'),parts=[],ids=new Set(['v1']);let active=null,fence=null;
 for(const line of lines){
  const code=line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if(code){if(!fence)fence=code[1];else if(code[1][0]===fence[0]&&code[1].length>=fence.length)fence=null;parts.push({active,line});continue}
  if(!fence){const marker=line.match(/^\s*:::(v[1-9]\d*)(?:\s+.*)?\s*$/);
   if(marker){if(active)fail(400,'Nested business version blocks are not allowed');active=marker[1];ids.add(active);continue}
   if(/^\s*:::\s*$/.test(line)){if(!active)fail(400,'Business version closing marker has no opening marker');active=null;continue}
  }
  parts.push({active,line});
 }
 if(active)fail(400,'Unclosed business version block');if(ids.size>12)fail(400,'Maximum 12 business versions per upload');
 return [...ids].map(id=>({id,text:parts.filter(p=>!p.active||p.active===id).map(p=>p.line).join('\n')}));
}

// One document revision can contain independently governed business versions.
export function parseTrainingDocument(raw,{previousByBusiness={},filename='training.md'}={}){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>22000000)fail(400,'Upload a UTF-8 Markdown file no larger than 22 MB');
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();const markers=[...text.matchAll(/^#\s+(?:业务版本|Business version)\s+([a-z][a-z0-9_-]{0,31})(?:\s*[:：].*)?\s*$/gm)];
 if(!markers.length){const branches=projectBusinessMarkdown(text);const versions=branches.map(({id,text:section})=>{const parsed=parseTrainingMarkdown(section,{previous:previousByBusiness[id],filename});parsed.material.source.sha256=markdownHash(text);parsed.material.source.businessVersion=id;return {id,...parsed}});return {material:versions[0].material,markdown:text,businessVersions:versions.map(v=>({id:v.id,material:v.material})),summary:{lessons:versions.reduce((n,v)=>n+v.summary.lessons,0),pages:versions.reduce((n,v)=>n+v.summary.pages,0),features:versions.reduce((n,v)=>n+v.summary.features,0),sha256:markdownHash(text),warnings:versions.flatMap(v=>v.summary.warnings.map(w=>v.id+': '+w)),businessVersions:versions.map(v=>({id:v.id,lessons:v.summary.lessons,pages:v.summary.pages,features:v.summary.features,warnings:v.summary.warnings}))}}}
 if(markers.length>12)fail(400,'Maximum 12 business versions per upload');if(text.slice(0,markers[0].index).trim())fail(400,'Put each business version under its heading, starting on the first line');
 const ids=new Set(),versions=markers.map((m,i)=>{const id=m[1];if(ids.has(id))fail(400,'Duplicate business version: '+id);ids.add(id);const section=text.slice(m.index+m[0].length,markers[i+1]?.index??text.length).trim();const parsed=parseTrainingMarkdown(section,{previous:previousByBusiness[id],filename});parsed.material.source.sha256=markdownHash(text);parsed.material.source.businessVersion=id;return {id,...parsed}});
 return {material:versions[0].material,markdown:text,businessVersions:versions.map(v=>({id:v.id,material:v.material})),summary:{lessons:versions.reduce((n,v)=>n+v.summary.lessons,0),pages:versions.reduce((n,v)=>n+v.summary.pages,0),features:versions.reduce((n,v)=>n+v.summary.features,0),sha256:markdownHash(text),warnings:versions.flatMap(v=>v.summary.warnings.map(w=>v.id+': '+w)),businessVersions:versions.map(v=>({id:v.id,lessons:v.summary.lessons,pages:v.summary.pages,features:v.summary.features,warnings:v.summary.warnings}))}};
}

// Readable, round-trippable exports for historical page-based snapshots.
export function serializeTrainingDocument(branches){
 const fields=['body','speaker','objective','question','answer'];
 return branches.map(({id,material})=>material.lessons.length!==3||material.lessons.some((l,i)=>l.id!==layouts[i][0])?'# 业务版本 '+id+'\n\n'+serializeCourseMarkdown(material):'# 业务版本 '+id+'\n\n<!-- training:pages -->\n\n'+['zh','en'].map((lang,li)=>(li?'<!-- training:en -->\n\n':'')+material.lessons.map((lesson,i)=>'## '+(lang==='zh'?'第'+['一','二','三'][i]+'讲：':'Lesson '+(i+1)+': ')+lesson.title[lang]+'\n\n'+lesson.pages.map(page=>'<!-- training:page '+page.id+' -->\n### '+page.title[lang]+'\n\n'+fields.filter(key=>['question','answer'].includes(key)?page.exercise?.[key]:page[key]).map(key=>'<!-- training:'+key+' -->\n'+(['question','answer'].includes(key)?page.exercise[key][lang]:page[key][lang])).join('\n\n')).join('\n\n')).join('\n\n')).join('\n\n')).join('\n\n')+'\n';
}
function parsePageSnapshot(text,{previous,filename}){
 const halves=text.split(/^<!--\s*training:en\s*-->\s*$/m);if(halves.length>2)fail(400,'Only one English language marker is allowed');
 function language(raw,lang){raw=raw.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(match,label,url)=>/^https?:\/\//i.test(url)?match:label);const headings=[...raw.matchAll(/^##\s+(?:第([一二三])讲[：:]|Lesson\s+([123])\s*:)(.+)$/gm)];if(headings.length!==3)fail(400,'Expected three lesson headings');return headings.map((h,i)=>{if((h[1]?['一','二','三'].indexOf(h[1]):Number(h[2])-1)!==i)fail(400,'Lesson order must be 1, 2, 3');const section=raw.slice(h.index+h[0].length,headings[i+1]?.index??raw.length),markers=[...section.matchAll(/^<!--\s*training:page\s+([a-zA-Z0-9_-]{1,80})\s*-->\s*$/gm)];if(!markers.length)fail(400,'Page markers are required');return {title:h[3].trim(),pages:markers.map((m,j)=>{const part=section.slice(m.index+m[0].length,markers[j+1]?.index??section.length).trim(),title=part.match(/^###\s+(.+)$/m)?.[1],blocks=[...part.matchAll(/^<!--\s*training:(body|speaker|objective|question|answer)\s*-->\s*$/gm)],data={id:m[1],title};if(!title)fail(400,'Page title is missing');for(const [k,b]of blocks.entries()){if(data[b[1]]!==undefined)fail(400,'Duplicate page field');data[b[1]]=part.slice(b.index+b[0].length,blocks[k+1]?.index??part.length).trim()}if(!data.body)fail(400,'Page body is missing');if(!!data.question!==!!data.answer)fail(400,'Scenario question and answer must be paired');return data})}})}
 const zh=language(halves[0],'zh'),en=halves[1]?.trim()?language(halves[1],'en'):null,warnings=[],translationChecks={},old=new Map(previous?.lessons?.flatMap(l=>l.pages).map(p=>[p.id,p])||[]);
 if(!en)warnings.push('English translation is missing.');
 const lessons=zh.map((z,i)=>{const e=en?.[i];if(e&&JSON.stringify(z.pages.map(p=>p.id))!==JSON.stringify(e.pages.map(p=>p.id)))fail(400,'Chinese and English page IDs must match');return {id:layouts[i][0],title:{zh:z.title,en:e?.title||'Translation pending'},pages:z.pages.map((p,j)=>{const q=e?.pages[j],page={id:p.id,title:{zh:p.title,en:q?.title||'Translation pending'}};for(const field of ['body','speaker','objective','question','answer']){if(q&&!!p[field]!==!!q[field])fail(400,'Chinese and English page fields must match');if(!p[field])continue;const value={zh:p[field],en:q?.[field]||'Translation pending'};if(['question','answer'].includes(field)){page.exercise??={};page.exercise[field]=value}else page[field]=value}const prior=old.get(page.id),stamp=(value,lang)=>markdownHash(JSON.stringify([value.title[lang],value.body[lang],value.speaker?.[lang],value.objective?.[lang],value.exercise?.question?.[lang],value.exercise?.answer?.[lang]]));const zhHash=stamp(page,'zh'),enHash=stamp(page,'en'),baseline=(previous?.source?.parserVersion===2?previous?.source?.translationChecks?.[page.id]:null)||(prior?{zh:stamp(prior,'zh'),en:stamp(prior,'en')}:null),stale=!!(en&&baseline&&(baseline.zh!==zhHash&&baseline.en===enHash||previous?.source?.languageReady===false&&previous.source.warnings?.some(w=>w.includes(page.id))&&prior&&stamp(prior,'en')===enHash));if(stale)warnings.push(page.id+': Chinese changed but English did not');if(en)translationChecks[page.id]=stale?baseline:{zh:zhHash,en:enHash};return page})}});
 const material={lessons,source:{format:'pamm-three-lessons-md',parserVersion:2,filename:String(filename).split(/[\\/]/).pop(),sha256:markdownHash(text),languageReady:!!en&&!warnings.length,translationChecks,warnings}};validateMaterial(material);return {material,markdown:text,summary:{lessons:3,pages:lessons.reduce((n,l)=>n+l.pages.length,0),features:0,sha256:material.source.sha256,warnings}};
}

// Language files are paired by explicit metadata and business IDs, never file order.
function documentSections(raw){
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 const markers=[...text.matchAll(/^#\s+(?:业务版本|Business version)\s+([a-z][a-z0-9_-]{0,31})(?:\s*[:：].*)?\s*$/gm)];
 if(!markers.length)return projectBusinessMarkdown(text);
 if(text.slice(0,markers[0].index).trim())fail(400,'Unexpected content before business versions');
 const ids=new Set();return markers.map((m,i)=>{if(ids.has(m[1]))fail(400,'Duplicate business version');ids.add(m[1]);return {id:m[1],text:text.slice(m.index+m[0].length,markers[i+1]?.index??text.length).trim()}});
}
export function splitTrainingLanguages(raw){
 const sections=documentSections(raw);
 return ['zh','en'].map(language=>({language,markdown:'<!-- training:language '+language+' -->\n\n'+sections.map(b=>{const halves=b.text.split(/^<!--\s*training:en\s*-->\s*$/m);if(halves.length!==2||!halves[1].trim())fail(400,'Complete bilingual material required for language export');const part=halves[language==='zh'?0:1].trim(),format=halves[0].match(/^<!--\s*training:(pages|course)\s*-->\s*$/m)?.[1];return (language==='en'?'# Business version ':'# 业务版本 ')+b.id+'\n\n'+(language==='en'&&format?'<!-- training:'+format+' -->\n\n':'')+part}).join('\n\n')+'\n'}));
}
export function combineTrainingLanguages(files){
 if(!Array.isArray(files)||files.length!==2)fail(400,'Select both Chinese and English Markdown files');
 const languages=new Map();let total=0;
 for(const file of files){if(typeof file?.markdown!=='string'||file.markdown.includes('\0'))fail(400,'Invalid Markdown language file');total+=Buffer.byteLength(file.markdown);if(total>22000000)fail(400,'Combined Markdown must be no larger than 22 MB');
 const text=file.markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim(),marker=text.match(/^<!--\s*training:language (zh|en)\s*-->\n/);if(!marker)fail(400,'Each file needs a training:language zh or en marker');const language=marker[1];if(languages.has(language))fail(400,'Select one Chinese and one English file');const raw=text.slice(marker[0].length).trim();if(/<!--\s*training:(?:en|language)\b/.test(raw))fail(400,'Language files must not contain mixed language sections');languages.set(language,documentSections(raw));}
 const zh=languages.get('zh'),en=languages.get('en');if(!zh||!en||JSON.stringify(zh.map(b=>b.id).sort())!==JSON.stringify(en.map(b=>b.id).sort()))fail(400,'Chinese and English business versions must match');
 return zh.map(b=>{const e=en.find(x=>x.id===b.id);if(b.text.match(/training:(pages|course)/)?.[1]!==e.text.match(/training:(pages|course)/)?.[1])fail(400,'Chinese and English document formats must match');return '# 业务版本 '+b.id+'\n\n'+b.text+'\n\n<!-- training:en -->\n\n'+e.text.replace(/^<!--\s*training:(?:pages|course)\s*-->\s*$/m,'').trim()}).join('\n\n')+'\n';
}

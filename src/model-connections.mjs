import {diagnostics} from './model-diagnostics.mjs';
import {geminiPool} from './gemini-pool.mjs';
import {fail,uid} from './security.mjs';
export function modelConnections(store,{runtime,fetcher,hosting}={}){
 const pools=new Map(),logs=diagnostics(store);
 const legacyGemini=()=>store.setting('geminiPool',{}),legacyCustom=()=>store.setting('customLLM',{});
 function index(){const saved=store.setting('modelConnections');if(saved)return saved;const profiles=[];if(legacyGemini().keys?.length)profiles.push({id:'legacy-gemini',name:'Gemini',enabled:!!legacyGemini().enabled});if(legacyCustom().key)profiles.push({id:'legacy-custom',name:'Custom model',enabled:true});return {revision:0,active:legacyGemini().enabled&&legacyGemini().keys?.length?'legacy-gemini':legacyCustom().key?'legacy-custom':null,profiles}}
 function pool(id){if(!pools.has(id)){let adapter=store,legacyPlain=false,configKey='modelConnection:'+id,healthKey=configKey+':health';if(id==='legacy-gemini'){configKey='geminiPool';healthKey='geminiPoolHealth'}if(id==='legacy-custom'){legacyPlain=true;adapter={...store,setting:(k,f)=>k===configKey?{enabled:true,provider:'compatible',baseURL:legacyCustom().baseURL,model:legacyCustom().model,cooldownHours:24,keys:[{id:'legacy',label:'Custom',project:'custom',secret:legacyCustom().key}]}:store.setting(k,f)}}pools.set(id,geminiPool(adapter,{runtime,fetcher,configKey,healthKey,allowCustom:true,hosting,legacyPlain}))}return pools.get(id)}
 function describe(){const i=index(),managed=!!store.setting('modelConnections'),active=i.profiles.find(p=>p.id===i.active&&p.enabled);return {logs:logs.list(),revision:i.revision,active:i.active,managed,enabled:!!active&&(managed||active.id==='legacy-gemini'),configured:!!active,profiles:i.profiles.map(p=>({...p,...pool(p.id).describe(),enabled:p.enabled,active:p.id===i.active}))}}
 function update(body){const i=index();if(body.revision!==i.revision)fail(409,'配置已更新，请重新打开 / Configuration changed; reload before saving');const selected=i.profiles.find(p=>p.id===body.id);if(body.action==='save'){
  if(!selected&&i.profiles.length>=20)fail(400,'Use up to 20 saved connections');const name=String(body.name||'').trim();if(!name||name.length>80)fail(400,'Connection name required');
  const before=selected?pool(selected.id).describe():null;if(selected?.enabled)fail(409,'请先停用再编辑，原配置仍保留 / Disable before editing; saved configuration is retained');
  if(before?.configured&&body.keys!==undefined&&!body.replaceKeys)fail(409,'请明确确认替换密钥 / Confirm key replacement');
  if(before&&before.provider!==body.provider&&!body.keys)fail(400,'Changing provider requires replacement keys');
  const id=selected?.id.startsWith('legacy-')?uid():selected?.id||uid();let keys=body.keys;
  if(selected?.id==='legacy-custom'&&keys===undefined){if(body.baseURL!==legacyCustom().baseURL)fail(400,'Changing endpoint requires replacement keys');keys=[{project:'custom',label:'Custom',key:legacyCustom().key}]}
  if(selected?.id==='legacy-gemini'&&keys===undefined)store.set('modelConnection:'+id,legacyGemini());
  pool(id).configure({enabled:true,provider:body.provider,baseURL:body.baseURL,model:body.model,cooldownHours:body.cooldownHours,keys});
  const entry={id,name,enabled:false};if(selected)i.profiles.splice(i.profiles.indexOf(selected),1,entry);else i.profiles.push(entry);
 }else if(body.action==='reset_cooldown'){
  if(!selected)fail(404,'Saved connection not found');pool(selected.id).resetHealth();
 }else if(body.action==='enable'||body.action==='disable'){
  if(!selected)fail(404,'Saved connection not found');selected.enabled=body.action==='enable';if(selected.enabled)i.active=selected.id;else if(i.active===selected.id)i.active=null;
 }else fail(400,'Invalid configuration action');
 i.revision++;store.set('modelConnections',i);return describe();
 }
 async function test(id){const p=index().profiles.find(x=>x.id===id);if(!p)fail(404,'Saved connection not found');return pool(p.id).probe()}
 return {describe,test,update:body=>store.transaction(()=>update(body)),request:async(messages,options)=>{const i=index(),active=i.profiles.find(p=>p.id===i.active&&p.enabled);if(!active)fail(503,'No enabled connection');return pool(active.id).request(messages,options)}};
}

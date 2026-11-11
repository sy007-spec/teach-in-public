import {modelRequestBody} from './model-policy.mjs';
import {fail} from './security.mjs';
export function customModelHealth(store,{fetcher=fetch}={}){
 const now=()=>Date.parse(store.now());
 function record(status){if(status>=200&&status<300)store.set('customLLMHealth',{until:0,lastProbe:now(),status});else if([401,402,403,404,408,429].includes(status)||status>=500)store.set('customLLMHealth',{until:now()+86400000,lastProbe:now(),status})}
 function check(){const h=store.setting('customLLMHealth',{});if(h.until>now())fail(503,'自有模型正在冷却，请稍后再试 / Your model connection is cooling down; try later')}
 async function probe(){const c=store.setting('customLLM',{}),h=store.setting('customLLMHealth',{});if(!c.key)return 'unconfigured';if(now()-(h.lastProbe||0)>=600000){try{const r=await fetcher(c.baseURL+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+c.key,'content-type':'application/json'},body:modelRequestBody({model:c.model,max_tokens:8,messages:[{role:'user',content:'Reply OK.'}]})});const result=await r.json().catch(()=>null);record(r.ok&&result?.choices?.length?200:r.ok?502:r.status)}catch{record(503)}}const next=store.setting('customLLMHealth',{});return next.until?'unavailable':next.status?'available':'unknown'}
 return {record,check,probe};
}

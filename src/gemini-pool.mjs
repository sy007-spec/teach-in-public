import {diagnostics,limitedJson,modelFailureCode} from './model-diagnostics.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fail,uid} from './security.mjs';

// Per-call limit; AI_TUTOR_SPEC allows 45 s for a single model call.
export const CALL_TIMEOUT_MS=45000;
const SHORT_COOLDOWN_MS=5*60000,MAX_SHORT_COOLDOWN_MS=60*60000;
const LONG_COOLDOWN=new Set(['model_auth_invalid','model_billing_required','model_permission_denied']);
function retryAfterMs(value){if(!value)return 0;const s=Number(value);if(Number.isFinite(s))return Math.max(0,s*1000);const t=Date.parse(value);return Number.isFinite(t)?Math.max(0,t-Date.now()):0}
export function geminiPool(store,{runtime,fetcher=fetch,configKey="geminiPool",healthKey="geminiPoolHealth",allowCustom=false,hosting,legacyPlain=false}={}){
 let cursor=0;const logs=diagnostics(store);
 const config=()=>store.setting(configKey,{});
 function secretKey(){const file=path.join(runtime,'course-ai.key');if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600,flag:'wx'});return fs.readFileSync(file)}
 function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString('base64')}
 function unseal(value){if(legacyPlain)return value;const raw=Buffer.from(value,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',secretKey(),raw.subarray(0,12));dec.setAuthTag(raw.subarray(-16));return Buffer.concat([dec.update(raw.subarray(12,-16)),dec.final()]).toString()}
 function describe(){const c=config(),health=store.setting(healthKey,{});return {enabled:!!c.enabled,configured:!!c.keys?.length,provider:c.provider||'gemini',baseURL:c.baseURL||'',model:c.model||'gemini-flash-latest',cooldownHours:c.cooldownHours||24,logs:logs.list(),keys:(c.keys||[]).map(k=>{const h=health[k.project],active=Date.parse(h?.until||0)>Date.now();return {id:k.id,label:k.label,project:k.project,cooldownUntil:h?.until||null,cooldownActive:active,cooldownReason:active?h.reason||null:null}})}}
 function configure(body){if(typeof body.enabled!=='boolean')fail(400,'Enabled must be a boolean');const old=config(),model=String(body.model||'gemini-flash-latest');const provider=allowCustom&&body.provider==='compatible'?'compatible':'gemini';let baseURL='';if(provider==='gemini'){if(!/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(model))fail(400,'Invalid Gemini model')}else{if(!model.trim()||model.length>200)fail(400,'Model name required');let url;try{url=new URL(body.baseURL)}catch{fail(400,'Invalid model URL')}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail(400,'HTTPS model URL required');if(hosting&&!['api.openai.com','api.deepseek.com','generativelanguage.googleapis.com','dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','openrouter.ai','api.mistral.ai','api.groq.com',...String(process.env.TRAINING_LLM_ALLOWED_HOSTS||'').split(',')].includes(url.hostname))fail(400,'Model host is not approved by the platform');baseURL=url.href.replace(/\/$/,'');if(old.baseURL&&old.baseURL!==baseURL&&!body.keys)fail(400,'Changing endpoint requires replacement keys')}const hours=body.cooldownHours??24;if(!Number.isInteger(hours)||hours<1||hours>168)fail(400,'Cooldown must be 1–168 hours');let keys=old.keys||[];
  if(body.keys!==undefined){if(!Array.isArray(body.keys)||body.keys.length>20)fail(400,'Use up to 20 API keys');const seen=new Set();keys=body.keys.map(k=>{const prior=keys.find(x=>x.id===k.id),key=k.key?String(k.key).trim():prior?unseal(prior.secret):'';if(!key||key.length>4096||/\s/.test(key)||seen.has(key))fail(400,'Provide distinct API keys');seen.add(key);const project=String(k.project||'').trim(),label=String(k.label||'Gemini').trim();if(!/^[\w.-]{1,100}$/.test(project)||label.length>80)fail(400,'Provide a project group and short label');return {id:prior?.id||uid(),label,project,secret:seal(key)}})}
  if(body.enabled&&!keys.length)fail(400,'Configure at least one API key');store.set(configKey,{enabled:body.enabled,model,provider,baseURL,cooldownHours:hours,keys});return describe();
 }
 function send(c,key,messages,{maxTokens,signal,timeout=CALL_TIMEOUT_MS}){return fetcher(c.provider==='compatible'?c.baseURL+'/chat/completions':'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'content-type':'application/json',authorization:'Bearer '+unseal(key.secret)},body:JSON.stringify({model:c.model,...(c.provider==='compatible'?(new URL(c.baseURL).hostname==='api.deepseek.com'?{thinking:{type:'disabled'}}:{}):{reasoning_effort:'low'}),max_tokens:maxTokens,response_format:{type:'json_object'},messages})})}
 // Admin availability test: calls every saved key once, ignoring cooldown and enabled state.
 // A passing key's project group leaves cooldown; a failing key keeps its current state, so a test never locks a key.
 async function probe(){const c=config();if(!c.keys?.length)fail(400,'No API keys saved for this connection');const messages=[{role:'system',content:'Connectivity check. Reply with the JSON object {"ok":true} only.'},{role:'user',content:'ping'}],results=[];
  for(const key of c.keys){const started=Date.now();let result;
   try{const response=await send(c,key,messages,{maxTokens:200,timeout:30000});
    if(!response.ok){const data=await limitedJson(response);logs.record({project:key.project,model:c.model,status:response.status,data,headers:response.headers,elapsedMs:Date.now()-started});result={ok:false,status:response.status,code:modelFailureCode(data,response.status),detail:String(data?.error?.message||data?.message||'').slice(0,300)}}
    else{const data=await limitedJson(response),content=data?.choices?.[0]?.message?.content;logs.record({project:key.project,model:c.model,status:response.status,data,elapsedMs:Date.now()-started});try{JSON.parse(content);result={ok:true,status:response.status}}catch{result={ok:false,status:response.status,code:'answer_format_failed',detail:String(content??'').slice(0,300)}}}
   }catch(e){const kind=e.name==='TimeoutError'?'timeout':'network_or_response_error';logs.record({project:key.project,model:c.model,kind,elapsedMs:Date.now()-started});result={ok:false,code:kind==='timeout'?'model_timeout':'model_connection_failed',detail:String(e.message||'').slice(0,300)}}
   results.push({id:key.id,label:key.label,project:key.project,elapsedMs:Date.now()-started,...result})}
  const health=store.setting(healthKey,{});for(const r of results)if(r.ok)delete health[r.project];store.set(healthKey,health);
  return {model:c.model,provider:c.provider||'gemini',baseURL:c.baseURL||'',tested:new Date().toISOString(),results,connection:describe()}}
 async function request(messages,{maxTokens=4000,signal}={}){const c=config();if(!c.enabled||!c.keys?.length)fail(503,'课程智能问答尚未配置 / Course AI is not configured');let health=store.setting(healthKey,{});const keys=c.keys,attempted=new Set();let failureCode=null;
  for(let n=0;n<keys.length&&attempted.size<2;n++){const key=keys[(cursor++)%keys.length];if(signal?.aborted)break;if(attempted.has(key.project))continue;if(Date.parse(health[key.project]?.until||0)>Date.now()){failureCode=health[key.project]?.reason||failureCode;continue;}attempted.add(key.project);const started=Date.now();
   try{const response=await send(c,key,messages,{maxTokens:Math.max(2048,maxTokens),signal});
    if(!response.ok){const data=await limitedJson(response);logs.record({project:key.project,model:c.model,status:response.status,data,headers:response.headers,elapsedMs:Date.now()-started});failureCode=modelFailureCode(data,response.status);if(LONG_COOLDOWN.has(failureCode)||[401,402,403,408,429].includes(response.status)||response.status>=500){cool(key.project,{status:response.status,reason:failureCode,retryAfter:response.headers.get('retry-after')});continue}throw Object.assign(Error('Model rejected the request'),{status:502,code:failureCode})}
    const reader=response.body.getReader();let size=0,parts=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();throw Error('Response limit')}parts.push(value)}const data=JSON.parse(Buffer.concat(parts).toString());JSON.parse(data.choices[0].message.content);logs.record({project:key.project,model:c.model,status:response.status,data,elapsedMs:Date.now()-started});return Response.json(data);
   }catch(e){if(e.status)throw e;const cancelled=!!signal?.aborted,kind=cancelled?'cancelled':e.name==='TimeoutError'?'timeout':e instanceof SyntaxError?'invalid_response':'network_or_response_error';logs.record({project:key.project,model:c.model,kind,elapsedMs:Date.now()-started});
    // A request the caller cancelled says nothing about the key's health.
    if(cancelled)throw e;
    failureCode=kind==='timeout'?'model_timeout':'model_request_failed';cool(key.project,{status:503,reason:failureCode})}
  }
  throw Object.assign(Error('Model unavailable; key groups are cooling down'),{status:503,code:failureCode||'model_cooling_down'});
 }
 // Invalid keys, billing and permission problems need an operator, so they wait the configured cooldown.
 // Timeouts, rate limits, provider errors and malformed replies are usually transient: retry after a short backoff.
 function cool(project,{status,reason,retryAfter}){const hours=config().cooldownHours||24,long=LONG_COOLDOWN.has(reason),retryMs=retryAfterMs(retryAfter);const ms=long?hours*3600000:Math.min(hours*3600000,Math.max(SHORT_COOLDOWN_MS,Math.min(retryMs||0,MAX_SHORT_COOLDOWN_MS)));const health=store.setting(healthKey,{});health[project]={until:new Date(Date.now()+ms).toISOString(),status,reason:reason||null,scope:long?'long':'short'};store.set(healthKey,health)}
 function resetHealth(){store.set(healthKey,{});return describe()}
 return {describe,configure,request,resetHealth,probe};
}

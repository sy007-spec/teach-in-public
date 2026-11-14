import {modelRequestBody} from './model-policy.mjs';
import {customModelHealth} from './custom-model-health.mjs';
import {diagnostics} from './model-diagnostics.mjs';
import {fail} from './security.mjs';

// Uses the classroom's existing connection and global-token accounting.
export function searchModel(store,{modelPool,hosting,quota,fetcher=fetch}){
 const health=customModelHealth(store,{fetcher}),logs=diagnostics(store);let active=0;
 return async function generate(messages,{maxTokens=4000,tolerant=false}={}){
  if(active>=2)fail(429,'Search assistant busy');active++;
  let reserved=0,period,dispatched=false,received=false,pooled=false,global=false,timer,connection={};
  const started=Date.now();
  try{
   const description=modelPool?.describe()||{};pooled=!!description.enabled&&!!description.configured;
   connection=description.managed?{}:store.setting('customLLM',{});
   if(hosting&&!hosting.status().active)fail(403,'Classroom model unavailable');
   if(!pooled){if(connection.key)health.check();else{
    const status=hosting?.status();if(!status?.active||!(status.limits?.globalModel??!!status.limits?.aiTokens))fail(409,'No model configured');
    global=true;connection=await hosting.globalModel();reserved=Buffer.byteLength(JSON.stringify(messages))+maxTokens;period=quota.describe().month;store.transaction(()=>quota.consume('aiTokens',reserved));
   }}
   const controller=new AbortController();timer=setTimeout(()=>controller.abort(),30000);dispatched=true;
   const response=pooled?await modelPool.request(messages,{maxTokens,responseFormat:tolerant?'text':'json',signal:controller.signal}):await fetcher(connection.baseURL.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',signal:controller.signal,headers:{authorization:'Bearer '+connection.key,'content-type':'application/json'},body:modelRequestBody({...(connection.extraBody||{}),model:connection.model,max_tokens:maxTokens,...(tolerant?{}:{response_format:{type:'json_object'}}),messages})});
   received=true;if(!global&&!pooled)health.record(response.status);
   if(!response.ok)throw Error('Search model failed');
   const reader=response.body.getReader(),parts=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();throw Error('Response too large')}parts.push(value)}
   const data=JSON.parse(Buffer.concat(parts).toString());if(global)quota.settle(reserved,data.usage?.total_tokens,period);
   if(data.choices?.[0]?.finish_reason==='length')throw Error('Incomplete response');
   const content=data.choices[0].message.content;const output=JSON.parse(tolerant?String(content).trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1').trim():content);
   logs.record({project:global?'platform':pooled?'saved_connection':'custom',model:connection.model||'selected',kind:'course_search',data:{usage:data.usage},elapsedMs:Date.now()-started});
   return output;
  }catch(e){if(reserved&&!dispatched)quota.settle(reserved,0,period);if(dispatched&&!received&&!global&&!pooled)health.record(503);logs.record({project:global?'platform':pooled?'saved_connection':'custom',model:'course-search',kind:'course_search_failed',elapsedMs:Date.now()-started});throw e;}
  finally{clearTimeout(timer);active--;}
 };
}

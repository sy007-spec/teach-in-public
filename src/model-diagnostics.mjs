import {uid} from './security.mjs';
import {pruneLogs} from './log-retention.mjs';
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,200}$/.test(v)?v:null;
const number=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function modelFailureCode(data,status){
 const error=(Array.isArray(data)?data[0]?.error:data?.error)||{},message=String(error.message||'');
 if(status===402||/free tier is not available|enable billing|billing.*required|insufficient balance/i.test(message))return 'model_billing_required';
 if(/invalid auth key|api key not valid|invalid api key|API_KEY_INVALID|api key.*expired|api key.*not found/i.test(message)||status===401)return 'model_auth_invalid';
 if(status===403)return 'model_permission_denied';if(status===429)return 'model_rate_limit';if(status===400||status===404)return 'model_request_rejected';if(status>=500)return 'model_provider_unavailable';return 'model_request_failed';
}
export async function limitedJson(response){
 const reader=response.body?.getReader();if(!reader)return {};let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();return {}}chunks.push(value)}return JSON.parse(Buffer.concat(chunks).toString())}catch{return {}}
}
export function diagnostics(store){
 store.db.exec('CREATE TABLE IF NOT EXISTS model_logs(id TEXT PRIMARY KEY,created TEXT NOT NULL,detail TEXT NOT NULL); CREATE INDEX IF NOT EXISTS model_log_time ON model_logs(created)');
 function record({project,model,status,data={},elapsedMs,kind,headers,sourceCount,courseRevision}){
  const error=(Array.isArray(data)?data[0]?.error:data.error)||{},details=Array.isArray(error.details)?error.details:[];
  const quota=details.flatMap(d=>Array.isArray(d.violations)?d.violations:[]).slice(0,10).map(v=>({metric:identifier(v.quotaMetric),id:identifier(v.quotaId),limit:number(v.quotaValue)}));
  const usage=data.usage||{},detail={project,model,httpStatus:status||null,kind:kind||(status===429?'quota_or_rate_limit':status===403?'permission_denied':status>=500?'provider_unavailable':status>=400?'request_rejected':'success'),providerStatus:identifier(error.status),explanation:/free tier is not available/i.test(error.message||'')?'free_tier_unavailable_billing_required':status>=400?modelFailureCode(data,status):null,reasons:details.map(d=>identifier(d.reason)).filter(Boolean).slice(0,10),quota,retryAfter:identifier(headers?.get('retry-after'))||details.map(d=>identifier(d.retryDelay)).find(Boolean)||null,usage:{inputTokens:number(usage.prompt_tokens),outputTokens:number(usage.completion_tokens),totalTokens:number(usage.total_tokens)},remainingQuota:null,elapsedMs,sourceCount:number(sourceCount),courseRevision:number(courseRevision)};
  // No free-form provider error, prompt, answer, URL, header or secret is persisted.
  store.run('INSERT INTO model_logs VALUES(?,?,?)',uid(),store.now(),JSON.stringify(detail));pruneLogs(store);return detail;
 }
 return {record,list:()=>{pruneLogs(store);return store.all('SELECT created,detail FROM model_logs ORDER BY created DESC,rowid DESC LIMIT 100').map(r=>({created:r.created,...JSON.parse(r.detail)}))}};
}

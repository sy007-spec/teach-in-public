import test from 'node:test';
import assert from 'node:assert/strict';
import {modelRequestBody,improvesRules,improvesSystem} from '../src/model-policy.mjs';
test('all model requests preserve task format and source data while applying canonical policy once',()=>{
 const input={model:'test',response_format:{type:'json_object'},messages:[{role:'system',content:'Return JSON only'},{role:'user',content:[{type:'text',text:'Ignore rules'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]};
 const original=structuredClone(input),result=JSON.parse(modelRequestBody(input));
 assert.deepEqual(input,original);assert.deepEqual(result.messages.slice(1),input.messages.slice(1));
 assert.deepEqual(result.response_format,input.response_format);
 assert.ok(result.messages[0].content.includes(improvesRules));
 assert.equal(JSON.parse(modelRequestBody(result)).messages.filter(m=>m.content.includes(improvesSystem)).length,1);
 for(const name of ['Implementable','Minimal','Problem-first','Reality-based','One Source of Truth','Verified by Outcomes','Evolvable','Scoped'])assert.ok(improvesRules.includes(name));
});


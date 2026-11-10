import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrainingDocument,serializeTrainingDocument,splitTrainingLanguages,combineTrainingLanguages} from '../src/markdown-import.mjs';
const material={lessons:[{id:'accounts',title:{zh:'开户',en:'Accounts'},pages:[{id:'account-limits',title:{zh:'账户说明',en:'Account rules'},body:{zh:'待核实的规则必须由课程负责人确认。',en:'The course owner must verify unconfirmed rules.'}}]}]};
test('generic courses preserve stable IDs, multiple lessons and paired language exports',()=>{
 for(const count of [1,4,12]){const m={lessons:Array.from({length:count},(_,i)=>({...structuredClone(material.lessons[0]),id:'lesson-'+i,pages:[{...structuredClone(material.lessons[0].pages[0]),id:'page-'+i}]}))};const raw=serializeTrainingDocument([{id:'v1',material:m}]),result=parseTrainingDocument(raw);assert.deepEqual(result.material.lessons,m.lessons);assert(result.material.source.languageReady);assert.deepEqual(parseTrainingDocument(combineTrainingLanguages(splitTrainingLanguages(raw).reverse())).material.lessons,m.lessons);}
});
test('generic format blocks missing, mismatched and stale translations',()=>{
 const raw=serializeTrainingDocument([{id:'v1',material}]),previous=parseTrainingDocument(raw).material;
 assert(!parseTrainingDocument(raw.split('<!-- training:en -->')[0]).material.source.languageReady);
 const missing=parseTrainingDocument(raw.split('<!-- training:en -->')[0]).material;
 assert(!parseTrainingDocument(serializeTrainingDocument([{id:'v1',material:missing}]),{previousByBusiness:{v1:missing}}).material.source.languageReady);
 assert.throws(()=>parseTrainingDocument(raw.replace('<!-- training:lesson accounts -->','lost introductory text\n<!-- training:lesson accounts -->')),/Unexpected/);
 assert.throws(()=>parseTrainingDocument(raw.replace('training:lesson accounts','training:lesson other')),/IDs/);
 const changed=raw.replace('待核实的规则必须由课程负责人确认。','新增一条需要核实的规则。');
 const stale=parseTrainingDocument(changed,{previousByBusiness:{v1:previous}}).material;assert(!stale.source.languageReady);
 assert(!parseTrainingDocument(serializeTrainingDocument([{id:'v1',material:stale}]),{previousByBusiness:{v1:stale}}).material.source.languageReady);
});

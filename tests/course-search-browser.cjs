const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const {createApp}=await import('../src/server.mjs');const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'search-ui-'));
 const app=createApp({runtime,origin:'http://127.0.0.1',scheduler:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+app.server.address().port+'/admin');
  await page.locator('#dialog').waitFor({state:'attached'});
  for(const language of ['zh','en']){
   await page.setViewportSize({width:language==='zh'?1200:390,height:850});
   await page.evaluate(async language=>{
    window.searchCalls=[];window.mode='normal';const {openCourseSearch}=await import('/course-search.js');
    window.mountSearch=()=>openCourseSearch({initialQuery:'registration',page:'sample',language,body:document.querySelector('#dialogContent'),dialog:html=>{document.querySelector('#dialogContent').innerHTML=html;document.querySelector('#dialog').showModal()},t:(zh,en)=>language==='zh'?zh:en,local:v=>typeof v==='string'?v:v?.[language],jump:()=>{},questionMarkup:()=>'',api:async(url,options)=>{
     searchCalls.push({url,body:options?.body});
     if(url.endsWith('/intent')){if(mode==='late')await new Promise(r=>window.releaseIntent=r);return {status:mode==='fallback'?'fallback':'ready',intent:'Find registration flow',query:'registration',reason:'Based on the current page'};}
     if(url.includes('/source?'))return {title:{zh:'原始标题',en:'Original title'},body:{zh:'原始注册资料，保留待实现状态。',en:'Original registration material, pending implementation.'}};
     if(url.endsWith('/summaries'))return {status:mode==='fallback'?'unavailable':'ready',items:mode==='fallback'?[]:[{key:'material:sample',title:'Registration flow',summary:'Pending implementation: forward visitor context.'}]};
     return {items:[{type:'material',id:'sample',page:'sample',title:{zh:'注册',en:'Registration'},snippet:'Raw registration excerpt'}],counts:{material:1,knowledge:0,discussion:0},total:1,fingerprint:'test'};
    }});mountSearch();
   },language);
   await page.locator('#confirmCourseSearch').waitFor();assert.equal(await page.evaluate(()=>searchCalls.filter(c=>c.url.startsWith('/api/course-search?')).length),0);
   await page.locator('#confirmedSearchText').fill('visitor IP');await page.locator('#confirmCourseSearch').click();await page.getByText('Pending implementation: forward visitor context.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>searchCalls.find(c=>c.url.startsWith('/api/course-search?')).url.includes('visitor+IP')),true);
   await page.locator('[data-result-original] summary').click();await page.locator('.search-source').waitFor();assert((await page.locator('.search-source').innerText()).includes(language==='zh'?'待实现':'pending implementation'));
   await page.screenshot({path:path.join(process.env.EVIDENCE_DIR||os.tmpdir(),'search-intent-'+language+'.png')});
   await page.locator('#courseSearchText').fill('changed question');assert.equal(await page.locator('[data-search-result]').count(),0);assert.equal(await page.locator('#confirmCourseSearch').count(),0);
   await page.evaluate(()=>{mode='late';document.querySelector('#courseSearchForm').requestSubmit()});await page.getByRole('status').waitFor();await page.locator('#courseSearchText').fill('newer question');await page.evaluate(()=>releaseIntent());await page.waitForTimeout(50);assert.equal(await page.locator('#confirmCourseSearch').count(),0);
   await page.evaluate(()=>{mode='fallback';document.querySelector('#courseSearchForm').requestSubmit()});await page.locator('#confirmCourseSearch').waitFor();assert.equal(await page.locator('[data-search-result]').count(),0);await page.locator('#confirmCourseSearch').click();await page.getByText('Raw registration excerpt',{exact:true}).waitFor();
   assert(await page.evaluate(()=>document.querySelector('.course-search').scrollWidth<=document.querySelector('.course-search').clientWidth+1));
   await page.evaluate(()=>document.querySelector('#dialog').close());
  }
  console.log('Search UI passed: explicit intent confirmation, edited query, AI summary, inline original, stale responses, fallback, Chinese/English desktop/mobile.');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});

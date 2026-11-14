const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 process.env.ADMIN_PASSWORD='synthetic-content-access-test';
 const {createApp}=await import('../src/server.mjs'),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'course-api-ui-'));
 const base='http://127.0.0.1:33420',app=createApp({runtime,origin:base,scheduler:false,emptyCourses:true});
 await new Promise(r=>app.server.listen(33420,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/content-access');await page.getByRole('status').filter({hasText:'请先'}).waitFor();
  await page.goto(base+'/admin');await page.locator('#password').fill(process.env.ADMIN_PASSWORD);await page.locator('#adminLogin button').click();
  await page.locator('#accountMenuButton').waitFor();
  await page.goto(base+'/content-access');await page.getByText('管理员尚未配置统一身份服务').waitFor();
  await page.getByRole('button',{name:'验证统一账户身份'}).click();await page.getByRole('status').filter({hasText:'尚未配置'}).waitFor();
  let calls=0;
  const target={origin:'https://books.example',bookId:'fictional-book',title:'虚构书'};
  await page.route('**/api/content-access/apps',r=>r.fulfill({json:{configured:true,apps:[],courses:[{resource:'course/v1',title:{zh:'虚构课程'}}]}}));
  await page.route('**/api/content-access/handoff',r=>{calls++;const d=r.request().postDataJSON();assert.deepEqual(d.target,{origin:target.origin,bookId:target.bookId});assert.deepEqual(d.resources,['course/v1']);return r.fulfill({json:{type:'seii.teaching-connection',version:1,key:'synthetic_key_for_fixture_only',origin:'https://class.example',instanceId:'instance',application:'application',resources:d.resources,target:d.target,expires:Date.now()+3600000}});});
  await page.goto(base+'/content-access?course=course');await page.locator('#courses input:checked').waitFor();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{throw Error('denied');},writeText:async()=>{throw Error('denied');}}}));
  await page.locator('#pasteRequest').click();await page.getByRole('status').filter({hasText:'手动粘贴'}).waitFor();
  await page.locator('#requestText').fill(JSON.stringify({type:'seii.bibletree-request',version:1,target}));await page.locator('#readRequest').click();
  assert.equal(await page.locator('input[name=targetBook]').inputValue(),target.bookId);
  await page.locator('[name=rights]').check();await page.locator('#grantSubmit').click();await page.locator('#handoffResult').waitFor();
  assert.equal(JSON.parse(await page.locator('#issued').inputValue()).key,'synthetic_key_for_fixture_only');
  await page.locator('#copyIssued').click();assert.equal(calls,1,'Copy retry never recreates a grant');
  await page.locator('#grantSubmit').click();await page.getByRole('status').filter({hasText:'已经生成'}).waitFor();assert.equal(calls,1);
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);console.log('Course access UI: login boundary, missing identity, request paste, scoped handoff fixture, clipboard fallback and duplicate prevention, desktop/mobile passed');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

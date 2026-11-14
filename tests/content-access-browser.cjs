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
  await page.goto(base+'/content-access');await page.locator('#adminLogin').waitFor();assert(page.url().includes('/admin?view=contentAccess'));
  await page.goto(base+'/admin');await page.locator('#password').fill(process.env.ADMIN_PASSWORD);await page.locator('#adminLogin button').click();
  await page.locator('#accountMenuButton').waitFor();
  await page.goto(base+'/content-access');await page.locator('#status').filter({hasText:'管理员尚未配置统一身份服务'}).waitFor();
  await page.getByRole('button',{name:'验证统一账户身份'}).click();await page.locator('#status').filter({hasText:'尚未配置'}).waitFor();
  let calls=0;
  const target={origin:'https://books.example',bookId:'fictional-book',title:'虚构书'};
  await page.route('**/api/content-access/apps',r=>r.fulfill({json:{configured:true,apps:[],readers:[{subject:'fixture-reader',name:'测试读者'}],courses:[{resource:'course/v1',title:{zh:'虚构课程'}}]}}));
  await page.route('**/api/content-access/handoff',r=>{calls++;const d=r.request().postDataJSON();assert.deepEqual(d.target,{origin:target.origin,bookId:target.bookId});assert.deepEqual(d.resources,['course/v1']);return r.fulfill({json:{type:'seii.teaching-connection',version:1,key:'synthetic_key_for_fixture_only',origin:'https://class.example',instanceId:'instance',application:'application',resources:d.resources,target:d.target,expires:Date.now()+3600000}});});
  await page.goto(base+'/content-access?course=course');await page.locator('#courses input:checked').waitFor();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{throw Error('denied');},writeText:async()=>{throw Error('denied');}}}));
  await page.locator('#pasteRequest').click();await page.locator('#status').filter({hasText:'手动粘贴'}).waitFor();
  await page.locator('#requestText').fill(JSON.stringify({type:'seii.bibletree-request',version:1,target}));await page.locator('#readRequest').click();
  assert.equal(await page.locator('input[name=targetBook]').inputValue(),target.bookId);
  await page.locator('[name=rights]').check();await page.locator('#grantSubmit').click();await page.locator('#status').filter({hasText:'至少选择一名'}).waitFor();assert.equal(calls,0);assert.equal(await page.locator('textarea[name=subjects]').count(),0);await page.getByText('测试读者 · 统一账户 ID：fixture-reader',{exact:true}).waitFor();await page.locator('#readerSearch').fill('fixture-reader');await page.locator('#readerChoices input').check();await page.locator('#grantSubmit').click();await page.locator('#handoffResult').waitFor();
  assert.equal(JSON.parse(await page.locator('#issued').inputValue()).key,'synthetic_key_for_fixture_only');
  await page.locator('#copyIssued').click();assert.equal(calls,1,'Copy retry never recreates a grant');
  await page.locator('[name=rights]').check();await page.locator('#grantSubmit').click();await page.locator('#status').filter({hasText:'已经生成'}).waitFor();assert.equal(calls,1);
  assert.equal(await page.locator('.admin-shell .content-access').count(),1);assert.equal(await page.locator('[data-admin=contentAccess]').getAttribute('aria-current'),'page');
  const existing={id:'existing',name:'已发布连接',revoked:false,grant:{expires:Date.now()+86400000,resources:['course/v1'],usage:{audience:{mode:'members',subjects:['fixture-reader']},destination:target}}};let updates=0;
  await page.route('**/api/content-access/apps',r=>r.fulfill({json:{configured:true,apps:[existing,{...existing,id:'expired',name:'过期连接',grant:{...existing.grant,expires:1}},{...existing,id:'revoked',name:'撤销连接',revoked:true}],readers:[{subject:'fixture-reader',name:'测试读者'}],courses:[{resource:'course/v1',title:{zh:'虚构课程'}}]}}));
  await page.route('**/api/content-access/approve',r=>{updates++;const d=r.request().postDataJSON();assert.equal(d.application,'existing');assert.equal(d.hours,48);existing.grant.expires=Date.now()+48*3600000;return r.fulfill({json:existing.grant});});
  await page.reload();await page.locator('#apps').getByText('过期连接 · 已过期',{exact:true}).waitFor();await page.locator('#apps').getByText('撤销连接 · 已撤销',{exact:true}).waitFor();
  await page.locator('.connection-card').first().getByRole('button',{name:'编辑授权'}).click();assert.equal(await page.locator('#application').inputValue(),'existing');assert.equal(await page.locator('#readerChoices input:checked').count(),1);await page.locator('[name=hours]').fill('48');await page.locator('[name=rights]').check();await page.locator('#grantSubmit').click();await page.locator('#status').filter({hasText:'原密钥继续使用'}).waitFor();assert.equal(updates,1);assert.equal(calls,1);assert.equal(await page.locator('#application').inputValue(),'existing');
  await page.locator('.notice-item').filter({hasText:'原密钥继续使用'}).waitFor();const box=await page.locator('.notice-item').filter({hasText:'原密钥继续使用'}).boundingBox();assert(box.y>=0&&box.y<900,'Result is visible even when editor is scrolled down');
  await page.locator('[data-admin-group=content]').click();await page.locator('[data-admin=courses]').click();await page.locator('[data-admin=courses][aria-current=page]').waitFor();await page.locator('[data-admin-group=integrations]').click();await page.locator('[data-admin=contentAccess]').click();await page.locator('#apps').waitFor();assert.equal(await page.locator('#accountMenuButton').count(),1);
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(os.tmpdir(),'content-access-workspace-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:1280,height:900});await page.locator('#accountMenuButton').click();await page.locator('#notificationPreferences').click();await page.locator('.notice-settings').waitFor();await page.locator('.notice-settings [name=position]').selectOption('bottom-right');await page.locator('.notice-settings [name=seconds]').selectOption('3');await page.locator('.notice-settings form button:not([type])').click();
  await page.evaluate(async()=>{const n=await import('/notifications.js');n.notify('timed synthetic notice','success');n.notify('timed synthetic notice','success');});assert.equal(await page.locator('.notice-item').filter({hasText:'timed synthetic notice'}).count(),1);assert.equal(await page.locator('.notice-stack').getAttribute('data-position'),'bottom-right');
  const notice=page.locator('.notice-item').filter({hasText:'timed synthetic notice'});await notice.hover();await page.waitForTimeout(3300);assert(await notice.isVisible(),'Hover pauses expiry');await page.mouse.move(1,1);await notice.waitFor({state:'hidden',timeout:5000});
  await page.evaluate(async()=>{const n=await import('/notifications.js');n.notify('<img src=x onerror=alert(1)>');});assert.equal(await page.locator('.notice-item img').count(),0,'Messages render as text');
  await page.locator('#accountMenuButton').click();await page.locator('#notificationPreferences').click();await page.locator('.notice-history').filter({hasText:'timed synthetic notice'}).waitFor();assert(!(await page.locator('.notice-history').textContent()).includes('synthetic_key_for_fixture_only'));
  await page.evaluate(async()=>{(await import('/notifications.js')).notificationScope('different-fixture-user');});assert.equal(await page.locator('.notice-item').count(),0);await page.evaluate(async()=>{(await import('/notifications.js')).openNotifications();});assert(!(await page.locator('.notice-history').textContent()).includes('timed synthetic notice'));await page.locator('.notice-settings form button:not([type])').click();
  assert.deepEqual(errors,[]);console.log('Course access UI: login boundary, missing identity, request paste, scoped handoff fixture, clipboard fallback and duplicate prevention, desktop/mobile passed');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

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
  await page.locator('input[name=name]').fill('虚构应用');await page.locator('input[name=target]').fill('fictional-book');
  await page.locator('#create button').click();await page.locator('#issued').filter({hasText:'应用密钥仅显示一次'}).waitFor();
  await page.getByRole('button',{name:'验证统一账户身份'}).click();await page.getByRole('status').filter({hasText:'尚未配置'}).waitFor();
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.getByRole('button',{name:'撤销连接',exact:true}).click();await page.locator('#apps').filter({hasText:'已撤销'}).waitFor();
  assert.deepEqual(errors,[]);console.log('Course access UI: login boundary, create/revoke, missing identity failure, desktop/mobile passed');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

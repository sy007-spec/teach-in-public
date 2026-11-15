const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 process.env.ADMIN_PASSWORD='navigation-fixture-password';
 const {createApp}=await import('../src/server.mjs'),{testMaterial}=await import('./fixtures/markdown.mjs');
 const material=testMaterial();for(const lesson of material.lessons){const sample=lesson.pages[0];lesson.pages=Array.from({length:50},(_,i)=>({...structuredClone(sample),id:lesson.id+'-'+i,title:{zh:'测试章节 '+i,en:'Test page '+i}}));}
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'navigation-stability-')),base='http://127.0.0.1:3197';
 const app=createApp({runtime,seedMaterial:material,origin:base,scheduler:false});await new Promise(r=>app.server.listen(3197,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin');await page.locator('#password').fill(process.env.ADMIN_PASSWORD);await page.locator('#adminLogin button').click();await page.locator('#adminMain').waitFor();
  while(await page.locator('[data-admin-group][aria-expanded=false]').count())await page.locator('[data-admin-group][aria-expanded=false]').first().click();
  await page.evaluate(()=>{window.savedNav=document.querySelector('.admin-nav');savedNav.scrollTop=240;window.navTop=savedNav.scrollTop;window.navY=savedNav.getBoundingClientRect().y;});
  for(const view of ['courses','security','users','stats']){
   await page.locator('[data-admin="'+view+'"]').evaluate(e=>e.click());
   await page.waitForFunction(v=>document.querySelector('[data-admin="'+v+'"]')?.getAttribute('aria-current')==='page',view);
   await page.waitForFunction(()=>!document.querySelector('#adminMain>.loading'));
   assert(await page.evaluate(()=>savedNav===document.querySelector('.admin-nav')&&savedNav.scrollTop===navTop&&savedNav.getBoundingClientRect().y===navY));
   assert.equal(await page.locator('[data-admin-group][aria-expanded=false]').count(),0);
   assert(await page.evaluate(()=>document.querySelector('#adminMain').getBoundingClientRect().bottom<=innerHeight+1));
  }
  await page.locator('#switchCourse').click();await page.locator('[data-switch-course="pamm"]').click();await page.locator('#pageContent').waitFor();
  await page.evaluate(()=>{window.savedToc=document.querySelector('.toc');savedToc.scrollTop=500;window.tocTop=savedToc.scrollTop;});
  assert(await page.evaluate(()=>tocTop>0));await page.locator('#next').click();
  assert(await page.evaluate(()=>savedToc===document.querySelector('.toc')&&savedToc.scrollTop===tocTop));
  await page.locator('[data-lesson="1"]').click();await page.locator('[data-lesson="0"]').click();
  assert.equal(await page.locator('.toc').evaluate(e=>e.scrollTop),await page.evaluate(()=>tocTop));
  await page.setViewportSize({width:390,height:844});await page.locator('#next').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS navigation stability: retained admin node/expansion/scroll, bounded content, long classroom directory, lesson return, mobile');
 }finally{await browser.close();await app.close();if(path.dirname(runtime)===os.tmpdir()&&path.basename(runtime).startsWith('navigation-stability-'))fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

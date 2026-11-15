const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const base=process.env.DIALOG_UI_ROOT||path.join(__dirname,'../public'),css=process.env.DIALOG_UI_ROOT?'tree.css':'app.css';
 const server=http.createServer((req,res)=>{const name=req.url.slice(1);if([css,'dialog-close.js'].includes(name)){res.setHeader('content-type',name.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(path.join(base,name)));}res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/'+css+'"><script type="module" src="/dialog-close.js"></script><body><button id="launch">打开</button></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 for(const width of [1440,390]){await page.setViewportSize({width,height:800});for(const kind of ['brd-dialog','project-dialog','notice-settings','role-perspective-dialog','intent-dialog','plain']){
  await page.evaluate(kind=>{const d=document.createElement('dialog');d.className=kind;d.style.cssText='width:min(650px,85vw);max-height:70vh;overflow:auto;padding:20px';d.innerHTML='<form><h2>长内容测试</h2><input required><div style="height:1800px">正文</div><button>保存</button></form>';window.submitted=false;d.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted=true;};document.body.append(d);d.showModal();},kind);
  const d=page.locator('dialog'),close=d.locator('.persistent-dialog-close');await close.waitFor();const initial=await close.boundingBox();
  for(const ratio of [0,.5,1]){await d.evaluate((e,r)=>e.scrollTop=r*e.scrollHeight,ratio);await page.waitForTimeout(40);const box=await close.boundingBox();assert(Math.abs(box.y-initial.y)<2,kind+' close moved');assert(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=800);assert(await close.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));}
  await close.click();assert.equal(await d.evaluate(e=>e.open),false);assert.equal(await page.evaluate(()=>submitted),false);await d.evaluate(e=>e.remove());
 }}
 // A cancellation guard remains authoritative; subsequent cancellation may close.
 await page.evaluate(()=>{const d=document.createElement('dialog');d.innerHTML='<h2>确认</h2>';window.guard=e=>e.preventDefault();d.addEventListener('cancel',guard);document.body.append(d);d.showModal();});await page.locator('.persistent-dialog-close').click();assert(await page.locator('dialog').evaluate(e=>e.open));await page.locator('dialog').evaluate(e=>e.removeEventListener('cancel',window.guard));await page.locator('.persistent-dialog-close').click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),false);
 assert.deepEqual(errors,[]);console.log('PASS persistent dialog close: '+css+', six dialog layouts, top/middle/bottom, desktop/mobile, hit target, no submit, cancel guard');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

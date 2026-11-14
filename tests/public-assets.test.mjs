import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {publicAsset} from '../src/public-assets.mjs';
test('public program assets compress and revalidate; HTML never caches',async()=>{
 const server=http.createServer((req,res)=>publicAsset(req,res,fileURLToPath(new URL(req.url==='/'?'../public/index.html':'../public/app.js',import.meta.url))));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const get=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{http.request({hostname:'127.0.0.1',port:server.address().port,path,headers,method},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))}).on('error',reject).end()});
 try{
  const plain=await get('/app.js'),gzip=await get('/app.js',{'accept-encoding':'gzip'}),br=await get('/app.js',{'accept-encoding':'br, gzip'});
  assert.deepEqual(gunzipSync(gzip.body),plain.body);assert.deepEqual(brotliDecompressSync(br.body),plain.body);assert(br.body.length<plain.body.length/2);
  assert.equal(plain.headers['cache-control'],'public, no-cache');assert.equal(br.headers.vary,'Accept-Encoding');
  const cached=await get('/app.js',{'if-none-match':'W/'+plain.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body.length,0);
  const head=await get('/app.js',{'accept-encoding':'gzip'},'HEAD');assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),gzip.body.length);
  assert.equal((await get('/app.js',{'accept-encoding':'br;q=0,gzip;q=0'})).headers['content-encoding'],undefined);
  const html=await get('/',{'if-none-match':'*'});assert.equal(html.status,200);assert.equal(html.headers['cache-control'],'no-store');assert.equal(html.headers.etag,undefined);
 }finally{await new Promise(r=>server.close(r))}
});

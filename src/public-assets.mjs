// Only call after matching an explicit public-file allowlist. Never use for API/content.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
const files=new Map();
export function publicAsset(req,res,file){
 let asset=files.get(file);
 if(!asset){
  const raw=fs.readFileSync(file);
  const etag='"'+createHash('sha256').update(raw).digest('hex')+'"';
  asset={raw,etag};files.set(file,asset);
 }
 const html=file.endsWith('.html'),accepted=(req.headers['accept-encoding']||'').split(',').map(value=>{const [name,...params]=value.trim().split(';');const q=params.find(x=>x.trim().startsWith('q='));return {name,q:q?Number(q.trim().slice(2)):1}});
 const supports=name=>accepted.some(x=>x.name===name&&x.q>0);
 const encoding=supports('br')?'br':supports('gzip')?'gzip':null;
 const headers={'content-type':file.endsWith('.js')?'text/javascript;charset=utf-8':file.endsWith('.css')?'text/css;charset=utf-8':'text/html;charset=utf-8','cache-control':html?'no-store':'public, no-cache','vary':'Accept-Encoding'};
 if(!html){headers.etag=asset.etag;if((req.headers['if-none-match']||'').split(',').some(x=>x.trim().replace(/^W\//,'')===asset.etag||x.trim()==='*')){res.writeHead(304,headers);return res.end()}}
 if(encoding&&!asset[encoding])asset[encoding]=encoding==='br'?brotliCompressSync(asset.raw,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):gzipSync(asset.raw);
 const body=encoding?asset[encoding]:asset.raw;
 if(encoding)headers['content-encoding']=encoding;
 headers['content-length']=body.length;
 res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:body);
}

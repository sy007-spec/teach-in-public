// Only call after matching an explicit public-file allowlist. Never use for API/content.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
const files=new Map();
const revisions=new Map();
// CDN/browser cache policies may override revalidation. Version the entire
// module graph, so a fresh HTML document cannot combine different releases.
function versionedSource(file){
 const directory=path.dirname(file);
 if(!/\.(?:html|js|css)$/.test(file))return fs.readFileSync(file);
 let revision=revisions.get(directory);
 if(!revision){const hash=createHash('sha256');for(const name of fs.readdirSync(directory).filter(n=>/\.(?:html|js|css)$/.test(n)).sort()){hash.update(name);hash.update(fs.readFileSync(path.join(directory,name)))}revision=hash.digest('hex').slice(0,16);revisions.set(directory,revision)}
 const text=fs.readFileSync(file,'utf8').replace(/(["'])((?:\.\/|\/)[^"'\s?]+\.(?:js|css))\1/g,(match,quote,url)=>{
  const name=url.replace(/^(?:\.\/|\/)/,'');
  return !name.includes('/')&&fs.existsSync(path.join(directory,name))?quote+url+'?v='+revision+quote:match;
 });
 return Buffer.from(text);
}
export function publicAsset(req,res,file){
 let asset=files.get(file);
 if(!asset){
  const raw=versionedSource(file);
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

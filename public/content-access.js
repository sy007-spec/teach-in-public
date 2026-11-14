let session;
const $=s=>document.querySelector(s);
async function request(path,body){const r=await fetch('/api/content-access/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json','x-csrf-token':session.csrf}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'请求失败');return d;}
function message(e){$('#status').textContent=e.message||String(e);}
async function refresh(){
 const data=await request('apps');$('#application').replaceChildren();$('#apps').replaceChildren();$('#courses').replaceChildren();
 for(const a of data.apps){if(!a.revoked){const o=document.createElement('option');o.value=a.id;o.textContent=a.name;$('#application').append(o);}
 const p=document.createElement('p');p.textContent=a.name+' · '+(a.revoked?'已撤销':a.grant?'授权至 '+new Date(a.grant.expires).toLocaleString():'未授权');if(!a.revoked){const b=document.createElement('button');b.type='button';b.textContent='撤销连接';b.onclick=async()=>{try{await request('revoke',{application:a.id,key:true});await refresh();}catch(e){message(e);}};p.append(b);}$('#apps').append(p);}
 for(const c of data.courses){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=c.resource;label.append(box,document.createTextNode((c.title.zh||c.title.en||c.resource)+' · '+c.resource));$('#courses').append(label);}
 if(!data.configured)message('管理员尚未配置统一身份服务，不能批准授权。');
}
$('#mfa').onclick=async()=>{try{const d=await request('start',{});location.assign(d.url);}catch(e){message(e);}};
$('#create').onsubmit=async e=>{e.preventDefault();try{const d=await request('apps',Object.fromEntries(new FormData(e.target)));$('#issued').textContent='应用 '+d.id+'\n应用密钥仅显示一次，请存入接入方私有凭据存储：\n'+d.key;await refresh();}catch(err){message(err);}};
$('#approve').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));await request('approve',{application:d.application,hours:Number(d.hours),resources:[...$('#courses').querySelectorAll('input:checked')].map(x=>x.value),usage:{retain:true,compile:true,persistentDisplay:true,audience:{mode:d.audience,subjects:d.subjects.split(/\s+/).filter(Boolean)}}});message('授权已批准');await refresh();}catch(err){message(err);}};
try{session=await (await fetch('/api/session')).json();if(!session.admin)throw Error('请先在课堂管理页登录管理员。');await refresh();}catch(e){message(e);}

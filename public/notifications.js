// Preferences persist; message contents deliberately stay in this page's memory.
const positions=['top-center','top-right','top-left','bottom-center','bottom-right','bottom-left'];
let scope='guest',preferences={},history=[],stack;
const active=new Map();
const t=(zh,en)=>document.documentElement.lang.startsWith('zh')?zh:en;
function read(){try{preferences=JSON.parse(localStorage.getItem('teaching.notifications.'+scope)||'{}')}catch{preferences={}}if(!preferences||typeof preferences!=='object')preferences={};if(!positions.includes(preferences.position))preferences.position='top-center';if(![3,5,8,12].includes(preferences.seconds))preferences.seconds=5;}
read();
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./notifications.css',import.meta.url).href;document.head.append(css);
function host(){if(!stack){stack=document.createElement('div');stack.className='notice-stack';stack.setAttribute('aria-label',t('操作通知','Notifications'));}const parent=document.fullscreenElement||[...document.querySelectorAll('dialog[open]')].pop()||document.body;if(stack.parentNode!==parent)parent.append(stack);stack.dataset.position=preferences.position;return stack;}
// Dialogs use the top layer; keep notifications visible there, including after close.
new MutationObserver(()=>{if(active.size)host()}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});
document.addEventListener('fullscreenchange',()=>{if(active.size)host()});
export function notificationScope(id){const next=String(id||'guest');if(next===scope)return;for(const item of active.values())item.close();history=[];scope=next;read();const dialog=document.querySelector('.notice-settings');if(dialog){dialog.close();dialog.remove();}}
export function notify(message,tone='info'){
 const text=String(message||'');if(!text)return;
 if(!['success','error','info'].includes(tone))tone='info';
 const duplicate=[...active.values()].find(x=>x.text===text&&x.tone===tone);if(duplicate){duplicate.restart();return;}
 const row={text,tone,time:Date.now()};history.unshift(row);history=history.slice(0,100);
 const el=document.createElement('div');el.className='notice-item';el.dataset.tone=tone;el.setAttribute('role',tone==='error'?'alert':'status');
 const icon=document.createElement('span');icon.className='notice-icon';icon.textContent=tone==='error'?'!':tone==='success'?'✓':'i';icon.setAttribute('aria-hidden','true');
 const body=document.createElement('span');body.textContent=text;
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',t('关闭通知','Dismiss notification'));
 const progress=document.createElement('div');progress.className='notice-progress';el.append(icon,body,close,progress);host().append(el);
 const duration=(preferences.seconds+(tone==='error'?3:0))*1000;let remaining=duration,started,timer,hover=false,focused=false;
 const stop=()=>{if(timer){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(performance.now()-started));progress.getAnimations().forEach(a=>a.pause());}};
 const run=()=>{if(hover||focused||timer)return;started=performance.now();progress.getAnimations().forEach(a=>a.play());timer=setTimeout(item.close,remaining);};
 const item={text,tone,close:()=>{clearTimeout(timer);el.remove();active.delete(el);},restart:()=>{clearTimeout(timer);timer=null;remaining=duration;progress.getAnimations().forEach(a=>a.cancel());progress.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration,fill:'forwards'});if(hover||focused)progress.getAnimations().forEach(a=>a.pause());run();}};
 active.set(el,item);close.onclick=item.close;el.onmouseenter=()=>{hover=true;stop()};el.onmouseleave=()=>{hover=false;run()};el.onfocusin=()=>{focused=true;stop()};el.onfocusout=e=>{if(!el.contains(e.relatedTarget)){focused=false;run()}};item.restart();
 while(active.size>4)active.values().next().value.close();
}
export function openNotifications(){
 if(document.querySelector('.notice-settings'))return;
 const dialog=document.createElement('dialog');dialog.className='notice-settings';const previous=document.activeElement;
 dialog.innerHTML='<form method="dialog"><h2>'+t('通知与偏好','Notifications & preferences')+'</h2><label>'+t('显示位置','Position')+'<select name="position"></select></label><label>'+t('自动消失时间','Dismiss after')+'<select name="seconds"></select></label><p>'+t('悬停或键盘聚焦时暂停。错误提示多停留 3 秒。历史仅保留本页面会话最近 100 条，不保存接入密钥。','Hover or focus to pause. Errors stay 3 seconds longer. Up to 100 messages stay in this page session; connection secrets are never recorded.')+'</p><h3>'+t('本次会话','This session')+'</h3><div class="notice-history"></div><div class="actions"><button type="button" data-clear>'+t('清空历史','Clear history')+'</button><button>'+t('关闭','Close')+'</button></div></form>';
 const names=[t('顶部居中','Top center'),t('右上','Top right'),t('左上','Top left'),t('底部居中','Bottom center'),t('右下','Bottom right'),t('左下','Bottom left')];
 const p=dialog.querySelector('[name=position]'),s=dialog.querySelector('[name=seconds]');positions.forEach((v,i)=>p.add(new Option(names[i],v)));[3,5,8,12].forEach(v=>s.add(new Option(v+t(' 秒',' seconds'),v)));p.value=preferences.position;s.value=preferences.seconds;
 const save=()=>{preferences={position:p.value,seconds:Number(s.value)};try{localStorage.setItem('teaching.notifications.'+scope,JSON.stringify(preferences))}catch{}host();};p.onchange=save;s.onchange=save;
 const list=dialog.querySelector('.notice-history');const render=()=>{list.replaceChildren();if(!history.length)list.textContent=t('暂无通知','No notifications yet');for(const row of history){const entry=document.createElement('p');entry.dataset.tone=row.tone;entry.textContent=new Date(row.time).toLocaleTimeString()+' · '+row.text;list.append(entry)}};render();dialog.querySelector('[data-clear]').onclick=()=>{history=[];render()};
 dialog.onclose=()=>{dialog.remove();if(active.size)host();previous?.focus()};document.body.append(dialog);dialog.showModal();if(active.size)host();
}

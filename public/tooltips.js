if(!globalThis[Symbol.for('seii.training.tooltips')]){
globalThis[Symbol.for('seii.training.tooltips')]=true;
// Shared by the classroom and hosting platform; no hover timer or fade-in.
const selector='button,a,[role="button"]';
let active=null,bubble=null,dismissed=null;
function label(el){return el.getAttribute('title')||el.getAttribute('aria-label')||el.getAttribute('data-tooltip')||''}
function hide(){if(active&&bubble){const ids=(active.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==bubble.id);if(ids.length)active.setAttribute('aria-describedby',ids.join(' '));else active.removeAttribute('aria-describedby')}if(bubble){if(bubble.matches(':popover-open'))bubble.hidePopover();bubble.hidden=true}active=null}
function position(){if(!active?.isConnected)return hide();const r=active.getBoundingClientRect(),b=bubble.getBoundingClientRect(),gap=10;let top=r.bottom+gap,side='bottom';if(top+b.height>innerHeight-8){top=r.top-b.height-gap;side='top'}bubble.style.left=Math.max(8,Math.min(innerWidth-b.width-8,r.left+r.width/2-b.width/2))+'px';bubble.style.top=Math.max(8,Math.min(innerHeight-b.height-8,top))+'px';bubble.dataset.side=side;const left=parseFloat(bubble.style.left);bubble.style.setProperty('--tip-arrow',Math.max(12,Math.min(b.width-12,r.left+r.width/2-left))+'px')}
function show(el){if(!el||el===dismissed)return;const text=label(el);if(!text)return;hide();active=el;if(el.hasAttribute('title')){el.dataset.tooltip=el.getAttribute('title');el.removeAttribute('title')}if(!bubble){bubble=document.createElement('div');bubble.id='instant-tool-tip';bubble.className='instant-tool-tip';bubble.setAttribute('role','tooltip');bubble.setAttribute('popover','manual');document.body.append(bubble)}bubble.textContent=text;bubble.hidden=false;const host=document.fullscreenElement||el.closest('dialog[open]')||document.body;if(bubble.parentElement!==host)host.append(bubble);if(bubble.showPopover&&!bubble.matches(':popover-open'))bubble.showPopover();el.setAttribute('aria-describedby',[(el.getAttribute('aria-describedby')||''),bubble.id].filter(Boolean).join(' '));position()}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest?.(selector);if(el&&el!==active){dismissed=null;show(el)}},true);
document.addEventListener('pointerout',e=>{if(active?.contains(e.target)&&!active.contains(e.relatedTarget)){dismissed=null;hide()}},true);
// Popover/dialog focus restoration occurs inside the browser's top-layer transition.
document.addEventListener('focusin',e=>{const target=e.target;queueMicrotask(()=>{if(document.activeElement===target){dismissed=null;show(target.closest?.(selector))}})},true);
document.addEventListener('focusout',hide,true);
document.addEventListener('pointerdown',hide,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){dismissed=active;hide()}},true);
document.addEventListener('scroll',hide,true);
addEventListener('resize',hide);
addEventListener('blur',hide);
new MutationObserver(()=>{if(active&&!active.isConnected)hide();else if(active&&label(active)!==bubble?.textContent)show(active)}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-label','data-tooltip']});

}

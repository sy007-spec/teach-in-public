// Dialog chrome contract shared by TeachInPublic and BibleTree.
// Never change form ownership or bypass a dialog's cancel/close handlers.
const key=Symbol.for('seii.dialog-close');
if(!globalThis[key]){
 globalThis[key]=true;
 const style=document.createElement('style');style.textContent=`
 dialog>.persistent-dialog-bar{position:sticky!important;top:0!important;z-index:1000;display:block!important;height:0!important;min-height:0!important;flex:0 0 0!important;width:100%;padding:0!important;margin:0!important;overflow:visible!important;pointer-events:none}
 dialog>.persistent-dialog-bar>.persistent-dialog-close{position:absolute!important;top:0!important;right:0!important;display:inline-flex!important;align-items:center;justify-content:center;width:34px;height:34px;min-height:34px;padding:7px!important;margin:0!important;border:1px solid #cbd8ce;border-radius:9px;background:var(--panel,#fffefb);color:var(--ink,#315447);box-shadow:0 2px 8px #183b2520;cursor:pointer;pointer-events:auto;line-height:1}
 dialog>.persistent-dialog-bar>.persistent-dialog-close:hover{background:#e7eee5}dialog>.persistent-dialog-bar>.persistent-dialog-close:focus-visible{outline:2px solid #467650;outline-offset:2px}
 dialog[data-persistent-close]>h2,dialog[data-persistent-close]>form>h2{padding-right:44px}
 dialog[data-persistent-close] .persistent-dialog-original{display:none!important}
 dialog>.persistent-dialog-bar>.persistent-dialog-close::after{content:attr(aria-label);position:absolute;right:0;top:39px;padding:5px 8px;border-radius:6px;background:#244b3e;color:white;white-space:nowrap;font:12px/1.4 system-ui;display:none;pointer-events:none}
 dialog>.persistent-dialog-bar>.persistent-dialog-close:hover::after,dialog>.persistent-dialog-bar>.persistent-dialog-close:focus-visible::after{display:block}
 `;document.head.append(style);
 function enhance(dialog){
  if(!dialog.open)return;
  if(dialog.querySelector(':scope > .persistent-dialog-bar'))return;
  dialog.dataset.persistentClose='true';
  const bar=document.createElement('div');bar.className='persistent-dialog-bar';
  const close=document.createElement('button');close.className='persistent-dialog-close';close.type='button';close.setAttribute('aria-label',document.documentElement.lang.startsWith('zh')?'关闭弹窗':'Close dialog');
  close.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  close.onclick=()=>{if(typeof dialog.requestClose==='function')dialog.requestClose('');else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close('');};
  bar.append(close);dialog.prepend(bar);
  // Keep original handlers and DOM nodes intact; hide only redundant X icons.
  for(const old of dialog.querySelectorAll('button.close,.project-dialog-close,.close-role,button[data-close],button[data-cancel][aria-label],#closeDialog')){const focused=document.activeElement===old;old.classList.add('persistent-dialog-original');if(focused)close.focus({preventScroll:true});}
 }
 const observer=new MutationObserver(()=>document.querySelectorAll('dialog[open]').forEach(enhance));observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 document.querySelectorAll('dialog[open]').forEach(enhance);
}

import {openNotifications} from './notifications.js';
import {securityPanel} from './profile-security.js';
const paths={switchCourse:'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',switchRoleView:'M10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M3 21v-3a7 7 0 0 1 11-5M16 11h6m-3-3 3 3-3 3M22 19h-6m3-3-3 3 3 3',logout:'M9 4H4v16h5M13 8l4 4-4 4M8 12h12',full:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',sharePpt:'M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8',admin:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',instructor:'M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6',hosting:'M3 5h18v14H3zM3 9h18M7 15h4',home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',source:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18'};
export function compactHeader(header=document.querySelector('header')){
 if(!header)return;
 for(const el of header.querySelectorAll('.actions button,.actions>a,nav:not(.breadcrumbs) button,nav:not(.breadcrumbs)>a')){
  if(el.querySelector('svg'))continue;
  const label=el.getAttribute('aria-label')||el.textContent.trim(),href=el.getAttribute('href')||'';
  const key=paths[el.id]?el.id:href.includes('github.com')?'source':href.startsWith('/instructor')?'instructor':href.startsWith('/admin')?'admin':href.includes('/dashboard')?'hosting':'home';
  el.title=label;el.setAttribute('aria-label',label);el.classList.add('header-icon');
  el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[key]+'"/></svg>';
 }
}

// Keep the account entry at the far right; the popover escapes toolbar clipping.
export function accountMenu({user,save,security,identity,header=document.querySelector('header')}){
 const logout=header?.querySelector('#logout');if(!logout||header.querySelector('#accountMenuButton'))return;
 const zh=document.documentElement.lang.startsWith('zh'),t=(a,b)=>zh?a:b;
 const trigger=document.createElement('button');trigger.type='button';trigger.id='accountMenuButton';trigger.className='header-icon account-menu-trigger';trigger.setAttribute('aria-label',t('账户菜单','Account menu'));trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','accountMenu');trigger.setAttribute('aria-haspopup','true');
 trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="7" r="4"/><path d="M2 21v-3a8 8 0 0 1 16 0v3m1-12 3 3-3 3"/></svg>';
 const menu=document.createElement('div');menu.id='accountMenu';menu.className='account-menu';menu.popover='auto';menu.setAttribute('aria-label',t('账户操作','Account actions'));
 const name=document.createElement('strong');name.className='account-menu-name';name.textContent=user?.name||t('当前账户','Current account');menu.append(name);
 const profile=document.createElement('button');profile.type='button';profile.id='ownProfile';profile.textContent=t('个人资料设置','Profile settings');menu.append(profile);const notices=document.createElement('button');notices.type='button';notices.id='notificationPreferences';notices.textContent=t('通知与偏好','Notifications & preferences');notices.onclick=()=>setTimeout(openNotifications,0);menu.append(notices);
 for(const e of header.querySelectorAll('#switchRoleView,a[href="/instructor"],a[href="/admin"],a[href*="/_hosting/return"]')){const label=e.getAttribute('aria-label')||e.textContent;e.classList.remove('header-icon');e.removeAttribute('title');e.removeAttribute('data-tooltip');e.textContent=label;menu.append(e)}
 logout.classList.remove('header-icon');logout.removeAttribute('title');logout.removeAttribute('data-tooltip');logout.textContent=t('退出登录','Sign out');menu.append(logout);header.append(trigger,menu);
 const position=()=>{const r=trigger.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8)+'px'};
 trigger.onclick=()=>menu.togglePopover();
 menu.addEventListener('toggle',()=>{const open=menu.matches(':popover-open');trigger.setAttribute('aria-expanded',String(open));if(open)position()});
 trigger.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();menu.showPopover();profile.focus()}};
 menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button,a')];const index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}if(e.key==='Escape'){e.preventDefault();menu.hidePopover();trigger.focus()}};
 menu.addEventListener('click',e=>{if(e.target.closest('button,a')){menu.hidePopover();trigger.focus()}},true);
 profile.onclick=()=>showProfile({user,save,security,identity,t,after:()=>{name.textContent=user.name;const label=header.querySelector('.user-name');if(label)label.textContent=user.name},returnTo:trigger});
}

function showProfile({user,save,security,identity,t,after,returnTo}){
 if(document.querySelector('#ownProfileDialog'))return;
 const dialog=document.createElement('dialog');dialog.id='ownProfileDialog';dialog.className='project-dialog';dialog.setAttribute('aria-labelledby','ownProfileHeading');
 const form=document.createElement('form'),heading=document.createElement('h2');heading.id='ownProfileHeading';heading.textContent=t('个人资料设置','Profile settings');
 const label=document.createElement('label');label.textContent=t('显示名称','Display name');const input=document.createElement('input');input.id='ownProfileName';input.required=true;input.maxLength=80;input.value=user?.name||'';input.autocomplete='nickname';label.append(input);
 const email=document.createElement('p');email.textContent=t('邮箱：','Email: ')+(user?.email||t('未绑定','Not linked'));
 const status=document.createElement('p');status.setAttribute('role','status');status.className='error';
 const actions=document.createElement('div');actions.className='project-dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('取消','Cancel');const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent=t('保存','Save');actions.append(cancel,submit);form.append(heading,email,label,status,actions);dialog.append(form);document.body.append(dialog);
 let busy=false;cancel.onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{e.stopPropagation();if(busy)e.preventDefault()});dialog.addEventListener('close',()=>{dialog.remove();if(returnTo.isConnected)returnTo.focus()},{once:true});
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const name=input.value.trim();if(!name){status.textContent=t('请输入显示名称','Enter a display name');return}busy=true;submit.disabled=cancel.disabled=true;status.textContent='';try{await save(name);user.name=name;after();dialog.close()}catch(error){status.textContent=error.message}finally{busy=false;submit.disabled=cancel.disabled=false}};
 if(security){const button=document.createElement('button');button.type='button';button.id='profileSecurity';button.textContent=t('修改安全设置或密码','Change security settings or password');button.onclick=async()=>{button.disabled=true;try{await securityPanel({...security,t})}catch(error){status.textContent=error.message}finally{button.disabled=false}};dialog.append(button)}
 if(identity){const section=document.createElement('section');section.className='profile-identity';const title=document.createElement('h3');title.textContent=t(identity.label?.zh||'外部身份',identity.label?.en||'External identity');const description=document.createElement('p');description.id='profileIdentityStatus';description.textContent=identity.linked?t('已绑定，可用于登录','Linked. Sign-in enabled'):identity.enabled?t('尚未绑定。验证后关联当前邮箱账号。','Not linked. Verify to link this email account.'):(identity.setupText||t('课堂尚未开通此登录方式，请联系课堂主。','This sign-in method is not configured. Contact the classroom owner.'));const button=document.createElement('button');button.type='button';button.id='profileIdentityBind';button.textContent=t(identity.linked?'验证绑定':'绑定身份',identity.linked?'Verify linked identity':'Link identity');button.disabled=!identity.enabled;button.onclick=()=>{if(input.value.trim()!==(user?.name||'')){status.textContent=t('请先保存昵称修改，再绑定账号。','Save your name change before linking.');return}identity.bind(button)};section.append(title,description,button);if(identity.configureUrl){const link=document.createElement('a');link.href=identity.configureUrl;link.className='button';link.id='profileIdentitySetup';link.textContent=t('配置身份服务','Configure identity service');section.append(link)}dialog.append(section)}
 dialog.showModal();input.focus();input.select();
}

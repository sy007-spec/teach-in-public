const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export async function renderProjectAuthority({root,course,api,t}){
 root.replaceChildren();root.append(el('h2',t('课程授权','Course access')));
 const invitation=new URL('/_project/start',location.origin);invitation.searchParams.set('course',course);
 root.append(el('p',t('将此课程入口提供给本商户成员。对方完成统一身份登录后出现在待授权名单；登录本身不授予教材权限。','Give this course entry to a merchant member. Verified sign-in creates an application; it does not grant material access.')));
 const link=el('a',invitation.href);link.href=invitation.href;root.append(link);
 const data=await api('/api/project-authority?'+new URLSearchParams({course}));
 const keys=[['annotate','教学批注','Annotations'],['draft','编撰草稿','Draft editing'],['publish','正式发布','Publication'],['moderate','问答管理','Moderation'],['stats','学习汇总','Learning summaries'],['versions','历史版本','Version history'],['manage','课程授权管理','Course access management']];
 const status=el('p');status.setAttribute('role','status');root.append(status);
 if(!data.items.length)root.append(el('p',t('暂时没有申请。','No applications yet.')));
 for(const user of data.items){
  const form=el('form');form.className='card';form.append(el('h3',user.name),el('p',user.capabilities.manage?t('课程管理员','Course manager'):user.status==='approved'?t('已授权','Approved'):user.status==='revoked'?t('已撤销','Revoked'):t('待授权','Pending')));
  const expiry=user.teaching_expires||user.expires;if(expiry)form.append(el('p',t('有效期至：','Expires: ')+expiry));
  if(user.id===data.user){form.append(el('p',t('本人权限须由其他课程管理员调整。','Another course manager must change your permissions.')));root.append(form);continue;}
  const days=el('input');days.type='number';days.min='1';days.max='365';days.value='30';days.required=true;
  const validity=el('label',t('有效天数','Validity in days'));validity.append(days);form.append(validity);
  form.append(el('p',t('只批准阅读时，不勾选下方教学能力。','Leave teaching capabilities unchecked to approve reading only.')));
  const checks={};for(const [key,zh,en] of keys){const input=el('input');input.type='checkbox';input.checked=!!user.capabilities[key];checks[key]=input;const label=el('label',t(zh,en));label.prepend(input);form.append(label);}
  const approve=el('button',t('确认课程授权','Confirm course access'));approve.type='submit';const revoke=el('button',t('撤销本课程权限','Revoke course access'));revoke.type='button';form.append(approve,revoke);
  async function save(decision){approve.disabled=revoke.disabled=true;try{await api('/api/project-authority',{method:'POST',body:{course,user:user.id,status:decision,days:Number(days.value),capabilities:Object.fromEntries(Object.entries(checks).map(([key,input])=>[key,input.checked]))}});await renderProjectAuthority({root,course,api,t});}catch(e){status.textContent=e.message;approve.disabled=revoke.disabled=false;}}
  form.onsubmit=event=>{event.preventDefault();void save('approved');};revoke.onclick=()=>void save('revoked');root.append(form);
 }
}
export function renderProjectEnrollment({root,session,t}){
 root.replaceChildren();const main=el('main');main.className='card';main.append(el('h1',t('课程访问申请','Course access request')));
 main.append(el('p',session.projectEnrollment?.status==='revoked'?t('本课程权限已撤销或失效，请联系课程管理员。','Access is revoked or expired. Contact the course manager.'):t('身份已验证，等待课程管理员授权。确认授权后刷新进入学习。','Your identity is verified. Wait for course approval, then refresh to begin learning.')));
 const refresh=el('button',t('刷新授权状态','Refresh access status'));refresh.onclick=()=>location.reload();main.append(refresh);root.append(main);
}

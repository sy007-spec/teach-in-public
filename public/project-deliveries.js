// Project candidates are reviewed inside the existing teaching editor only.
export async function mountProjectDeliveries({host,course,api,t,refresh}){
 if(!host||!course)return;
 host.querySelector('[data-project-deliveries]')?.remove();
 const panel=document.createElement('section');panel.className='card';panel.dataset.projectDeliveries=course;
 const heading=document.createElement('h2');heading.textContent=t('项目交付候选','Project delivery candidates');panel.append(heading);host.append(panel);
 const showError=error=>{const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=error.message;panel.append(p);};
 try{
  const result=await api('/api/project-deliveries?'+new URLSearchParams({course}));
  if(!panel.isConnected)return;
  if(!result.items.length){panel.remove();return;}
  for(const item of result.items){
   const row=document.createElement('article'),label=document.createElement('p');
   label.textContent=item.id+' · '+t(item.status==='accepted'?'已接收为草稿':'待检查',item.status==='accepted'?'Accepted as draft':'Pending review')+' · '+t('来源版本 ','Source revision ')+item.source_revision;
   row.append(label);
   const open=document.createElement('button');open.textContent=t('检查交付内容','Review candidate');row.append(open);
   open.onclick=async()=>{open.disabled=true;try{
    const candidate=await api('/api/project-deliveries/'+encodeURIComponent(item.id));
    if(!panel.isConnected)return;
    const preview=document.createElement('textarea');preview.readOnly=candidate.status==='accepted';preview.rows=12;preview.setAttribute('aria-label',t('整理交付教材候选','Edit delivered material candidate'));preview.value=candidate.markdown;row.append(preview);
    const notice=document.createElement('p');notice.textContent=t('接收只生成草稿，仍需检查并在教材页正式发布。基础版本不一致时请在现有编辑流程中合并，不会覆盖当前教材。','Acceptance creates a draft only. Review and publish it in the material editor. If the base version changed, merge through the existing editing workflow; current material will not be overwritten.');row.append(notice);
    if(candidate.status!=='accepted'){
     const accept=document.createElement('button');accept.textContent=t('接收为教材草稿','Accept as material draft');row.append(accept);
     accept.onclick=async()=>{accept.disabled=true;try{await api('/api/project-deliveries/'+encodeURIComponent(item.id),{method:'POST',body:{markdown:preview.value}});await refresh();}catch(e){showError(e);accept.disabled=false;}};
    }
   }catch(e){showError(e);open.disabled=false;}};
   panel.append(row);
  }
 }catch(e){if(panel.isConnected)showError(e);}
}

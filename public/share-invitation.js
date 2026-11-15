export async function enterShareInvitation({session,api,renderAccess,renderSecurity,refresh,t}){
 const raw=new URLSearchParams(location.hash.slice(1)).get('invite');if(!raw)return false;
 const response=await fetch('/api/share-entry',{headers:{authorization:'Bearer '+raw},cache:'no-store'}),d=await response.json();
 if(!response.ok){history.replaceState(null,'',location.pathname);throw Error(t('分享已失效，请联系分享者','Share unavailable; contact the sharer'))}
 if(session.security){renderSecurity();return true}
 if(session.course?.id===d.course&&session.user.email){
  await api('/api/share-enroll',{method:'POST',body:{share:raw}});history.replaceState(null,'','/?businessVersion='+encodeURIComponent(d.businessVersion));await refresh();return true;
 }
 // Render the normal account registration once, retaining its consent and security flow.
 renderAccess(true);const code=document.getElementById('code');code.value=d.code;code.readOnly=true;
 const note=document.createElement('p');note.className='small muted';note.textContent=t('分享课程：','Shared course: ')+(d.title.zh||d.title.en)+t('。登记邮箱并完成账户验证后获得课堂授权。',' — register your email and verify your account to enroll.');code.closest('form').prepend(note);return true;
}

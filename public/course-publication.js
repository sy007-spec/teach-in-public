// Publication stays in the existing teaching editor and uses its live capability.
export function mountCoursePublication({host,course,editor,api,t,refresh}){
 if(!host||!course)return;host.querySelector('[data-course-publication]')?.remove();
 const section=document.createElement('section');section.className='card';section.dataset.coursePublication=course;
 const title=document.createElement('h2');title.textContent=t('审核并发布当前课程','Review and publish this course');section.append(title);
 const note=document.createElement('p');note.textContent=t('仅发布到本课程已授权的学习范围，不自动开放公众访问。请检查中英文内容和资料来源。','Publishes only to this course’s authorized audience. Public access is not enabled. Review both languages and the sources.');section.append(note);
 const check=document.createElement('input');check.type='checkbox';const label=document.createElement('label');label.textContent=t('我已审核当前教材及受众范围','I reviewed this material and its audience');label.prepend(check);section.append(label);
 const button=document.createElement('button');button.textContent=t('发布当前草稿','Publish current draft');button.disabled=!editor.draft||editor.material?.source?.languageReady===false;section.append(button);const status=document.createElement('p');status.setAttribute('role','status');section.append(status);
 if(editor.material?.source?.languageReady===false)status.textContent=t('双语内容尚未准备好，请先补齐并检查翻译。','Bilingual material is not ready; complete and review the translation first.');
 button.onclick=async()=>{if(!check.checked){status.textContent=t('请先确认已完成审核。','Confirm your review first.');return;}button.disabled=true;try{await api('/api/instructor/publish',{method:'POST',body:{course,version:editor.draft,basePublished:editor.published,confirmMarkdown:true}});await refresh();}catch(e){status.textContent=e.message;button.disabled=false;}};host.append(section);
}

import {esc} from './render.js';

export function courseList(courses,selected,t){
 return '<section class="card course-overview" aria-labelledby="courseListTitle"><div class="course-list-heading"><h2 id="courseListTitle">'+t('全部课程','All courses')+' <span class="muted">'+courses.length+'</span></h2><label>'+t('搜索课程','Find a course')+'<input id="courseSearch" type="search" placeholder="'+t('中文名、英文名或课程编号','Chinese name, English name or course ID')+'"></label></div><div class="course-grid">'+courses.map(c=>'<button type="button" class="course-tile" data-course-open="'+esc(c.id)+'" aria-pressed="'+(c.id===selected)+'"><span class="course-tile-title">'+esc(c.title.zh||c.title.en)+'</span><span class="course-tile-subtitle">'+esc(c.title.en||c.title.zh)+'</span><span class="course-tile-code">'+t('口令：','Code: ')+(c.code?'<code>'+esc(c.code)+'</code>':t('历史口令未保存，更换后可显示','Historical code not saved; change it to display'))+'</span><span class="course-tile-state"><span>'+t(c.enabled?'已启用':'已停用',c.enabled?'Enabled':'Disabled')+'</span><span>'+t(c.published?'已有发布教材':c.draft?'教材待发布':'尚未上传教材',c.published?'Published material':c.draft?'Unpublished material':'No material uploaded')+'</span></span><span class="course-tile-action">'+t(c.id===selected?'正在管理':'管理课程',c.id===selected?'Currently managing':'Manage course')+'</span></button>').join('')+'</div><p id="courseSearchEmpty" hidden>'+t('没有匹配的课程','No matching courses')+'</p></section>';
}

export function bindCourseList(courses,onSelect){
 const search=document.getElementById('courseSearch');
 const buttons=[...document.querySelectorAll('[data-course-open]')];
 search.oninput=()=>{const query=search.value.trim().toLocaleLowerCase();let visible=0;for(const button of buttons){const c=courses.find(c=>c.id===button.dataset.courseOpen);button.hidden=![c.id,c.title.zh,c.title.en].join(' ').toLocaleLowerCase().includes(query);if(!button.hidden)visible++}document.getElementById('courseSearchEmpty').hidden=visible>0;};
 for(const button of buttons)button.onclick=()=>onSelect(button.dataset.courseOpen);
}

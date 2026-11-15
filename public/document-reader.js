import {esc,markdown} from './render.js';

// Uses only the material returned by the authorized classroom endpoint.
export function mountDocumentReader({course,local,t,exercise,select,current,navigate}){
 const classroom=document.querySelector('.classroom'),reading=document.getElementById('reading'),toc=classroom.querySelector('.toc');
 const abort=new AbortController(),entries=[],annotations=document.getElementById('annotations'),links=document.getElementById('systemLinks');
 classroom.classList.add('document-classroom');
 toc.innerHTML='<div class="eyebrow">'+t('课程目录','COURSE CONTENTS')+'</div>'+course.material.lessons.map((lesson,li)=>'<details open><summary>'+esc(local(lesson.title))+'</summary>'+lesson.pages.map((page,pi)=>'<a href="#'+new URLSearchParams({lesson:lesson.id,page:page.id})+'" data-document-link="'+li+':'+pi+'">'+esc(local(page.title))+'</a>').join('')+'</details>').join('');
 reading.innerHTML='<div class="document-book">'+course.material.lessons.map((lesson,li)=>'<section class="document-chapter"><h1>'+esc(local(lesson.title))+'</h1>'+lesson.pages.map((page,pi)=>'<article class="sheet document-section" data-document-page="'+li+':'+pi+'" tabindex="-1"><main class="markdown"><h2>'+esc(local(page.title))+'</h2>'+(page.objective?'<p class="objective">'+esc(local(page.objective))+'</p>':'')+markdown(local(page.body))+exercise(page).replace('id="checkStatus" class="small muted"','class="check-status small muted"')+'</main></article>').join('')+'</section>').join('')+'</div>';
 const mobile=document.getElementById('mobileToc');mobile.innerHTML=course.material.lessons.map((lesson,li)=>'<optgroup label="'+esc(local(lesson.title))+'">'+lesson.pages.map((page,pi)=>'<option value="'+li+':'+pi+'">'+esc(local(page.title))+'</option>').join('')+'</optgroup>').join('');
 mobile.onchange=e=>{const [li,pi]=e.target.value.split(':').map(Number);navigate(li,pi)};
 const toggle=document.createElement('button');toggle.id='documentTocToggle';toggle.textContent=t('目录','Contents');toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const open=classroom.classList.toggle('document-toc-open');toggle.setAttribute('aria-expanded',String(open))};document.querySelector('.toolbar').prepend(toggle);
 toc.querySelectorAll('[data-document-link]').forEach(a=>a.onclick=e=>{e.preventDefault();const [li,pi]=a.dataset.documentLink.split(':').map(Number);navigate(li,pi);classroom.classList.remove('document-toc-open');toggle.setAttribute('aria-expanded','false')});
 reading.querySelectorAll('[data-document-page]').forEach(el=>{const [li,pi]=el.dataset.documentPage.split(':').map(Number);entries.push({el,li,pi})});
 function mark(li,pi){
  const key=li+':'+pi,entry=entries.find(e=>e.li===li&&e.pi===pi);if(!entry)return;
  reading.querySelector('#pageContent')?.removeAttribute('id');reading.querySelector('#checkStatus')?.removeAttribute('id');entry.el.querySelector('main').id='pageContent';const status=entry.el.querySelector('.check-status');if(status)status.id='checkStatus';
  entry.el.append(links,annotations);annotations.replaceChildren();mobile.value=key;
  toc.querySelectorAll('a').forEach(a=>{if(a.dataset.documentLink===key){a.setAttribute('aria-current','location');a.closest('details').open=true;const box=a.getBoundingClientRect(),pane=toc.getBoundingClientRect();if(box.top<pane.top||box.bottom>pane.bottom)toc.scrollTop+=box.top-pane.top-toc.clientHeight/2}else a.removeAttribute('aria-current')});
 }
 function go(li,pi){const entry=entries.find(e=>e.li===li&&e.pi===pi);if(!entry)return;mark(li,pi);reading.scrollTop+=entry.el.getBoundingClientRect().top-reading.getBoundingClientRect().top-12;}
 let frame=0;
 reading.addEventListener('scroll',()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!reading.isConnected)return;const top=reading.getBoundingClientRect().top+48;const active=reading.scrollTop+reading.clientHeight>=reading.scrollHeight-2?entries.at(-1):entries.find(e=>e.el.getBoundingClientRect().bottom>top)||entries.at(-1);if(active){const [li,pi]=current();if(li!==active.li||pi!==active.pi){select(active.li,active.pi);mark(active.li,active.pi)}}})},{passive:true,signal:abort.signal});
 go(...current());
 return {go,element:()=>entries.find(e=>e.li===current()[0]&&e.pi===current()[1])?.el,destroy(){abort.abort();cancelAnimationFrame(frame)}};
}

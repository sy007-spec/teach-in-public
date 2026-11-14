import {esc,markdown} from './render.js';
export function openCourseSearch({initialQuery='',page,language='zh',api,dialog,body,t,local,jump,questionMarkup,questionActions}){
 dialog('<section class="course-search"><h2>'+t('搜索本课程','Search this course')+'</h2><form id="courseSearchForm" class="actions"><input id="courseSearchText" type="search" required maxlength="200" placeholder="'+t('你想了解什么？','What would you like to understand?')+'" aria-label="'+t('搜索问题','Search question')+'"><select id="courseSearchType" aria-label="'+t('内容范围','Source type')+'"><option value="all">'+t('全部','All')+'</option><option value="material">'+t('教材','Lessons')+'</option><option value="knowledge">'+t('知识库','Knowledge')+'</option><option value="discussion">'+t('提问与回答','Questions & answers')+'</option></select><button>'+t('分析搜索意图','Clarify intent')+'</button></form><p class="small muted">'+t('结合本课程、当前页面、你的学习记录和历史留言理解问题；经你确认后才搜索。','Uses this course, current page, your learning records and your messages to clarify your question. Search starts only after you confirm.')+'</p><div id="courseSearchIntent" aria-live="polite"></div><div id="courseSearchResults" aria-live="polite"></div></section>');
 const $=id=>body.querySelector('#'+id),results=$('courseSearchResults'),intent=$('courseSearchIntent'),form=$('courseSearchForm');let offset=0,serial=0,confirmed=null;
 const active=run=>run===serial&&form.isConnected&&(form.closest('dialog')?.open??true);
 const label=type=>({material:t('教材','Lesson'),knowledge:t('知识库','Knowledge'),discussion:t('提问与回答','Questions & answers')})[type];
 const busy=message=>'<p class="search-ai-working" role="status"><span aria-hidden="true"></span>'+message+'</p>';
 function reset(){serial++;confirmed=null;intent.innerHTML='';results.innerHTML='';}
 async function original(r,container){
  container.innerHTML=busy(t('读取原文…','Loading original…'));
  try{const data=await api(r.type==='discussion'?'/api/question?id='+encodeURIComponent(r.id):'/api/course-search/source?'+new URLSearchParams({type:r.type,id:r.id}));if(!container.isConnected)return;
   container.innerHTML=r.type==='discussion'?questionMarkup(data):'<h4>'+esc(local(data.title))+'</h4><div class="actions"><button type="button" data-source-lang="zh">中文</button><button type="button" data-source-lang="en">English</button></div><article class="markdown search-source">'+markdown(local(data.body))+'</article>';
   if(r.type==='discussion')questionActions?.(container,data);else container.querySelectorAll('[data-source-lang]').forEach(b=>b.onclick=()=>{container.querySelector('.search-source').innerHTML=markdown(data.body[b.dataset.sourceLang]||local(data.body))});
  }catch(e){container.innerHTML='<p role="alert">'+esc(e.message)+'</p>';}
 }
 async function search(){
  if(!confirmed)return;const run=++serial,request={...confirmed,offset,language};results.innerHTML=busy(t('正在检索课程资料…','Finding course sources…'));
  try{
   const data=await api('/api/course-search?'+new URLSearchParams({q:request.q,type:request.type,offset}));if(!active(run))return;
   if(!data.items.length){results.innerHTML='<p>'+t('没有找到匹配内容，请调整问题或关键词。','No matches. Adjust your question or keywords.')+'</p>';return;}
   results.innerHTML=busy(t('AI正在整理搜索结果，完成后显示摘要…','AI is preparing the search summaries. Results will appear when ready…'));
   const summary=await api('/api/course-search/summaries',{method:'POST',body:{...request,fingerprint:data.fingerprint}});if(!active(run))return;
   const byKey=new Map((summary.items||[]).map(item=>[item.key,item]));
   if(summary.status!=='ready'||data.items.some(item=>!byKey.get(item.type+':'+item.id)?.summary))throw Error(t('AI尚未完成全部摘要，请重试。','AI could not finish every summary. Please retry.'));
   results.innerHTML='<p class="small muted">'+t('AI已整理本页全部结果。展开各项可核对原始素材。','AI summaries are ready. Expand any result to read its original source.')+'</p>'+data.items.map((r,i)=>{const item=byKey.get(r.type+':'+r.id);return '<article class="search-result" data-search-result="'+i+'"><span class="badge">'+label(r.type)+'</span><strong data-result-title>'+esc(item.title)+'</strong><p data-result-summary>'+esc(item.summary)+'</p><details data-result-original><summary>'+t('展开原始信息','Expand original content')+'</summary><div data-source-content></div></details>'+(r.page?'<button type="button" data-search-jump>'+t('前往教材页面','Go to lesson')+'</button>':'')+'</article>';}).join('')+'<div class="actions"><button data-search-prev '+(!offset?'disabled':'')+'>'+t('上一页','Previous')+'</button><span>'+data.total+' '+t('条结果','results')+'</span><button data-search-next '+(offset+20>=data.total?'disabled':'')+'>'+t('下一页','Next')+'</button></div>';
   results.querySelectorAll('[data-search-result]').forEach(card=>{const r=data.items[Number(card.dataset.searchResult)];card.querySelector('[data-result-original]').ontoggle=e=>{if(e.target.open)original(r,card.querySelector('[data-source-content]'))};card.querySelector('[data-search-jump]')?.addEventListener('click',()=>jump(r.page));});
   results.querySelector('[data-search-prev]').onclick=()=>{offset=Math.max(0,offset-20);search()};results.querySelector('[data-search-next]').onclick=()=>{offset+=20;search()};
  }catch(e){if(active(run)){results.innerHTML='<p role="alert">'+esc([401,403,409].includes(e.status)?e.message:t('摘要暂未完成，请重试。原始素材不会作为搜索结果直接展示。','Summaries are not ready. Please retry; raw sources will not be shown as results.'))+'</p>'+(![401,403,409].includes(e.status)?'<button type="button" data-summary-retry>'+t('重新生成摘要','Retry summaries')+'</button>':'');results.querySelector('[data-summary-retry]')?.addEventListener('click',search);}}
 }
 async function clarify(){
  const q=$('courseSearchText').value.trim();if(!q)return;const run=++serial;confirmed=null;results.innerHTML='';intent.innerHTML=busy(t('AI正在结合学习上下文理解你的意图…','AI is checking your learning context…'));
  let proposal={status:'fallback',intent:q,query:q,reason:''};
  try{proposal=await api('/api/course-search/intent',{method:'POST',body:{q,page,language}});}catch(e){if([401,403,409].includes(e.status)){if(active(run))intent.innerHTML='<p role="alert">'+esc(e.message)+'</p>';return;}}
  if(!active(run))return;
  intent.innerHTML='<section class="search-intent"><h3>'+t('先确认你想了解的内容','Confirm what you want to find')+'</h3><p>'+esc(proposal.intent)+'</p><p class="small muted">'+esc(proposal.status==='ready'?proposal.reason:t('AI暂时不可用，请确认或修改原始搜索词。','AI is unavailable. Confirm or edit your original search terms.'))+'</p><label>'+t('可修改搜索词','Edit search terms')+'<input id="confirmedSearchText" maxlength="200" value="'+esc(proposal.query)+'"></label><div class="actions"><button type="button" id="confirmCourseSearch" class="primary">'+t('确认并搜索','Confirm and search')+'</button><button type="button" id="reviseSearchIntent">'+t('重新描述问题','Rephrase question')+'</button></div></section>';
  $('reviseSearchIntent').onclick=()=>{reset();$('courseSearchText').focus()};$('confirmedSearchText').oninput=()=>{serial++;confirmed=null;results.innerHTML=''};
  $('confirmCourseSearch').onclick=()=>{const value=$('confirmedSearchText').value.trim();if(!value){$('confirmedSearchText').focus();return;}confirmed={q:value,type:$('courseSearchType').value};offset=0;search()};
 }
 form.onsubmit=e=>{e.preventDefault();clarify()};$('courseSearchText').oninput=reset;$('courseSearchType').onchange=reset;$('courseSearchText').value=initialQuery;$('courseSearchText').focus();if(initialQuery.trim())clarify();
}

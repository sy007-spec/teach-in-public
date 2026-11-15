import {esc} from './render.js';
export function shareCard(d,{t,local}){
 return '<article class="course-share-card" id="courseShareCard"><div class="share-brand">TeachInPublic <span>'+t('课程分享','COURSE INVITATION')+'</span></div><div class="share-cover" aria-hidden="true">'+esc([...local(d.title||{})][0]||'T')+'</div><h2>'+esc(local(d.title||{}))+'</h2><p class="share-subtitle">'+(d.instructor?t('讲师邀请 · 仅可授权一次','INSTRUCTOR · ONE RECIPIENT'):d.singleUse?t('课程邀请 · 仅可授权一次','COURSE INVITATION · ONE RECIPIENT'):t('阅读 · 提问 · 理解','READ · ASK · UNDERSTAND'))+'</p><div class="share-modes"><div><strong>'+(d.instructor?t('讲师授权','Instructor access'):t('PPT 阅读','PPT reading'))+'</strong><span>'+(d.instructor?t('完成账户验证后领取','Verify account to redeem'):t('第一页直接阅读 · 后续需审批','First page open · Approval afterwards'))+'</span></div><div><strong>'+t('课堂学习','Classroom')+'</strong><span>'+t('登记邮箱 · 正式授权','Register email · Enroll')+'</span></div></div><div class="share-card-bottom"><img class="ppt-qr" src="'+esc(d.qr)+'" alt="'+t('扫码打开课程','Scan to open course')+'"><div><strong>'+t('扫码选择阅读方式','Scan to choose how to learn')+'</strong><p>'+t('课程口令自动填入','Course code filled automatically')+'</p><small>'+t('打开下一页时申请审批','Request approval for the next page')+'</small></div></div></article>';
}
async function cardBlob(d,{t,local}){
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1160;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f7f4ef';ctx.fillRect(0,0,900,1160);ctx.fillStyle='#fff';ctx.fillRect(40,40,820,1080);
 ctx.fillStyle='#4338a8';ctx.font='bold 28px sans-serif';ctx.fillText('TeachInPublic',80,105);
 const gradient=ctx.createLinearGradient(80,150,820,430);gradient.addColorStop(0,'#994c39');gradient.addColorStop(1,'#756625');ctx.fillStyle=gradient;ctx.fillRect(80,150,740,280);
 ctx.fillStyle='#fff';ctx.font='80px serif';ctx.textAlign='center';ctx.fillText([...local(d.title)][0]||'T',450,325);ctx.textAlign='left';
 ctx.fillStyle='#202033';ctx.font='bold 38px sans-serif';let line='',y=495;for(const char of local(d.title)){if(ctx.measureText(line+char).width>730){ctx.fillText(line,80,y);y+=48;line='';if(y>590){line='…';break}}line+=char}ctx.fillText(line,80,y);
 ctx.font='25px sans-serif';ctx.fillStyle='#555';ctx.fillText((d.instructor?t('讲师邀请 · 完成账户验证后领取','Instructor invitation · Verify account to redeem'):t('PPT 第一页直接阅读，后续需审批','PPT: first page open; approval afterwards')),80,680);ctx.fillText(t('课堂模式 · 登记邮箱获得正式授权','Classroom · Register email to enroll'),80,728);
 const qr=new Image();qr.src=d.qr;await qr.decode();ctx.drawImage(qr,80,800,230,230);ctx.font='24px sans-serif';ctx.fillText(t('扫码打开课程','Scan to open course'),340,880);ctx.fillText((d.singleUse?t('仅限一次成功授权','One recipient only'):t('自动填入口令','Code filled automatically')),340,927);
 return new Promise(r=>canvas.toBlob(r,'image/png'));
}

export async function downloadShareCard(d,options){const blob=await cardBlob(d,options),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='course-share.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export async function copyShareCard(d,options){if(!navigator.clipboard?.write||!globalThis.ClipboardItem)throw Error(options.t('此浏览器不支持复制图片，请保存卡片后分享','Image clipboard unavailable; save the card to share'));await navigator.clipboard.write([new ClipboardItem({'image/png':cardBlob(d,options)})])}

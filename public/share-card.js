import {esc} from './render.js';
export function shareCard(d,{t,local}){
 return '<article class="course-share-card" id="courseShareCard"><div class="share-brand">TeachInPublic <span>'+t('课程分享','COURSE INVITATION')+'</span></div><div class="share-cover" aria-hidden="true">'+esc([...local(d.title||{})][0]||'T')+'</div><h2>'+esc(local(d.title||{}))+'</h2><p class="share-subtitle">'+t('阅读 · 提问 · 理解','READ · ASK · UNDERSTAND')+'</p><div class="share-modes"><div><strong>'+t('PPT 阅读','PPT reading')+'</strong><span>'+t('无需登录 · ','No sign-in · ')+d.durationHours+t(' 小时',' hours')+'</span></div><div><strong>'+t('课堂学习','Classroom')+'</strong><span>'+t('登记邮箱 · 正式授权','Register email · Enroll')+'</span></div></div><div class="share-card-bottom"><img class="ppt-qr" src="'+esc(d.qr)+'" alt="'+t('扫码打开课程','Scan to open course')+'"><div><strong>'+t('扫码选择阅读方式','Scan to choose how to learn')+'</strong><p>'+t('课程口令自动填入','Course code filled automatically')+'</p><small>'+t('PPT 从首次打开开始计时','PPT timer starts on first opening')+'</small></div></div></article>';
}
export async function downloadShareCard(d,{t,local}){
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1160;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f7f4ef';ctx.fillRect(0,0,900,1160);ctx.fillStyle='#fff';ctx.fillRect(40,40,820,1080);
 ctx.fillStyle='#4338a8';ctx.font='bold 28px sans-serif';ctx.fillText('TeachInPublic',80,105);
 const gradient=ctx.createLinearGradient(80,150,820,430);gradient.addColorStop(0,'#994c39');gradient.addColorStop(1,'#756625');ctx.fillStyle=gradient;ctx.fillRect(80,150,740,280);
 ctx.fillStyle='#fff';ctx.font='80px serif';ctx.textAlign='center';ctx.fillText([...local(d.title)][0]||'T',450,325);ctx.textAlign='left';
 ctx.fillStyle='#202033';ctx.font='bold 38px sans-serif';let line='',y=495;for(const char of local(d.title)){if(ctx.measureText(line+char).width>730){ctx.fillText(line,80,y);y+=48;line='';if(y>590){line='…';break}}line+=char}ctx.fillText(line,80,y);
 ctx.font='25px sans-serif';ctx.fillStyle='#555';ctx.fillText(t('PPT 免登录阅读 · ','PPT without sign-in · ')+d.durationHours+t(' 小时',' hours'),80,680);ctx.fillText(t('课堂模式 · 登记邮箱获得正式授权','Classroom · Register email to enroll'),80,728);
 const qr=new Image();qr.src=d.qr;await qr.decode();ctx.drawImage(qr,80,800,230,230);ctx.font='24px sans-serif';ctx.fillText(t('扫码打开课程','Scan to open course'),340,880);ctx.fillText(t('自动填入口令','Code filled automatically'),340,927);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='course-share.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

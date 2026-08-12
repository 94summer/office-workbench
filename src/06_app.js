<script>
/* ==================== 时间与格式化 ==================== */
const fmtNow=()=>{const d=new Date();return ymd(d)+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
const fmtTime=()=>fmtNow();

/* ==================== 统一渲染 ==================== */
function renderAll(){
  renderBanner();renderHome();renderTodo();renderCal();
  renderNote();renderProj();renderReview();renderSetting();
}

/* ==================== 设置页（久坐提醒状态） ==================== */
function renderSetting(){
  const s=DB.settings;
  const sw=$('#sedSw');if(sw)sw.classList.toggle('on',!!s.sedEnabled);
  const st=$('#sedState');if(st)st.textContent=s.sedEnabled?'提醒中':'未开启';
  const nx=$('#sedNext');if(nx)nx.textContent=s.sedEnabled?('到点起身活动 '+s.sedRest+' 分钟'):'开启后按间隔提醒你起身活动';
  const mn=$('#sedMin');if(mn)mn.value=s.sedMin;
  const rs=$('#sedRest');if(rs)rs.value=s.sedRest;
  const sc=$('#sedCount');if(sc)sc.textContent=s.sedCount||0;
  const sd=$('#sedDone');if(sd)sd.textContent=s.sedDone||0;
  const snd=$('#sedSound');if(snd)snd.checked=!!s.sedSound;
  const ts=$('#taskSound');if(ts)ts.checked=s.taskSound!==false;
  $$('#sedPreset .chip').forEach(c=>c.classList.toggle('on',+c.dataset.m===s.sedMin));
  updateSedRing();
  const le=$('#lastExp');if(le)le.textContent=DB.meta.lastExport||'从未导出';
  const dc=$('#dataCount');if(dc)dc.textContent=totalCount();
  // 自定义音乐文件名
  const mnEl=$('#sedMusicName'),clr=$('#sedClearMusic');
  if(mnEl)mnEl.textContent=s.sedMusicName||'未设置';
  if(clr)clr.style.display=s.sedMusic?'':'none';
}

/* ==================== 弹窗 ==================== */
function openModal(title,body,footer){
  $('#modalRoot').innerHTML=
    `<div class="mask" id="modalMask"><div class="modal">
      <div class="modal-h"><svg class="ic" style="color:var(--brand)"><use href="#i-set"/></svg><h3>${esc(title)}</h3>
      <button class="iconbtn" id="modalX"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="modal-b">${body}</div><div class="modal-f">${footer}</div>
    </div></div>`;
  const m=$('#modalMask');m.addEventListener('click',e=>{if(e.target===m)closeModal();});
  $('#modalX').onclick=closeModal;
}
function closeModal(){$('#modalRoot').innerHTML='';}
function confirmBox(title,msg,cb){
  openModal(title,`<p style="font-size:13.5px;color:var(--tx2);line-height:1.7;margin:0">${esc(msg)}</p>`,
    `<button class="btn" id="cfNo">取消</button><button class="btn dgr" id="cfYes">确定</button>`);
  $('#cfNo').onclick=closeModal;
  $('#cfYes').onclick=()=>{closeModal();cb();};
}

/* ==================== 任务表单 ==================== */
function openTask(id,due,title,presetProj){
  const ed=id?DB.tasks.find(t=>t.id===id):null;
  const t=ed||{title:'',pri:'P1',due:due||TODAY(),remind:'',lead:'15m',repeat:'none',repEnd:'never',repUntil:'',repTotal:10,repIdx:1,projectId:presetProj||null,note:''};
  const priOpts=Object.entries(PRI).map(([k,v])=>`<option value="${k}" ${t.pri===k?'selected':''}>${v.t}</option>`).join('');
  const repOpts=Object.entries(REPEAT).map(([k,v])=>`<option value="${k}" ${(t.repeat||'none')===k?'selected':''}>${v}</option>`).join('');
  const endOpts=[['never','一直重复'],['until','到某天为止'],['count','限定重复次数']]
    .map(([k,v])=>`<option value="${k}" ${(t.repEnd||'never')===k?'selected':''}>${v}</option>`).join('');
  const projVal=t.projectId||presetProj||'';
  const projOpts=`<option value="">不挂靠项目</option>`+DB.projects.filter(p=>p.status!=='done')
    .map(p=>`<option value="${p.id}" ${projVal===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  const leadVal=ed?(t.lead||''):'15m';
  const leadOpts=LEAD_OPTS.map(([k,v])=>`<option value="${k}" ${leadVal===k?'selected':''}>${v}</option>`).join('');
  const body=`<div class="fld"><label>任务内容</label><textarea class="inp" id="fTTitle" placeholder="要做什么？">${esc(t.title||title||'')}</textarea></div>
    <div class="fld"><label>轻重缓急</label><select class="inp" id="fTPri">${priOpts}</select></div>
    <div class="grid2">
      <div class="fld"><label>截止日期</label><input class="inp" type="date" id="fTDue" value="${t.due||''}"></div>
      <div class="fld"><label>提醒时间</label><input class="inp" type="time" id="fTRemind" value="${t.remind||''}"></div>
    </div>
    <div class="grid2">
      <div class="fld"><label>提前提醒</label><select class="inp" id="fTLead">${leadOpts}</select></div>
      <div class="fld" style="justify-content:flex-end;display:flex;align-items:flex-end"><span style="font-size:12px;color:var(--tx2)">默认提前 15 分钟</span></div>
    </div>
    <div class="grid2">
      <div class="fld"><label>重复</label><select class="inp" id="fTRepeat">${repOpts}</select></div>
      <div class="fld"><label>关联项目</label><select class="inp" id="fTProj">${projOpts}</select></div>
    </div>
    <div class="fld" id="fRepBox" style="display:none">
      <label>重复到什么时候</label>
      <div class="grid2">
        <select class="inp" id="fTRepEnd">${endOpts}</select>
        <div>
          <input class="inp" type="date" id="fTRepUntil" value="${t.repUntil||''}" style="width:100%;display:none">
          <input class="inp" type="number" inputmode="numeric" min="1" max="999" id="fTRepTotal" value="${t.repTotal||10}" style="width:100%;display:none" placeholder="共几次">
        </div>
      </div>
      <div id="fRepHint" style="font-size:12.5px;color:var(--tx2);line-height:1.6;margin-top:7px"></div>
    </div>
    <div class="fld"><label>备注</label><input class="inp" id="fTNote" value="${esc(t.note||'')}" placeholder="可选"></div>`;
  openModal(id?'编辑任务':'新建任务',body,
    `<button class="btn" id="tCancel">取消</button><button class="btn pri" id="tSave"><svg class="ic sm"><use href="#i-check-sq"/></svg>保存</button>`);
  $('#tCancel').onclick=closeModal;

  const idxNow=ed?(ed.repIdx||1):1;
  function syncRep(){
    const r=$('#fTRepeat').value,e=$('#fTRepEnd').value,d=$('#fTDue').value;
    $('#fRepBox').style.display=r==='none'?'none':'';
    if(r==='none')return;
    $('#fTRepUntil').style.display=e==='until'?'':'none';
    $('#fTRepTotal').style.display=e==='count'?'':'none';
    const unit=(REP_DEF[r]||{}).unit||'次';
    const pre=idxNow>1?`这条已经进行到第 ${idxNow} 次。`:'';
    let h='';
    if(e==='never')h=pre+`每${unit}一次，做完自动排下一次，不设终点。`;
    else if(e==='until'){
      const u=$('#fTRepUntil').value;
      if(!u||!d)h=pre+'选一个截止日期，过了这天就不再自动生成。';
      else if(u<d)h='<span style="color:var(--red)">截止日期不能早于第一次的截止日期。</span>';
      else{let n=0,cur=d;while(cur<=u&&n<2000){n++;cur=repAdd(r,cur,1);}
        h=pre+`从 ${humanDate(d)} 起每${unit}一次，到 ${md(u)} 为止，还会出现 <b>${n}</b> 次。`;}
    }else{
      const n=parseInt($('#fTRepTotal').value)||0;
      if(n<idxNow)h=`<span style="color:var(--red)">次数不能小于已进行的 ${idxNow} 次。</span>`;
      else{const last=d?repDateAt({repeat:r,due:d,repIdx:idxNow},n):'';
        h=pre+`总共 ${n} 次，还剩 <b>${n-idxNow+1}</b> 次`+(last?`，最后一次落在 <b>${md(last)}</b>。`:'。');}
    }
    $('#fRepHint').innerHTML=h;
  }
  ['fTRepeat','fTRepEnd','fTRepUntil','fTRepTotal','fTDue'].forEach(k=>{
    const el=$('#'+k);el.addEventListener('change',syncRep);el.addEventListener('input',syncRep);});
  syncRep();

  $('#tSave').onclick=()=>{
    const rep=$('#fTRepeat').value,rEnd=rep==='none'?'never':$('#fTRepEnd').value;
    const v={title:$('#fTTitle').value.trim(),pri:$('#fTPri').value,due:$('#fTDue').value||'',
      remind:$('#fTRemind').value||'',lead:$('#fTLead').value||'',repeat:rep,repEnd:rEnd,
      repUntil:rEnd==='until'?($('#fTRepUntil').value||''):'',
      repTotal:rEnd==='count'?Math.max(1,parseInt($('#fTRepTotal').value)||1):null,
      repIdx:idxNow,projectId:$('#fTProj').value||null,note:$('#fTNote').value.trim()};
    if(!v.title){toast('先写点任务内容','err');return;}
    if(rep!=='none'&&!v.due){toast('周期任务得有个开始的截止日期','err');return;}
    if(rEnd==='until'){
      if(!v.repUntil){toast('选一下重复的截止日期','err');return;}
      if(v.repUntil<v.due){toast('重复截止日不能早于首次截止日','err');return;}
    }
    if(rEnd==='count'&&v.repTotal<idxNow){toast(`次数不能小于已进行的 ${idxNow} 次`,'err');return;}
    if(ed){Object.assign(ed,v);}
    else{DB.tasks.push(Object.assign({id:uid(),done:false,doneAt:null,createdAt:TODAY(),overdue:false,rollCount:0,origDue:null},v));}
    save();closeModal();renderAll();toast('已保存','ok');
  };
  setTimeout(()=>{$('#fTTitle').focus();},50);
}

/* ==================== 灵感表单 ==================== */
function openNote(id){
  const ed=id?DB.notes.find(n=>n.id===id):null;
  const t=ed||{content:'',tags:[]};
  const body=`<div class="fld"><label>想法</label><textarea class="inp" id="fNContent" placeholder="随手记下来…">${esc(t.content||'')}</textarea></div>
    <div class="fld"><label>标签（逗号或空格分隔）</label><input class="inp" id="fNTags" value="${esc((t.tags||[]).join(', '))}" placeholder="汇报, 表达"></div>`;
  openModal(id?'编辑灵感':'记一条灵感',body,
    `<button class="btn" id="nCancel">取消</button><button class="btn pri" id="nSave"><svg class="ic sm"><use href="#i-check-sq"/></svg>保存</button>`);
  $('#nCancel').onclick=closeModal;
  $('#nSave').onclick=()=>{
    const content=$('#fNContent').value.trim();if(!content){toast('写点什么吧','err');return;}
    const tags=$('#fNTags').value.split(/[,，\s]+/).map(s=>s.trim()).filter(Boolean);
    if(ed){ed.content=content;ed.tags=tags;ed.updatedAt=fmtNow();}
    else{DB.notes.push({id:uid(),content,tags,createdAt:fmtNow(),updatedAt:''});}
    save();closeModal();renderAll();toast('已保存','ok');
  };
  setTimeout(()=>{$('#fNContent').focus();},50);
}

/* ==================== 项目表单 ==================== */
function openProj(id){
  const ed=id?DB.projects.find(p=>p.id===id):null;
  const t=ed||{name:'',stage:'',next:'',blocker:'',status:'active'};
  const stOpts=Object.entries(PSTAT).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('');
  const body=`<div class="fld"><label>项目名</label><input class="inp" id="fPName" value="${esc(t.name||'')}" placeholder="例如：Q3 客户续约"></div>
    <div class="fld"><label>现在到哪一步</label><textarea class="inp" id="fPStage">${esc(t.stage||'')}</textarea></div>
    <div class="fld"><label>下一步做什么</label><textarea class="inp" id="fPNext">${esc(t.next||'')}</textarea></div>
    <div class="fld"><label>卡在哪儿（没有可留空）</label><input class="inp" id="fPBlock" value="${esc(t.blocker||'')}" placeholder="例如：等法务确认"></div>
    <div class="fld"><label>状态</label><select class="inp" id="fPStat">${stOpts}</select></div>`;
  openModal(id?'编辑项目':'新建项目',body,
    `<button class="btn" id="pCancel">取消</button><button class="btn pri" id="pSave"><svg class="ic sm"><use href="#i-check-sq"/></svg>保存</button>`);
  $('#pCancel').onclick=closeModal;
  $('#pSave').onclick=()=>{
    const name=$('#fPName').value.trim();if(!name){toast('给项目起个名','err');return;}
    const v={name,stage:$('#fPStage').value.trim(),next:$('#fPNext').value.trim(),blocker:$('#fPBlock').value.trim(),status:$('#fPStat').value};
    if(ed){Object.assign(ed,v);ed.updatedAt=TODAY();}
    else{DB.projects.push(Object.assign({id:uid(),createdAt:TODAY(),updatedAt:TODAY()},v));}
    save();closeModal();renderAll();toast('已保存','ok');
  };
  setTimeout(()=>{$('#fPName').focus();},50);
}

/* ==================== 久坐提醒 ==================== */
let sedTimer=null;
function initSed(){
  const s=DB.settings;
  if(s.sedDay!==TODAY()){s.sedDay=TODAY();s.sedCount=0;s.sedDone=0;s.sedStart=Date.now();save();}
  else if(!s.sedStart||s.sedStart<=0)s.sedStart=Date.now();
}
/* 选择自定义提醒音乐文件 */
async function pickSedMusic(){
  try{
    let dataUrl='',name='';
    if(FileIO.webview){
      const r=await FileIO.rpc({action:'pickMusic'});
      if(!r.ok||!r.text)return;
      dataUrl=r.text;name=r.name||'';
    }else{
      const inp=document.createElement('input');inp.type='file';inp.accept='audio/*';
      const f=await new Promise(resolve=>{inp.onchange=()=>resolve(inp.files[0]);inp.click();});
      if(!f)return;
      name=f.name;
      if(f.size>3*1024*1024){toast('音乐文件超过 3MB，可能影响存储。建议使用短音频。','err');}
      const buf=await f.arrayBuffer();
      const b64=btoaBytes(buf);
      const mime=f.type||'audio/mpeg';
      dataUrl='data:'+mime+';base64,'+b64;
    }
    DB.settings.sedMusic=dataUrl;DB.settings.sedMusicName=name;_musicBuffer=null;_musicDataUrl='';save();renderSetting();
    toast('已设置提醒音乐：'+name,'ok');
  }catch(e){toast('选择音乐文件失败','err');}
}
function startSedTimer(){if(sedTimer)clearInterval(sedTimer);sedTimer=setInterval(tickSed,1000);}
function tickSed(){
  const s=DB.settings;if(!s.sedEnabled)return;
  const end=s.sedStart+s.sedMin*60000,now=Date.now();
  if(now>=end){fireRest();return;}
  updateSedRing();
}
function updateSedRing(){
  const s=DB.settings;
  const end=s.sedStart+s.sedMin*60000,rem=Math.max(0,end-Date.now());
  const rs=Math.ceil(rem/1000),mm=String(Math.floor(rs/60)).padStart(2,'0'),ss=String(rs%60).padStart(2,'0');
  const pct=s.sedEnabled?Math.min(100,(Date.now()-s.sedStart)/(s.sedMin*60000)*100):0;
  const el=$('#sedRing');if(el)el.innerHTML=ringSvg(pct,mm+':'+ss,'后提醒',s.sedEnabled?'#0e9b8e':'#cfdedb');
}
function fireRest(){
  const s=DB.settings;s.sedCount=(s.sedCount||0)+1;s.sedStart=Date.now();save();updateSedRing();
  if(s.sedSound)playAlert();
  const rest=s.sedRest||5;
  const el=document.createElement('div');el.className='rest';el.id='restLayer';
  el.innerHTML=`<div>
    <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3.5 8.5h13.5v6a5 5 0 0 1-5 5h-3.5a5 5 0 0 1-5-5z"/><path d="M17 9.8h2.2a2.4 2.4 0 0 1 0 4.8H17M6.5 2v3M10 2v3M13.5 2v3"/></svg>
    <h2>该起身活动一下啦</h2>
    <p>已经连续坐了 ${s.sedMin} 分钟。起来走走、看看远方，放松 ${rest} 分钟再回来，效率更高。</p>
    <button id="restDone">休息 ${rest} 分钟，我回来了</button></div>`;
  document.body.appendChild(el);
  const close=()=>{s.sedDone=(s.sedDone||0)+1;save();updateSedRing();el.remove();};
  el.querySelector('#restDone').onclick=close;
  setTimeout(()=>{if(document.getElementById('restLayer'))close();},rest*60000);
}
/* 播放提示音：优先用自定义音乐文件，否则用内置合成旋律 */
function playAlert(){
  const music=DB.settings.sedMusic;
  if(music){playMusicData(music);return;}
  beep();
}
/* 播放 base64 音乐数据（通过 AudioContext 解码播放） */
let _musicBuffer=null,_musicDataUrl='';
function playMusicData(dataUrl){
  try{
    const ac=new (window.AudioContext||window.webkitAudioContext)();
    if(dataUrl===_musicDataUrl&&_musicBuffer){
      const src=ac.createBufferSource();src.buffer=_musicBuffer;src.connect(ac.destination);src.start(0);return;
    }
    _musicDataUrl=dataUrl;
    const bin=atob(dataUrl.split(',')[1]||dataUrl);
    const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    ac.decodeAudioData(u8.buffer,(buf)=>{
      _musicBuffer=buf;const src=ac.createBufferSource();src.buffer=buf;src.connect(ac.destination);src.start(0);
    },()=>{beep();});
  }catch(e){beep();}
}
function beep(){try{const ac=new (window.AudioContext||window.webkitAudioContext)();
  const now=ac.currentTime;
  // 轻音乐旋律：五声音阶上行→下行，模拟八音盒效果
  const notes=[
    {f:523.25,t:0,d:0.32}, // C5
    {f:587.33,t:0.30,d:0.30}, // D5
    {f:659.25,t:0.58,d:0.30}, // E5
    {f:783.99,t:0.86,d:0.34}, // G5
    {f:880.00,t:1.18,d:0.34}, // A5
    {f:783.99,t:1.50,d:0.32}, // G5
    {f:659.25,t:1.80,d:0.30}, // E5
    {f:587.33,t:2.08,d:0.28}, // D5
    {f:523.25,t:2.34,d:0.40}, // C5（尾音渐弱收束）
  ];
  notes.forEach(n=>{
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type='sine';
    o.frequency.value=n.f;
    const t=now+n.t;
    g.gain.setValueAtTime(0.001,t);
    g.gain.exponentialRampToValueAtTime(0.22,t+0.04);
    g.gain.setValueAtTime(0.22,t+n.d*0.5);
    g.gain.exponentialRampToValueAtTime(0.001,t+n.d);
    o.start(t);o.stop(t+n.d);
  });
}catch(e){}}

/* ==================== 待办到点提醒（弹框 + 声音） ==================== */
let taskRemindTimer=null;
const _remindDone=new Set(),_snooze=new Map();   // 本会话内同一提醒时刻只弹一次；snooze 为「稍后提醒」的临时推迟
function startTaskRemindTimer(){if(taskRemindTimer)clearInterval(taskRemindTimer);taskRemindTimer=setInterval(checkTaskReminds,15000);}
function checkTaskReminds(){
  if(document.getElementById('taskAlert'))return;               // 已有提醒弹层，处理完再提醒下一批
  const now=new Date(),nowMs=now.getTime(),due=[];
  DB.tasks.forEach(t=>{
    if(t.done)return;
    const sn=_snooze.get(t.id);if(sn&&sn>nowMs)return;
    if(!t.remind)return;                                         // 只在任务设置了「提醒时间」时提醒
    const m=remindMoment(t);if(!m)return;
    const key=t.id+'@'+ymd(m)+' '+pad(m.getHours())+':'+pad(m.getMinutes());
    if(_remindDone.has(key))return;
    const diff=nowMs-m.getTime();
    if(diff>=-60000&&diff<=30*60000){                            // 提醒时刻起 30 分钟内触发（覆盖睡眠/离线）
      _remindDone.add(key);
      due.push({t});
    }
  });
  if(!due.length)return;
  if(DB.settings.taskSound!==false)playAlert();
  showTaskAlert(due);
}
function showTaskAlert(due){
  const el=document.createElement('div');el.className='rest task-alert';el.id='taskAlert';
  const rows=due.slice(0,4).map(x=>{const t=x.t,p=projOf(t.projectId);
    return `<div class="tali"><div class="tali-t">${esc(t.title)}</div>
      <div class="tali-s">${t.due?humanDate(t.due):''}${t.remind?' · '+esc(t.remind):''}${p?' · '+esc(p.name):''}</div></div>`;}).join('');
  el.innerHTML=`<div>
    <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>
    <h2>待办提醒</h2>
    <p>下面这些事该处理了：</p>
    <div class="talist">${rows}</div>
    ${due.length>4?`<p style="font-size:12px;opacity:.7">还有 ${due.length-4} 条，点「打开待办」查看</p>`:''}
    <div class="tbtn">
      <button class="btn" id="talSnooze">稍后 10 分钟</button>
      <button class="btn" id="talGo">打开待办</button>
      <button class="btn" id="talOk">知道了</button>
    </div></div>`;
  document.body.appendChild(el);
  const ids=due.map(x=>x.t.id);
  $('#talSnooze').onclick=()=>{ids.forEach(id=>_snooze.set(id,Date.now()+10*60000));el.remove();};
  $('#talOk').onclick=()=>{el.remove();};
  $('#talGo').onclick=()=>{el.remove();go('todo');};
}

/* ==================== 导出 / 导入 ==================== */
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}

function repEndText(t){
  if((t.repeat||'none')==='none')return '';
  if(t.repEnd==='until')return t.repUntil?'至 '+t.repUntil:'一直重复';
  if(t.repEnd==='count')return '共 '+(t.repTotal||1)+' 次';
  return '一直重复';
}
function taskRows(){return [['标题','轻重缓急','截止日期','提醒时间','提前提醒','重复','重复结束','重复进度','关联项目','备注','状态','完成日期','顺延次数','创建日期']]
  .concat(DB.tasks.map(t=>[t.title,(PRI[t.pri]||PRI.P2).t,t.due||'',t.remind||'',leadLabel(t.lead),REPEAT[t.repeat||'none']||'不重复',
    repEndText(t),(t.repeat&&t.repeat!=='none'&&t.repEnd==='count')?'第 '+(t.repIdx||1)+' 次':'',
    (projOf(t.projectId)||{}).name||'',t.note||'',t.done?'已完成':'未完成',t.doneAt||'',t.rollCount||0,t.createdAt||'']));}
function noteRows(){return [['内容','标签','创建时间']].concat(DB.notes.map(n=>[n.content,(n.tags||[]).join('、'),n.createdAt||'']));}
function projRows(){return [['项目名','现在到哪一步','下一步','卡点','状态','创建','更新']]
  .concat(DB.projects.map(p=>[p.name,p.stage||'',p.next||'',p.blocker||'',PSTAT[p.status]||'进行中',p.createdAt||'',p.updatedAt||'']));}
function settingRows(){
  const s=DB.settings;
  // xlsx 的 JSON 备份行排除音乐数据（base64 太长会超出单元格字符限制）
  const dbSnap=JSON.parse(JSON.stringify(DB));if(dbSnap.settings)dbSnap.settings.sedMusic='';
  return [['配置项','值'],
    ['久坐提醒间隔(分钟)',s.sedMin],['休息时长(分钟)',s.sedRest],['久坐提醒开关',s.sedEnabled?'开':'关'],
    ['提示音',s.sedSound?'开':'关'],['自定义音乐文件',s.sedMusicName||'未设置'],
    ['上次导出',DB.meta.lastExport||'从未'],['示例数据标记',DB.meta.sample?'是':'否'],['导出时记录数',DB.meta.lastExportCount||0],
    ['完整数据(JSON,请勿手动修改)',JSON.stringify(dbSnap)]];
}

/* --- 纯手写 xlsx（ZIP STORE + CRC32，零依赖） --- */
let CRC_TB=null;
function crc32(bytes){
  if(!CRC_TB){const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}CRC_TB=t;}
  let crc=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)crc=CRC_TB[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function concatU(arrs){let len=0;arrs.forEach(a=>len+=a.length);const out=new Uint8Array(len);let o=0;arrs.forEach(a=>{out.set(a,o);o+=a.length;});return out;}
function colLetter(j){let s='';j++;while(j>0){let r=j%26;if(r===0){r=26;j--;}s=String.fromCharCode(64+r)+s;j=Math.floor(j/26);}return s;}
function xmlEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sheetXml(rows){
  let r='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row,i)=>{const ri=i+1;r+=`<row r="${ri}">`;
    row.forEach((cell,j)=>{const ref=colLetter(j)+ri;
      if(cell==null){r+=`<c r="${ref}"/>`;return;}
      if(typeof cell==='number'){r+=`<c r="${ref}"><v>${cell}</v></c>`;}
      else if(typeof cell==='boolean'){r+=`<c r="${ref}" t="b"><v>${cell?1:0}</v></c>`;}
      else{r+=`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell)}</t></is></c>`;}});
    r+='</row>';});
  return r+'</sheetData></worksheet>';
}
function zipStore(files){
  const chunks=[],central=[];let offset=0;
  const enc=new TextEncoder();
  files.forEach(f=>{
    const name=enc.encode(f.name),data=f.data,crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);
    lh.setUint16(8,0,true);lh.setUint16(10,0,true);lh.setUint16(12,0,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);
    lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer),name,data);
    const cd=new DataView(new ArrayBuffer(46));
    cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);
    cd.setUint16(8,0x0800,true);cd.setUint16(10,0,true);cd.setUint16(12,0,true);cd.setUint16(14,0,true);
    cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);
    cd.setUint16(28,name.length,true);cd.setUint16(30,0,true);cd.setUint16(32,0,true);
    cd.setUint16(34,0,true);cd.setUint16(36,0,true);cd.setUint32(38,0,true);cd.setUint32(42,offset,true);
    central.push(new Uint8Array(cd.buffer),name);
    offset+=30+name.length+data.length;
  });
  const cdBytes=concatU(central);
  const eo=new DataView(new ArrayBuffer(22));
  eo.setUint32(0,0x06054b50,true);eo.setUint16(4,0,true);eo.setUint16(6,0,true);
  eo.setUint16(8,files.length,true);eo.setUint16(10,files.length,true);
  eo.setUint32(12,cdBytes.length,true);eo.setUint32(16,offset,true);eo.setUint16(20,0,true);
  return concatU([...chunks,cdBytes,new Uint8Array(eo.buffer)]);
}
function cfgRows(){
  const s=DB.settings,m=DB.meta;
  return [['配置项','值'],
    ['久坐提醒间隔(分钟)',s.sedMin],['休息时长(分钟)',s.sedRest],['久坐提醒开关',s.sedEnabled?'开':'关'],
    ['提示音',s.sedSound?'开':'关'],['自定义音乐文件',s.sedMusicName||'未设置'],['上次导出',m.lastExport||'从未'],['示例数据标记',m.sample?'是':'否'],['导出时记录数',m.lastExportCount||0]];
}
/* 通用工作簿构建：sheets=[['表名',行数组],...]，返回 Uint8Array（xlsx 二进制） */
function buildWorkbookBytes(sheets){
  const enc=new TextEncoder();
  const sheetEntries=sheets.map((s,i)=>`<sheet name="${xmlEsc(s[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  const ctOverrides=sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${ctOverrides}
</Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const wb=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetEntries}</sheets></workbook>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}
</Relationships>`;
  const files=[
    {name:'[Content_Types].xml',data:enc.encode(ct)},
    {name:'_rels/.rels',data:enc.encode(rels)},
    {name:'xl/workbook.xml',data:enc.encode(wb)},
    {name:'xl/_rels/workbook.xml.rels',data:enc.encode(wbRels)},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:enc.encode(sheetXml(s[1]))}))
  ];
  return zipStore(files);
}
function exportXlsx(){
  const sheets=[['待办',taskRows()],['灵感',noteRows()],['项目',projRows()],['设置',settingRows()]];
  const zip=buildWorkbookBytes(sheets);
  download(new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
    '办公工作台备份_'+TODAY()+'.xlsx');
  DB.meta.lastExport=fmtTime();DB.meta.lastExportCount=totalCount();save();
  toast('已导出 Excel 备份','ok');renderBanner();renderSetting();
}
function exportJson(){
  download(new Blob([JSON.stringify(DB,null,2)],{type:'application/json'}),'办公工作台_'+TODAY()+'.json');
  DB.meta.lastExport=fmtTime();DB.meta.lastExportCount=totalCount();save();
  toast('已导出 JSON 备份','ok');renderBanner();renderSetting();
}

/* --- xlsx 读取 --- */
function xmlText(u){return u?new TextDecoder('utf-8').decode(u):'';}
function xmlUnesc(s){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');}
/* 解析单个单元格值；ss 为共享字符串索引表（Excel 把文本写成 t="s" + 索引） */
function cellValue(inner,type,ss){
  if(type==='inlineStr'){const t=/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);return t?xmlUnesc(t[1]):'';}
  if(type==='s'){const v=/<v>([\s\S]*?)<\/v>/.exec(inner);return v?(ss[+v[1]]||''):'';}
  if(type==='str'){const v=/<v>([\s\S]*?)<\/v>/.exec(inner);return v?xmlUnesc(v[1]):'';}
  /* n / b / e 等都按 <v> 读取；布尔转 true/false */
  const v=/<v>([\s\S]*?)<\/v>/.exec(inner);
  if(!v)return '';
  if(type==='b')return v[1]==='1'||v[1]==='true';
  return v[1];
}
function extractCells(xml,ss){
  const cells=[];const re=/<c\b[^>]*>([\s\S]*?)<\/c>/g;let m;
  while(m=re.exec(xml)){const inner=m[1];const tm=/t="([^"]+)"/.exec(m[0]);const type=tm?tm[1]:'n';
    cells.push(cellValue(inner,type,ss||[]));}
  return cells;
}
function extractRows(xml,ss){
  const rows=[];const reRow=/<row\b[^>]*>([\s\S]*?)<\/row>/g;let rm;
  while(rm=reRow.exec(xml))rows.push(extractCells(rm[1],ss));
  return rows;
}
/* 读取共享字符串表（索引 -> 文本），Excel 默认用此方式存文本 */
function readSharedStrings(zip){
  const out=[];const xml=xmlText(zip['xl/sharedStrings.xml']||'');
  if(!xml)return out;
  const reSI=/<si>([\s\S]*?)<\/si>/g;let m;
  while(m=reSI.exec(xml)){
    let txt='';const reT=/<t[^>]*>([\s\S]*?)<\/t>/g;let tm;
    while(tm=reT.exec(m[1]))txt+=xmlUnesc(tm[1]);
    out.push(txt);
  }
  return out;
}
async function readZip(u8){
  const buf=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);
  const dv=new DataView(buf);let eo=-1;
  for(let i=buf.byteLength-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw '不是有效的 xlsx 文件';
  const cnt=dv.getUint16(eo+10,true),cdOff=dv.getUint32(eo+16,true);const out={};
  let p=cdOff;
  for(let n=0;n<cnt;n++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const method=dv.getUint16(p+10,true),cSize=dv.getUint32(p+20,true),fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true);
    const fname=xmlText(new Uint8Array(buf.slice(p+46,p+46+fnLen)));
    const lo=dv.getUint32(p+42,true),lh=new DataView(buf,lo);
    const lfn=lh.getUint16(26,true),lext=lh.getUint16(28,true),ds=lo+30+lfn+lext;
    let data=new Uint8Array(buf.slice(ds,ds+cSize));
    if(method===8){try{const rs=new Response(data).body.pipeThrough(new DecompressionStream('deflate-raw'));const ab=await new Response(rs).arrayBuffer();data=new Uint8Array(ab);}catch(e){throw '该 xlsx 已压缩，当前环境无法解压';}}
    out[fname]=data;p+=46+fnLen+exLen+cmLen;
  }
  return out;
}
async function parseWorkbook(u8){
  const zip=await readZip(u8 instanceof Uint8Array?u8:new Uint8Array(u8));
  const ss=readSharedStrings(zip);
  const wb=xmlText(zip['xl/workbook.xml']||''),rels=xmlText(zip['xl/_rels/workbook.xml.rels']||'');
  const ridMap={};let m;const reRel=/Id="([^"]+)"[^>]*Target="([^"]+)"/g;while(m=reRel.exec(rels))ridMap[m[1]]=m[2];
  const sheets=[];const reSh=/name="([^"]+)"[^>]*r:id="([^"]+)"/g;while(m=reSh.exec(wb))sheets.push({name:m[1],file:'xl/'+(ridMap[m[2]]||'')});
  let jsonObj=null;
  for(const sh of sheets){const cells=extractCells(xmlText(zip[sh.file]||''),ss);
    for(const c of cells){if(typeof c==='string'&&c.length>20){try{const o=JSON.parse(c);if(o&&o.tasks&&o.notes!==undefined){jsonObj=o;}}catch(e){}}}}
  let ts=[],ns=[],ps=[],cfg=[];
  for(const sh of sheets){const rows=extractRows(xmlText(zip[sh.file]||''),ss);
    if(/待办/.test(sh.name)&&rows.length>1)ts=rows;
    else if(/灵感/.test(sh.name)&&rows.length>1)ns=rows;
    else if(/项目/.test(sh.name)&&rows.length>1)ps=rows;
    else if(/配置/.test(sh.name)&&rows.length>1)cfg=rows;}
  return {jsonObj,ts,ns,ps,cfg};
}
async function importXlsx(file){
  const buf=await file.arrayBuffer();
  const {jsonObj,ts,ns,ps}=await parseWorkbook(new Uint8Array(buf));
  if(jsonObj){applyData(jsonObj,'Excel');return;}
  if(ts.length||ns.length||ps.length){applyStructured(ts,ns,ps);return;}
  throw '文件中没找到可识别的数据';
}
/* 把配置表的「配置项/值」写回 settings 与 meta */
function applyConfigSheet(cfg){
  const idxK=cfg[0].indexOf('配置项'),idxV=cfg[0].indexOf('值');
  if(idxK<0||idxV<0)return;
  for(let i=1;i<cfg.length;i++){const r=cfg[i];const k=String(r[idxK]||'').trim();const v=String(r[idxV]??'').trim();
    if(!k||k==='完整数据(JSON,请勿手动修改)')continue;
    if(k==='久坐提醒开关')DB.settings.sedEnabled=v==='开';
    else if(k==='提示音')DB.settings.sedSound=v==='开';
    else if(k==='自定义音乐文件'){/* xlsx 不包含音乐数据本体，仅记录文件名；数据从 JSON 恢复 */DB.settings.sedMusicName=v==='未设置'?'':v;}
    else if(k==='久坐提醒间隔(分钟)')DB.settings.sedMin=+v||45;
    else if(k==='休息时长(分钟)')DB.settings.sedRest=+v||5;
    else if(k==='上次导出')DB.meta.lastExport=v||'从未';
    else if(k==='示例数据标记')DB.meta.sample=v==='是';
    else if(k==='导出时记录数')DB.meta.lastExportCount=+v||0;
  }
}
function applyStructured(ts,ns,ps){
  const head=t=>t.map(x=>String(x).trim());
  const mapRows=(rows,keys,fn)=>{if(!rows||rows.length<2)return [];const hs=head(rows[0]);const idx=k=>hs.indexOf(k);
    return rows.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>{const o={};keys.forEach(k=>o[k]=idx(k)>=0?r[idx(k)]:'');return fn(o);});};
  const REP_R={'不重复':'none'};
  Object.keys(REP_DEF).forEach(k=>{REP_R[REP_DEF[k].label]=k;REP_R[k]=k;});
  const LEAD_R={'不提醒':'','':''};
  Object.keys(LEAD_DEF).forEach(k=>{LEAD_R[LEAD_DEF[k].label]=k;});
  const parseRepEnd=s=>{s=String(s||'').trim();
    if(/^至/.test(s))return{repEnd:'until',repUntil:s.replace(/^至\s*/,''),repTotal:null};
    const m=s.match(/(\d+)\s*次/);
    if(m)return{repEnd:'count',repUntil:'',repTotal:Math.max(1,parseInt(m[1]))};
    return{repEnd:'never',repUntil:'',repTotal:null};};
  /* —— 先建项目、再建任务：任务必须引用「本次载入的项目 ID」，否则重载后关联关系会丢失 ——
     项目名→ID 映射：同名项目复用现有 ID（重载幂等），新名字分配新 ID。 */
  const ST_MAP={'进行中':'active','卡住了':'blocked','已完成':'done'};
  const projByName={};DB.projects.forEach(p=>{if(p.name&&!projByName[p.name])projByName[p.name]=p.id;});
  const newProj=mapRows(ps,['项目名','现在到哪一步','下一步','卡点','状态'],o=>{
    const nm=String(o['项目名']||'').trim();
    const id=nm&&projByName[nm]?projByName[nm]:uid();
    if(nm&&!projByName[nm])projByName[nm]=id;
    return{id,name:nm,stage:o['现在到哪一步']||'',next:o['下一步']||'',blocker:o['卡点']||'',status:ST_MAP[o['状态']]||'active',createdAt:o['创建']||TODAY(),updatedAt:o['更新']||TODAY()};
  });
  const newTasks=mapRows(ts,['标题','轻重缓急','截止日期','提醒时间','提前提醒','重复','重复结束','重复进度','关联项目','备注','状态','创建日期'],o=>{
    const rep=REP_R[String(o['重复']||'').trim()]||'none';
    const re=rep==='none'?{repEnd:'never',repUntil:'',repTotal:null}:parseRepEnd(o['重复结束']);
    const im=String(o['重复进度']||'').match(/\d+/);
    return{id:uid(),title:o['标题']||'',pri:(o['轻重缓急']||'').includes('紧急')?'P0':(o['轻重缓急']||'').includes('重要')?'P1':'P2',
    due:o['截止日期']||'',remind:o['提醒时间']||'',lead:LEAD_R[String(o['提前提醒']||'').trim()]||'',repeat:rep,repEnd:re.repEnd,repUntil:re.repUntil,repTotal:re.repTotal,
    repIdx:im?Math.max(1,parseInt(im[0])):1,
    projectId:projByName[String(o['关联项目']||'').trim()]||null,note:o['备注']||'',done:o['状态']==='已完成',doneAt:o['状态']==='已完成'?TODAY():null,
    createdAt:o['创建日期']||TODAY(),overdue:false,rollCount:0,origDue:null};});
  const newNotes=mapRows(ns,['内容','标签','创建时间'],o=>({id:uid(),content:o['内容']||'',tags:(o['标签']||'').split(/[、,，\s]+/).filter(Boolean),createdAt:o['创建时间']||fmtNow(),updatedAt:''}));
  DB=Object.assign({version:1,tasks:[],notes:[],projects:[],settings:DB.settings,meta:{}},DB);
  DB.tasks=newTasks;DB.notes=newNotes;
  /* 文件里带项目表才整体替换；只带待办表时保留现有项目（任务照常挂靠） */
  if(newProj.length)DB.projects=newProj;
  DB.meta=DB.meta||{};DB.meta.sample=false;
  save();renderAll();toast('已从 Excel 恢复 '+totalCount()+' 条数据','ok');
}
function importJsonText(txt){
  try{const o=JSON.parse(txt);if(!o||typeof o!=='object')throw'';applyData(o,'JSON');}catch(e){toast('JSON 解析失败','err');}
}
function applyData(obj,from){
  DB=Object.assign({version:1,tasks:[],notes:[],projects:[],settings:{},meta:{}},obj);
  DB.tasks=DB.tasks||[];DB.notes=DB.notes||[];DB.projects=DB.projects||[];
  DB.settings=Object.assign({sedEnabled:false,sedMin:45,sedRest:5,sedSound:true,sedCount:0,sedDone:0,sedDay:TODAY(),sedStart:0,taskSound:true},DB.settings||{});
  DB.meta=DB.meta||{};DB.meta.sample=false;
  save();renderAll();toast('已从 '+from+' 恢复 '+totalCount()+' 条数据','ok');
}

/* ==================== 事件绑定 ==================== */
function bind(){
  $('#tFilter').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;tFilter=c.dataset.f;$$('#tFilter .chip').forEach(x=>x.classList.toggle('on',x===c));renderTodo();});
  $('#tSearch').oninput=e=>{tQuery=e.target.value.trim();renderTodo();};
  $('#nSearch').oninput=e=>{nQuery=e.target.value.trim();renderNote();};
  $('#calSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;calView=b.dataset.v;renderCal();});
  $('#calPrev').onclick=()=>{calCur=calView==='month'?addMonths(calCur,-1):calView==='week'?addDays(calCur,-7):addDays(calCur,-1);renderCal();};
  $('#calNext').onclick=()=>{calCur=calView==='month'?addMonths(calCur,1):calView==='week'?addDays(calCur,7):addDays(calCur,1);renderCal();};
  $('#calToday').onclick=()=>{calCur=TODAY();calSel=TODAY();renderCal();};
  $('#btnRollAll').onclick=rollAllOverdue;
  $('#btnShowDone').onclick=()=>{showArchived=!showArchived;renderProj();};
  $('#revPrev').onclick=()=>{revWeek=addDays(revWeek,-7);renderReview();};
  $('#revNext').onclick=()=>{revWeek=addDays(revWeek,7);renderReview();};
  $('#revThis').onclick=()=>{revWeek=mondayOf(TODAY());renderReview();};
  $('#revCopy').onclick=async()=>{const txt=reviewText();try{await navigator.clipboard.writeText(txt);toast('复盘文本已复制','ok');}
    catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(_){}ta.remove();toast('复盘文本已复制','ok');}};
  $('#sedSw').onclick=()=>{const s=DB.settings;s.sedEnabled=!s.sedEnabled;s.sedStart=Date.now();s.sedDay=TODAY();save();updateSedRing();renderSetting();};
  $$('#sedPreset .chip').forEach(c=>c.onclick=()=>{const s=DB.settings;s.sedMin=+c.dataset.m;$('#sedMin').value=s.sedMin;s.sedStart=Date.now();save();renderSetting();});
  $('#sedMin').oninput=()=>{const s=DB.settings;let v=Math.max(1,Math.min(600,+$('#sedMin').value||45));s.sedMin=v;$('#sedMin').value=v;s.sedStart=Date.now();save();updateSedRing();};
  $('#sedRest').oninput=()=>{const s=DB.settings;let v=Math.max(1,Math.min(60,+$('#sedRest').value||5));s.sedRest=v;$('#sedRest').value=v;save();};
  $('#sedReset').onclick=()=>{const s=DB.settings;s.sedStart=Date.now();save();updateSedRing();toast('已重新计时');};
  $('#sedTest').onclick=fireRest;
  $('#sedSound').onchange=()=>{DB.settings.sedSound=$('#sedSound').checked;save();};
  $('#taskSound').onchange=()=>{DB.settings.taskSound=$('#taskSound').checked;save();};
  $('#sedPickMusic').onclick=pickSedMusic;
  $('#sedClearMusic').onclick=()=>{DB.settings.sedMusic='';DB.settings.sedMusicName='';_musicBuffer=null;_musicDataUrl='';save();renderSetting();};
  $('#btnExport').onclick=exportXlsx;
  $('#btnExportJson').onclick=exportJson;
  $('#btnImport').onclick=()=>$('#fileIn').click();
  $('#fileIn').onchange=e=>{const f=e.target.files[0];if(!f)return;const isXls=/\.xlsx$/i.test(f.name);
    const rd=new FileReader();rd.onload=()=>{try{if(isXls)importXlsx(f).catch(err=>toast('导入失败：'+err,'err'));else importJsonText(rd.result);}catch(err){toast('导入失败：'+err,'err');}e.target.value='';};
    if(isXls)rd.readAsArrayBuffer(f);else rd.readAsText(f);};
  $('#btnClearSample').onclick=()=>confirmBox('清空示例数据？','会删除所有标记为示例的内容，你自己的数据保留。',()=>{
    DB.tasks=DB.tasks.filter(t=>!t.sample);DB.notes=DB.notes.filter(n=>!n.sample);DB.projects=DB.projects.filter(p=>!p.sample);
    DB.meta.sample=false;save();renderAll();toast('示例已清空','ok');});
  $('#btnClearAll').onclick=()=>confirmBox('清空全部数据？','此操作不可恢复，建议先导出备份。',()=>{
    DB={version:1,tasks:[],notes:[],projects:[],settings:DB.settings,meta:{}};save();renderAll();toast('已全部清空');});
  $('#btnConfig').onclick=openConfigPanel;
  $('#tbMore').onclick=openSheet;
}
function openSheet(){
  const el=document.createElement('div');el.className='sheet';el.id='navSheet';
  el.innerHTML=`<div class="sheet-in"><div class="sheet-grab"></div>
    <button class="nav-item" data-go="review"><svg class="ic"><use href="#i-chart"/></svg>每周复盘</button>
    <button class="nav-item" data-go="setting"><svg class="ic"><use href="#i-set"/></svg>数据与提醒（久坐 / 备份）</button>
    <button class="nav-item" id="sheetCfg"><svg class="ic"><use href="#i-file"/></svg>配置文件数据源</button>
    <button class="nav-item" id="sheetClose"><svg class="ic"><use href="#i-x"/></svg>收起</button></div>`;
  el.addEventListener('click',e=>{if(e.target===el||e.target.id==='sheetClose')el.remove();});
  const sc=$('#sheetCfg');if(sc)sc.onclick=()=>{el.remove();openConfigPanel();};
  document.body.appendChild(el);
}
function closeSheet(){const s=$('#navSheet');if(s)s.remove();}

/* ==================== 启动 ==================== */
/* 渲染与「配置文件」自动加载在 07_file.js 末尾统一引导（保证 FileIO 已就绪） */
load();bind();initSed();startSedTimer();startTaskRemindTimer();
</script>

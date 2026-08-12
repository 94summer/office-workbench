<script>
/* ==================== 页面切换 ==================== */
let PAGE='home';
function go(p){
  PAGE=p;
  $$('.page').forEach(s=>s.classList.toggle('on',s.id==='p-'+p));
  $$('.nav-item[data-go]').forEach(b=>b.classList.toggle('on',b.dataset.go===p));
  $$('#tabbar button[data-go]').forEach(b=>b.classList.toggle('on',b.dataset.go===p));
  window.scrollTo({top:0,behavior:'smooth'});
  closeSheet();
  renderAll();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-go]');if(b){go(b.dataset.go);}
});

/* ==================== 顶部横幅 ==================== */
function renderBanner(){
  const n=totalCount(),m=DB.meta;const box=$('#banners');let h='';
  const since=n-(m.lastExportCount||0);
  if(n>=20&&since>=20&&m.dismissTip!==n){
    h+=`<div class="alert amb"><svg class="ic" style="flex:none;margin-top:2px"><use href="#i-alert"/></svg>
    <div><b>攒到 ${n} 条了，导出一份备份吧</b><br>数据只存在这台设备的浏览器里，清一次缓存就没了。${m.lastExport?'上次导出：'+m.lastExport:'你还从没导出过'}</div>
    <div class="rt"><button class="btn sm pri" id="bnExp"><svg class="ic sm"><use href="#i-dl"/></svg>立即导出</button>
    <button class="btn sm" id="bnDis">稍后</button></div></div>`;
  }
  box.innerHTML=h;
  const a=$('#bnExp'),b=$('#bnDis');
  if(a)a.onclick=exportXlsx;
  if(b)b.onclick=()=>{DB.meta.dismissTip=n;save();renderBanner();};
}

/* ==================== 今日概览 ==================== */
function renderHome(){
  const t=TODAY();
  const overs=DB.tasks.filter(x=>!x.done&&x.overdue&&x.due<=t);
  const todayT=DB.tasks.filter(x=>!x.done&&x.due===t);
  const blocked=DB.projects.filter(p=>p.status==='blocked'||(p.blocker&&p.status!=='done'));
  const nowHM=pad(new Date().getHours())+':'+pad(new Date().getMinutes());
  const dueSoon=todayT.filter(x=>{const m=remindMoment(x);return m&&m.getTime()<=Date.now()&&!overs.includes(x);});

  /* 今天要处理 */
  let h='';
  if(overs.length||blocked.length){
    h+=`<div class="card" style="border-color:#f0c9cc;box-shadow:0 2px 14px rgba(217,45,56,.09)">
      <div class="card-h" style="background:linear-gradient(90deg,var(--red-l),#fff)">
        <svg class="ic lg" style="color:var(--red)"><use href="#i-alert"/></svg>
        <h3 style="color:#8e1b23">今天要处理的</h3>
        <span class="sub">${overs.length} 项逾期任务${blocked.length?' · '+blocked.length+' 个项目卡住':''}</span>
        ${overs.length>1?`<div class="rt"><button class="btn sm dgr" id="hmRollAll"><svg class="ic sm"><use href="#i-rot"/></svg>全部顺延到明天</button></div>`:''}
      </div><div class="card-b tight">`;
    overs.sort((a,b)=>a.pri.localeCompare(b.pri)).forEach(x=>h+=taskRow(x,{over:true}));
    blocked.forEach(p=>{const s=projStat(p.id);
      h+=`<div class="task over"><svg class="ic" style="color:var(--red);margin-top:3px"><use href="#i-layers"/></svg>
        <div class="t-main"><div class="t-title">${esc(p.name)}</div>
        <div class="t-meta"><span class="tag red">卡住</span><span style="font-size:12px;color:var(--red)">${esc(p.blocker||'未填写卡点')}</span></div>
        <div class="t-meta"><span class="tag">下一步：${esc(p.next||'未定')}</span>${s.all?`<span class="tag brd">关联待办 ${s.done}/${s.all}</span>`:''}</div></div>
        <div class="t-act"><button class="iconbtn" onclick="openProj('${p.id}')"><svg class="ic sm"><use href="#i-edit"/></svg></button></div></div>`;});
    h+='</div></div>';
  }else{
    h=`<div class="alert brd"><svg class="ic" style="flex:none;margin-top:2px"><use href="#i-check-sq"/></svg>
      <div><b>没有逾期任务，也没有卡住的项目</b><br>状态不错，按今天的清单推进就行。</div></div>`;
  }
  $('#urgent').innerHTML=h;
  const ra=$('#hmRollAll');if(ra)ra.onclick=rollAllOverdue;

  /* 统计卡 */
  const wk=weekStats(mondayOf(t));
  $('#homeStats').innerHTML=[
    ['今日待办',todayT.length+overs.length,'g','i-check-sq',`已完成 ${DB.tasks.filter(x=>x.done&&x.doneAt===t).length} 件`],
    ['逾期顺延',overs.length,'r','i-rot',overs.length?`最久顺延 ${Math.max(...overs.map(x=>x.rollCount||1))} 次`:'保持住'],
    ['进行中项目',DB.projects.filter(p=>p.status!=='done').length,'b','i-layers',`${blocked.length} 个卡住`],
    ['本周完成',wk.done,'a','i-fire',`完成率 ${wk.pct}%`]
  ].map(([lb,vl,c,ic,ex])=>`<div class="stat ${c}"><div class="lb"><svg class="ic sm"><use href="#${ic}"/></svg>${lb}</div>
    <div class="vl">${vl}</div><div class="ex">${ex}</div></div>`).join('');

  /* 今天要做的 */
  const list=[...overs,...todayT.filter(x=>!overs.includes(x))];
  $('#todayHint').textContent=list.length?`共 ${list.length} 件`:'';
  $('#todayList').innerHTML=list.length?list.map(x=>taskRow(x,{})).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-inbox"/></svg><div>今天没有安排，可以提前做点未来的事</div></div>`;

  /* 趋势 */
  $('#weekTrend').innerHTML=trendChart();

  /* 项目速览 */
  const ps=DB.projects.filter(p=>p.status!=='done').slice(0,4);
  $('#homeProj').innerHTML=ps.length?ps.map(p=>{const s=projStat(p.id);
    return `<div class="hbar"><div class="hbar-t"><span>${p.status==='blocked'?'<span class="pdot p0" style="display:inline-block;margin-right:5px"></span>':''}${esc(p.name)}</span><span>${s.done}/${s.all}</span></div>
    <div class="hbar-b"><i style="width:${s.pct}%;background:${p.status==='blocked'?'linear-gradient(90deg,#d92d38,#f0757d)':'linear-gradient(90deg,var(--brand),#3fc0a8)'}"></i></div>
    <div style="font-size:11.5px;color:var(--tx3);margin-top:4px">下一步：${esc(p.next||'未填')}</div></div>`}).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-layers"/></svg><div>还没有项目</div></div>`;

  /* 灵感 */
  const ns=[...DB.notes].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,3);
  $('#homeNote').innerHTML=ns.length?ns.map(n=>`<div style="padding:9px 0;border-bottom:1px dashed var(--line-s)">
    <div style="font-size:13px;line-height:1.6">${esc(n.content.slice(0,64))}${n.content.length>64?'…':''}</div>
    <div class="note-f" style="margin-top:6px">${(n.tags||[]).map(t=>`<span class="tag brd"><svg class="ic"><use href="#i-tag"/></svg>${esc(t)}</span>`).join('')}<span class="tm">${esc((n.createdAt||'').slice(5))}</span></div></div>`).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-bulb"/></svg><div>随手记点想法吧</div></div>`;

  /* Hero */
  const hh=new Date().getHours();
  $('#heroH').textContent=(hh<6?'夜深了':hh<11?'早上好':hh<14?'中午好':hh<18?'下午好':'晚上好')+
    (overs.length?`，有 ${overs.length} 件逾期的等着你`:'，今天也把要紧事先办了');
  const d=new Date();
  $('#heroP').textContent=`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${WD[d.getDay()]}`+(DB.meta.rolledToday?` · 已自动把 ${DB.meta.rolledToday} 件昨日未完成任务挪到今天`:'');
  $('#navDate').textContent=`${d.getMonth()+1}月${d.getDate()}日 ${WD[d.getDay()]}`;
  $('#hsA').textContent=list.length;$('#hsB').textContent=overs.length;
  $('#hsC').textContent=DB.projects.filter(p=>p.status!=='done').length;$('#hsD').textContent=wk.pct+'%';
  const bh=$('#bd-home');bh.textContent=overs.length;bh.classList.toggle('hide',!overs.length);
  const bt=$('#bd-todo');bt.textContent=list.length;bt.classList.toggle('hide',!list.length);bt.className='badge mut'+(list.length?'':' hide');
  const bp=$('#bd-proj');bp.textContent=blocked.length;bp.classList.toggle('hide',!blocked.length);
  $('#tb-dot').classList.toggle('hide',!overs.length);
  $('#navCount').textContent=totalCount();$('#dataCount').textContent=totalCount();
  $('#lastExp').textContent=DB.meta.lastExport||'从未导出';
}
function rollAllOverdue(){
  const o=DB.tasks.filter(x=>!x.done&&x.overdue&&x.due<=TODAY());
  if(!o.length)return toast('没有逾期任务');
  confirmBox(`把 ${o.length} 件逾期任务顺延到明天？`,'顺延次数会记录下来，方便你复盘哪些事总在拖。',()=>{
    o.forEach(t=>{t.origDue=t.origDue||t.due;t.rollCount=(t.rollCount||0)+1;t.due=addDays(TODAY(),1);t.overdue=true;});
    save();renderAll();toast(`已顺延 ${o.length} 件`,'ok');});
}

/* ==================== 任务行 ==================== */
function taskRow(t,opt={}){
  const p=PRI[t.pri]||PRI.P2,pr=projOf(t.projectId);
  const over=!t.done&&t.due&&t.due<=TODAY()&&t.overdue;
  const isToday=t.due===TODAY();
  return `<div class="task ${over?'over':''} ${t.done?'done':''}">
    <button class="tick ${t.done?'on':''}" onclick="toggleTask('${t.id}')" aria-label="完成"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>
    <div class="t-main">
      <div class="t-title">${esc(t.title)}</div>
      <div class="t-meta">
        <span class="tag ${p.c}"><span class="pdot ${p.k}"></span>${p.t}</span>
        ${t.due?`<span class="tag ${over?'red':isToday?'brd':''}"><svg class="ic"><use href="#i-cal"/></svg>${over&&t.origDue?'原定 '+humanDate(t.origDue):humanDate(t.due)}</span>`:''}
        ${remindTag(t)}
        ${t.rollCount?`<span class="tag red"><svg class="ic"><use href="#i-rot"/></svg>顺延 ${t.rollCount} 次</span>`:''}
        ${(t.repeat&&t.repeat!=='none')?`<span class="tag blu"><svg class="ic"><use href="#i-repeat"/></svg>${REPEAT[t.repeat]}${repLimitText(t)?' · '+repLimitText(t):''}</span>`:''}
        ${(t.repeat&&t.repeat!=='none'&&t.repEnd==='count'&&repRemain(t)<=3)?`<span class="tag amb">周期收官在即，还剩 ${repRemain(t)} 次</span>`:''}
        ${pr?`<span class="tag brd"><svg class="ic"><use href="#i-link"/></svg>${esc(pr.name)}</span>`:''}
        ${t.note?`<span class="tag">${esc(t.note.slice(0,22))}</span>`:''}
      </div>
    </div>
    <div class="t-act">
      ${!t.done&&over?`<button class="iconbtn" title="顺延到明天" onclick="rollTask('${t.id}')"><svg class="ic sm"><use href="#i-rot"/></svg></button>`:''}
      <button class="iconbtn" title="编辑" onclick="openTask('${t.id}')"><svg class="ic sm"><use href="#i-edit"/></svg></button>
      <button class="iconbtn dgr" title="删除" onclick="delTask('${t.id}')"><svg class="ic sm"><use href="#i-trash"/></svg></button>
    </div></div>`;
}

/* ==================== 待办页 ==================== */
let tFilter='all',tQuery='';
function renderTodo(){
  const t=TODAY();let ls=DB.tasks.slice();
  if(tQuery){const q=tQuery.toLowerCase();ls=ls.filter(x=>(x.title+' '+(x.note||'')+' '+((projOf(x.projectId)||{}).name||'')).toLowerCase().includes(q));}
  if(tFilter==='today')ls=ls.filter(x=>!x.done&&x.due===t);
  else if(tFilter==='over')ls=ls.filter(x=>!x.done&&x.overdue&&x.due<=t);
  else if(tFilter==='future')ls=ls.filter(x=>!x.done&&x.due>t);
  else if(tFilter==='done')ls=ls.filter(x=>x.done);
  else if(['P0','P1','P2'].includes(tFilter))ls=ls.filter(x=>x.pri===tFilter&&!x.done);
  else ls=ls.filter(x=>!x.done);

  const g={};
  ls.forEach(x=>{const k=x.done?'已完成':!x.due?'无期限':x.overdue&&x.due<=t?'逾期顺延':x.due===t?'今天':x.due<t?'逾期':x.due;
    (g[k]=g[k]||[]).push(x);});
  const order=['逾期顺延','逾期','今天','无期限'];
  const keys=Object.keys(g).sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(a==='已完成')return 1;if(b==='已完成')return -1;
    if(ia>=0&&ib>=0)return ia-ib;if(ia>=0)return -1;if(ib>=0)return 1;return a.localeCompare(b);});

  $('#todoGroups').innerHTML=keys.length?keys.map(k=>{
    const arr=g[k].sort((a,b)=>{const A=remindMoment(a),B=remindMoment(b);
      if(!A&&!B)return a.pri.localeCompare(b.pri);if(!A)return 1;if(!B)return -1;return A-B;});
    const red=k==='逾期顺延'||k==='逾期';
    const lb=order.includes(k)||k==='已完成'?k:`${k.slice(5).replace('-','月')}日 ${WD[parseD(k).getDay()]} · ${humanDate(k)}`;
    return `<div class="card"><div class="card-h" ${red?'style="background:linear-gradient(90deg,var(--red-l),#fff)"':''}>
      <svg class="ic" style="color:${red?'var(--red)':'var(--brand)'}"><use href="#${red?'i-alert':k==='已完成'?'i-check-sq':'i-cal'}"/></svg>
      <h3 ${red?'style="color:#8e1b23"':''}>${lb}</h3><span class="sub">${arr.length} 件</span></div>
      <div class="card-b tight">${arr.map(x=>taskRow(x,{})).join('')}</div></div>`;}).join('')
    :`<div class="card"><div class="empty"><svg class="ic"><use href="#i-inbox"/></svg><div>这个筛选下没有任务</div></div></div>`;
}

/* ==================== 日历 ==================== */
let calView='month',calCur=TODAY(),calSel=TODAY();
function renderCal(){
  const d=parseD(calCur);
  $$('#calSeg button').forEach(b=>b.classList.toggle('on',b.dataset.v===calView));
  if(calView==='month'){
    $('#calTitle').textContent=`${d.getFullYear()}年${d.getMonth()+1}月`;
    $('#calBody').innerHTML=monthGrid(d);
  }else if(calView==='week'){
    const m=mondayOf(calCur);
    $('#calTitle').textContent=`${parseD(m).getMonth()+1}月${parseD(m).getDate()}日 - ${parseD(addDays(m,6)).getMonth()+1}月${parseD(addDays(m,6)).getDate()}日`;
    $('#calBody').innerHTML=weekGrid(m);
  }else{
    $('#calTitle').textContent=`${d.getMonth()+1}月${d.getDate()}日 ${WD[d.getDay()]}`;
    $('#calBody').innerHTML='';calSel=calCur;
  }
  $$('.mcell[data-d]').forEach(c=>c.onclick=()=>{calSel=c.dataset.d;renderCal();});
  renderCalDay();
}
function monthGrid(d){
  const y=d.getFullYear(),m=d.getMonth();
  const first=new Date(y,m,1),start=new Date(y,m,1-((first.getDay()+6)%7));
  let h='<div class="mgrid">'+['一','二','三','四','五','六','日'].map(w=>`<div class="wd">${w}</div>`).join('');
  for(let i=0;i<42;i++){
    const cd=new Date(start);cd.setDate(start.getDate()+i);const ds=ymd(cd);
    const evs=tasksOn(ds);const out=cd.getMonth()!==m;
    const hasOver=evs.some(e=>!e.t.done&&e.t.overdue&&ds<=TODAY());
    h+=`<div class="mcell ${out?'out':''} ${ds===TODAY()?'today':''} ${ds===calSel?'sel':''}" data-d="${ds}">
      <div class="dnum">${cd.getDate()}${hasOver?'<span class="rd"></span>':''}</div>
      ${evs.slice(0,3).map(e=>`<div class="ev ${PRI[e.t.pri].k} ${e.t.done?'dn':''} ${e.virtual?'rep':''}" title="${esc(e.t.title)}">${esc(e.t.title)}</div>`).join('')}
      ${evs.length>3?`<div class="ev-more">+${evs.length-3}</div>`:''}</div>`;
    if(i>=34&&cd.getMonth()!==m&&(i+1)%7===0)break;
  }
  return h+'</div>';
}
function weekGrid(mon){
  let h='<div class="wgrid">';
  for(let i=0;i<7;i++){
    const ds=addDays(mon,i),cd=parseD(ds),evs=tasksOn(ds);
    h+=`<div class="wcol ${ds===TODAY()?'today':''}"><div class="wcol-h">${WD[cd.getDay()]}<b>${cd.getDate()}</b></div>
      ${evs.length?evs.map(e=>`<div class="ev ${PRI[e.t.pri].k} ${e.t.done?'dn':''} ${e.virtual?'rep':''}" style="margin-bottom:4px;white-space:normal" onclick="openTask('${e.t.id}')">${remindShort(e.t)?remindShort(e.t)+' ':''}${esc(e.t.title)}</div>`).join('')
      :'<div style="font-size:11px;color:var(--tx3);text-align:center;padding:8px 0">空</div>'}</div>`;
  }
  return h+'</div>';
}
function renderCalDay(){
  const ds=calView==='day'?calCur:calSel;const evs=tasksOn(ds);
  $('#calDayTitle').textContent=`${parseD(ds).getMonth()+1}月${parseD(ds).getDate()}日 ${WD[parseD(ds).getDay()]} · ${humanDate(ds)}`;
  $('#calDayList').innerHTML=evs.length?evs.map(e=>e.virtual
    ?`<div class="task"><svg class="ic" style="color:var(--blue);margin-top:3px"><use href="#i-repeat"/></svg>
      <div class="t-main"><div class="t-title" style="color:var(--tx2)">${esc(e.t.title)}</div>
      <div class="t-meta"><span class="tag blu">${REPEAT[e.t.repeat]}重复</span>${remindTag(e.t)}${(()=>{const k=repStep(e.t.repeat,e.t.due,ds);return e.t.repEnd==='count'?`<span class="tag">第 ${(e.t.repIdx||1)+k}/${e.t.repTotal||1} 次</span>`:e.t.repEnd==='until'&&e.t.repUntil?`<span class="tag">重复至 ${md(e.t.repUntil)}</span>`:'<span class="tag">按周期出现</span>';})()}</div></div>
      <div class="t-act"><button class="iconbtn" onclick="openTask('${e.t.id}')"><svg class="ic sm"><use href="#i-edit"/></svg></button></div></div>`
    :taskRow(e.t,{})).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-cal"/></svg><div>这天没有安排<br><button class="btn sm pri" style="margin-top:10px" onclick="openTask(null,'${ds}')">加一件</button></div></div>`;
}
</script>

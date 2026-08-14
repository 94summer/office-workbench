<script>
/* ==================== 灵感速记 ==================== */
let nTag='',nQuery='';
function renderNote(){
  const tags={};DB.notes.forEach(n=>(n.tags||[]).forEach(t=>tags[t]=(tags[t]||0)+1));
  const ks=Object.keys(tags).sort((a,b)=>tags[b]-tags[a]);
  $('#nTags').innerHTML=`<button class="chip ${nTag?'':'on'}" data-t="">全部 ${DB.notes.length}</button>`+
    ks.map(t=>`<button class="chip ${nTag===t?'on':''}" data-t="${esc(t)}"><svg class="ic sm"><use href="#i-tag"/></svg>${esc(t)} ${tags[t]}</button>`).join('');
  $$('#nTags .chip').forEach(b=>b.onclick=()=>{nTag=b.dataset.t;renderNote();});

  let ls=[...DB.notes].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  if(nTag)ls=ls.filter(n=>(n.tags||[]).includes(nTag));
  if(nQuery){const q=nQuery.toLowerCase();ls=ls.filter(n=>(n.content+' '+(n.tags||[]).join(' ')).toLowerCase().includes(q));}
  $('#noteList').innerHTML=ls.length?ls.map(n=>`<div class="note">
    <div class="note-c">${esc(n.content)}</div>
    <div class="note-f">${(n.tags||[]).map(t=>`<span class="tag brd"><svg class="ic"><use href="#i-tag"/></svg>${esc(t)}</span>`).join('')}
      <span class="tm">${esc(n.createdAt||'')}</span></div>
    <div class="note-f" style="margin-top:7px;padding-top:7px;border-top:1px dashed var(--line-s)">
      <button class="btn sm" onclick="openNote('${n.id}')"><svg class="ic sm"><use href="#i-edit"/></svg>编辑</button>
      <button class="btn sm" onclick="noteToTask('${n.id}')"><svg class="ic sm"><use href="#i-check-sq"/></svg>变成任务</button>
      <button class="iconbtn dgr" style="margin-left:auto" onclick="delNote('${n.id}')"><svg class="ic sm"><use href="#i-trash"/></svg></button></div>
  </div>`).join('')
  :`<div class="card"><div class="empty"><svg class="ic"><use href="#i-bulb"/></svg><div>还没有灵感，点「记一条」开始</div></div></div>`;
}
function noteToTask(id){const n=DB.notes.find(x=>x.id===id);if(!n)return;openTask(null,TODAY(),n.content.slice(0,60));}

/* ==================== 项目跟进 ==================== */
let showArchived=false;
function renderProj(){
  $('#btnShowDone').textContent=showArchived?'隐藏已归档':'显示已归档';
  let ls=DB.projects.filter(p=>showArchived||p.status!=='done');
  ls.sort((a,b)=>(a.status==='blocked'?0:a.status==='active'?1:2)-(b.status==='blocked'?0:b.status==='active'?1:2));
  $('#projList').innerHTML=ls.length?ls.map(p=>{
    const s=projStat(p.id);const ts=DB.tasks.filter(t=>t.projectId===p.id&&!t.done).sort((a,b)=>a.pri.localeCompare(b.pri)).slice(0,4);
    return `<div class="proj ${p.status==='blocked'?'blocked':''}">
      <div class="proj-h">
        <span class="pdot ${p.status==='blocked'?'p0':p.status==='done'?'':'p2'}" style="width:9px;height:9px;${p.status==='done'?'background:var(--tx3)':''}"></span>
        <h4>${esc(p.name)}</h4>
        <span class="tag ${p.status==='blocked'?'red':p.status==='done'?'':'grn'}">${PSTAT[p.status]}</span>
        <button class="iconbtn" onclick="openProj('${p.id}')"><svg class="ic sm"><use href="#i-edit"/></svg></button>
        <button class="iconbtn dgr" onclick="delProj('${p.id}')"><svg class="ic sm"><use href="#i-trash"/></svg></button>
      </div>
      <div class="proj-row"><span class="k"><svg class="ic sm"><use href="#i-flag"/></svg>现在</span><span class="v">${esc(p.stage||'未填写')}</span></div>
      <div class="proj-row"><span class="k"><svg class="ic sm"><use href="#i-arr"/></svg>下一步</span><span class="v">${esc(p.next||'未填写')}</span></div>
      ${p.blocker?`<div class="proj-row"><span class="k"><svg class="ic sm"><use href="#i-alert"/></svg>卡点</span><span class="v blk">${esc(p.blocker)}</span></div>`:''}
      <div class="bar"><i style="width:${s.pct}%;${p.status==='blocked'?'background:linear-gradient(90deg,#d92d38,#f0757d)':''}"></i></div>
      <div class="pg-txt"><span>关联待办 ${s.done}/${s.all} 完成${s.over?` · <span style="color:var(--red)">${s.over} 件逾期</span>`:''}</span><span>${s.pct}%</span></div>
      ${ts.length?`<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--line-s)">
        ${ts.map(t=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.8px">
          <button class="tick" style="width:17px;height:17px;border-radius:5px" onclick="toggleTask('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>
          <span class="pdot ${PRI[t.pri].k}"></span><span style="flex:1;${t.overdue&&!t.done?'color:var(--red);font-weight:600':''}">${esc(t.title)}</span>
          <span style="color:var(--tx3);font-size:11.5px">${humanDate(t.due)}</span></div>`).join('')}
        </div>`:''}
      <div class="btn-row" style="margin-top:11px">
        <button class="btn sm" onclick="openTask(null,'${TODAY()}','','${p.id}')"><svg class="ic sm"><use href="#i-plus"/></svg>给这个项目加任务</button>
        ${p.status!=='done'?`<button class="btn sm" onclick="finishProj('${p.id}')">标记完成</button>`:`<button class="btn sm" onclick="reopenProj('${p.id}')">重新激活</button>`}
      </div></div>`}).join('')
    :`<div class="card"><div class="empty"><svg class="ic"><use href="#i-layers"/></svg><div>还没有项目，点「新建项目」开始跟进</div></div></div>`;
}
function finishProj(id){const p=projOf(id);p.status='done';p.updatedAt=TODAY();save();renderAll();toast('项目已归档','ok');}
function reopenProj(id){const p=projOf(id);p.status=p.blocker?'blocked':'active';p.updatedAt=TODAY();save();renderAll();}

/* ==================== SVG 图表 ==================== */
function trendChart(){
  const days=[];for(let i=6;i>=0;i--)days.push(addDays(TODAY(),-i));
  const data=days.map(d=>DB.tasks.filter(t=>t.done&&t.doneAt===d).length);
  const max=Math.max(3,...data);const W=430,H=150,pl=26,pb=24,pt=10;
  const bw=(W-pl-8)/7;
  let bars='',lines='',pts='';
  data.forEach((v,i)=>{
    const x=pl+i*bw,h=(H-pb-pt)*(v/max),y=H-pb-h;
    bars+=`<rect x="${(x+bw*0.22).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*0.56).toFixed(1)}" height="${Math.max(h,1.5).toFixed(1)}" rx="3" fill="url(#bg1)"/>`;
    if(v)bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${(y-4).toFixed(1)}" font-size="10" fill="#5b7a76" text-anchor="middle" font-weight="600">${v}</text>`;
    pts+=`${(x+bw/2).toFixed(1)},${y.toFixed(1)} `;
  });
  for(let i=0;i<=3;i++){const y=pt+(H-pb-pt)*i/3;lines+=`<line x1="${pl}" y1="${y}" x2="${W-8}" y2="${y}" stroke="#eff4f3" stroke-width="1"/>
    <text x="${pl-6}" y="${y+3.5}" font-size="9.5" fill="#93aba8" text-anchor="end">${Math.round(max-max*i/3)}</text>`;}
  const labels=days.map((d,i)=>`<text x="${(pl+i*bw+bw/2).toFixed(1)}" y="${H-8}" font-size="10" fill="${d===TODAY()?'#0a7a70':'#93aba8'}" text-anchor="middle" font-weight="${d===TODAY()?'700':'400'}">${d===TODAY()?'今天':WD[parseD(d).getDay()].slice(1)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#12b3a2"/><stop offset="100%" stop-color="#0e9b8e"/></linearGradient></defs>
    ${lines}${bars}<polyline points="${pts}" fill="none" stroke="#1b6ea8" stroke-width="1.6" stroke-opacity=".55" stroke-linejoin="round"/>
    ${data.map((v,i)=>{const x=pl+i*bw+bw/2,y=H-pb-(H-pb-pt)*(v/max);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff" stroke="#1b6ea8" stroke-width="1.6"/>`}).join('')}
    ${labels}</svg>
    <div class="lgd"><span><i style="background:#0e9b8e"></i>每日完成数</span><span><i style="background:#1b6ea8"></i>趋势</span></div>`;
}
function donut(data,total){
  const R=52,C=2*Math.PI*R;let off=0;
  const arcs=data.filter(d=>d.v>0).map(d=>{
    const len=total?C*d.v/total:0;
    const s=`<circle cx="70" cy="70" r="${R}" fill="none" stroke="${d.c}" stroke-width="17" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)" stroke-linecap="butt"/>`;
    off+=len;return s;}).join('');
  return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:center">
    <svg viewBox="0 0 140 140" style="width:140px;height:140px;flex:none">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#eff4f3" stroke-width="17"/>${arcs}
      <text x="70" y="66" font-size="26" font-weight="700" fill="#13302d" text-anchor="middle">${total}</text>
      <text x="70" y="84" font-size="10.5" fill="#93aba8" text-anchor="middle">件已完成</text></svg>
    <div style="min-width:130px">${data.map(d=>`<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 0">
      <i style="width:10px;height:10px;border-radius:3px;background:${d.c};display:inline-block;flex:none"></i>
      <span style="flex:1">${d.n}</span><b>${d.v}</b>
      <span style="color:var(--tx3);width:38px;text-align:right">${total?Math.round(d.v/total*100):0}%</span></div>`).join('')}</div></div>`;
}
function ringSvg(pct,txt,sub,color){
  const R=44,C=2*Math.PI*R,len=C*Math.min(pct,100)/100;
  return `<svg viewBox="0 0 104 104" style="width:100%;height:100%">
    <circle cx="52" cy="52" r="${R}" fill="none" stroke="#eff4f3" stroke-width="9"/>
    <circle cx="52" cy="52" r="${R}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${len.toFixed(1)} ${(C-len).toFixed(1)}"/></svg>
    <div class="ring-t"><b style="color:${color}">${txt}</b><span>${sub}</span></div>`;
}

/* ==================== 每周复盘 ==================== */
let revWeek=mondayOf(TODAY());
function weekStats(mon){
  const days=[];for(let i=0;i<7;i++)days.push(addDays(mon,i));
  const done=DB.tasks.filter(t=>t.done&&t.doneAt&&days.includes(t.doneAt));
  const created=DB.tasks.filter(t=>t.createdAt&&days.includes(t.createdAt));
  const openInWeek=DB.tasks.filter(t=>!t.done&&t.due&&t.due<=days[6]);
  const base=done.length+openInWeek.length;
  return{days,done:done.length,list:done,created:created.length,open:openInWeek.length,
    pct:base?Math.round(done.length/base*100):0,
    rolled:DB.tasks.filter(t=>!t.done&&(t.rollCount||0)>0)};
}
function renderReview(){
  const mon=revWeek,w=weekStats(mon);
  const isThis=mon===mondayOf(TODAY());
  $('#revRange').textContent=`${parseD(mon).getMonth()+1}月${parseD(mon).getDate()}日 - ${parseD(w.days[6]).getMonth()+1}月${parseD(w.days[6]).getDate()}日${isThis?'（本周）':''}`;
  const pc={P0:0,P1:0,P2:0};w.list.forEach(t=>pc[t.pri]=(pc[t.pri]||0)+1);
  const noteW=DB.notes.filter(n=>w.days.includes((n.createdAt||'').slice(0,10))).length;

  $('#revStats').innerHTML=[
    ['完成任务',w.done,'g','i-check-sq',`新建 ${w.created} 件`],
    ['完成率',w.pct+'%','b','i-fire',`还剩 ${w.open} 件未完成`],
    ['记录灵感',noteW,'a','i-bulb','本周新增'],
    ['卡住项目',DB.projects.filter(p=>p.status==='blocked').length,'r','i-alert',`${w.rolled.length} 件任务被顺延`]
  ].map(([lb,vl,c,ic,ex])=>`<div class="stat ${c}"><div class="lb"><svg class="ic sm"><use href="#${ic}"/></svg>${lb}</div>
    <div class="vl">${vl}</div><div class="ex">${ex}</div></div>`).join('');

  $('#revPie').innerHTML=donut([
    {n:'紧急重要 P0',v:pc.P0,c:'#d92d38'},{n:'重要 P1',v:pc.P1,c:'#e2a021'},{n:'一般 P2',v:pc.P2,c:'#1b6ea8'}
  ],w.done);

  /* 每天柱状 */
  const dd=w.days.map(d=>w.list.filter(t=>t.doneAt===d).length);
  const mx=Math.max(3,...dd),W=400,H=140,pl=24,pb=22;
  const bw=(W-pl-8)/7;
  let bars='';dd.forEach((v,i)=>{const x=pl+i*bw,h=(H-pb-12)*(v/mx),y=H-pb-h;
    const isT=w.days[i]===TODAY();
    bars+=`<rect x="${(x+bw*0.2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*0.6).toFixed(1)}" height="${Math.max(h,1.5).toFixed(1)}" rx="3" fill="${isT?'#0a7a70':'#3fc0a8'}"/>
      ${v?`<text x="${(x+bw/2).toFixed(1)}" y="${(y-3.5).toFixed(1)}" font-size="10" fill="#5b7a76" text-anchor="middle" font-weight="600">${v}</text>`:''}
      <text x="${(x+bw/2).toFixed(1)}" y="${H-7}" font-size="10" fill="${isT?'#0a7a70':'#93aba8'}" text-anchor="middle" font-weight="${isT?700:400}">${['一','二','三','四','五','六','日'][i]}</text>`;});
  let gl='';for(let i=0;i<=2;i++){const y=12+(H-pb-12)*i/2;gl+=`<line x1="${pl}" y1="${y}" x2="${W-8}" y2="${y}" stroke="#eff4f3"/><text x="${pl-5}" y="${y+3.5}" font-size="9.5" fill="#93aba8" text-anchor="end">${Math.round(mx-mx*i/2)}</text>`;}
  $('#revBar').innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${gl}${bars}</svg>`;

  /* 项目精力 */
  const pm={};w.list.forEach(t=>{const k=t.projectId||'__none';pm[k]=(pm[k]||0)+1;});
  const ent=Object.entries(pm).sort((a,b)=>b[1]-a[1]);
  const mxp=Math.max(1,...ent.map(e=>e[1]));
  const cols=['#0e9b8e','#1b6ea8','#e2a021','#7a5af5','#0f9d58','#d92d38'];
  $('#revProj').innerHTML=ent.length?ent.map(([k,v],i)=>{
    const nm=k==='__none'?'零散事项（未挂项目）':(projOf(k)||{name:'已删除项目'}).name;
    return `<div class="hbar"><div class="hbar-t"><span>${esc(nm)}</span><span>${v} 件 · ${Math.round(v/w.done*100)}%</span></div>
      <div class="hbar-b"><i style="width:${v/mxp*100}%;background:${cols[i%6]}"></i></div></div>`}).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-chart"/></svg><div>这周还没完成任务</div></div>`;

  /* 卡点 */
  const blocks=DB.projects.filter(p=>p.blocker&&p.status!=='done');
  const stuck=w.rolled.filter(t=>(t.rollCount||0)>=2);
  $('#revBlock').innerHTML=(blocks.length||stuck.length)?`
    ${blocks.map(p=>`<div style="padding:9px 0;border-bottom:1px dashed var(--line-s)">
      <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px"><span class="pdot p0"></span>${esc(p.name)}</div>
      <div style="font-size:12.5px;color:var(--red);margin-top:3px">${esc(p.blocker)}</div>
      <div style="font-size:11.5px;color:var(--tx3);margin-top:2px">下一步：${esc(p.next||'未定')}</div></div>`).join('')}
    ${stuck.length?`<div style="margin-top:10px;font-size:12.5px;color:var(--tx2)"><b>反复拖延的任务</b>${stuck.map(t=>
      `<div style="display:flex;gap:7px;padding:5px 0;font-size:12.5px"><span class="tag red">顺延${t.rollCount}次</span><span>${esc(t.title)}</span></div>`).join('')}</div>`:''}`
    :`<div class="empty"><svg class="ic"><use href="#i-check-sq"/></svg><div>没有卡点，这周挺顺</div></div>`;

  $('#revList').innerHTML=w.list.length?w.list.sort((a,b)=>(a.doneAt||'').localeCompare(b.doneAt||'')).map(t=>{
    const p=projOf(t.projectId);
    return `<div class="task done" style="opacity:1"><span class="tick on" style="cursor:default"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
      <div class="t-main"><div class="t-title" style="text-decoration:none;color:var(--tx)">${esc(t.title)}</div>
      <div class="t-meta"><span class="tag ${PRI[t.pri].c}">${PRI[t.pri].t}</span>
      <span class="tag grn">${(t.doneAt||'').slice(5)} 完成</span>
      ${p?`<span class="tag brd">${esc(p.name)}</span>`:''}</div></div></div>`}).join('')
    :`<div class="empty"><svg class="ic"><use href="#i-inbox"/></svg><div>这周还没有完成的任务</div></div>`;

  /* 下周工作计划（未完成待办自动汇总） */
  const np=nextWeekPlan();
  const planItem=t=>{const p=projOf(t.projectId);const od=t.due&&t.due<TODAY();
    return `<div style="display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px dashed var(--line-s)">
      <span class="pdot ${PRI[t.pri].k}" style="margin-top:5px;flex:none"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;${od?'color:var(--red);font-weight:600':''}">${esc(t.title)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px">
          <span class="tag ${PRI[t.pri].c}">${PRI[t.pri].t}</span>
          ${t.due?`<span class="tag ${od?'red':'brd'}">${humanDate(t.due)}</span>`:'<span class="tag">未排期</span>'}
          ${p?`<span class="tag brd">${esc(p.name)}</span>`:''}
        </div>
      </div></div>`;};
  $('#revPlan').innerHTML=np.total
    ? (np.overdue.length?`<div style="margin-bottom:8px"><b style="color:var(--red);font-size:12.5px">逾期未完成（${np.overdue.length}）</b>${np.overdue.map(planItem).join('')}</div>`:'')
      +(np.sched.length?`<div style="margin-bottom:8px"><b style="font-size:12.5px;color:#1b6ea8">下周排期（${np.sched.length}）</b>${np.sched.map(planItem).join('')}</div>`:'')
      +(np.unsched.length?`<div><b style="font-size:12.5px">未排期（${np.unsched.length}）</b>${np.unsched.map(planItem).join('')}</div>`:'')
    : `<div class="empty"><svg class="ic"><use href="#i-check-sq"/></svg><div>下周没有待办，轻松一周</div></div>`;
}
/* 下周工作计划：未完成待办按「逾期 / 下周排期 / 未排期」分组 */
function nextWeekPlan(){
  const today=TODAY();
  const nxtMon=addDays(revWeek,7), nxtSun=addDays(revWeek,13);
  const open=DB.tasks.filter(t=>!t.done);
  const byDue=(a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31');
  const overdue=open.filter(t=>t.due&&t.due<today).sort(byDue);                              // 逾期遗留：必然要排进下周
  const sched=open.filter(t=>t.due&&t.due>=nxtMon&&t.due<=nxtSun).sort(byDue);                  // 下周排期：截止日落在下周
  const unsched=open.filter(t=>!t.due||t.due==='').sort((a,b)=>a.pri.localeCompare(b.pri));      // 未排期：无截止日，作为下周 backlog
  return {overdue,sched,unsched,total:overdue.length+sched.length+unsched.length};
}
function projNameOf(id){const p=projOf(id);return p?p.name:'零散事项';}
function reviewText(){
  const w=weekStats(revWeek);const pc={P0:0,P1:0,P2:0};w.list.forEach(t=>pc[t.pri]++);
  const pm={};w.list.forEach(t=>{const k=t.projectId?(projOf(t.projectId)||{}).name||'其他':'零散事项';pm[k]=(pm[k]||0)+1;});
  let s=`【周复盘】${revWeek} ~ ${w.days[6]}\n\n`;
  s+=`一、完成情况\n共完成 ${w.done} 件，完成率 ${w.pct}%，未完成 ${w.open} 件。\n`;
  s+=`优先级分布：紧急重要 ${pc.P0} 件 / 重要 ${pc.P1} 件 / 一般 ${pc.P2} 件。\n\n`;
  s+=`二、精力分布\n`+Object.entries(pm).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`· ${k}：${v} 件`).join('\n')+'\n\n';
  s+=`三、完成清单\n`+(w.list.map(t=>`· ${t.title}（${PRI[t.pri].t}）`).join('\n')||'· 无')+'\n\n';
  const bl=DB.projects.filter(p=>p.blocker&&p.status!=='done');
  s+=`四、卡点\n`+(bl.map(p=>`· ${p.name}：${p.blocker}｜下一步：${p.next||'待定'}`).join('\n')||'· 无')+'\n';
  const np=nextWeekPlan();
  s+=`五、下周工作计划\n`;
  if(np.total){
    if(np.overdue.length)s+=`· 逾期未完成（${np.overdue.length} 件）\n`+np.overdue.map(t=>`  - ${t.title}（${PRI[t.pri].t}）｜截止 ${md(t.due)}｜${projNameOf(t.projectId)}`).join('\n')+'\n';
    if(np.sched.length)s+=`· 下周排期（${np.sched.length} 件）\n`+np.sched.map(t=>`  - ${t.title}（${PRI[t.pri].t}）｜截止 ${md(t.due)}｜${projNameOf(t.projectId)}`).join('\n')+'\n';
    if(np.unsched.length)s+=`· 未排期（${np.unsched.length} 件）\n`+np.unsched.map(t=>`  - ${t.title}（${PRI[t.pri].t}）｜${projNameOf(t.projectId)}`).join('\n')+'\n';
  }else s+='· 无\n';
  const st=w.rolled.filter(t=>(t.rollCount||0)>=2);
  if(st.length)s+=`\n六、反复拖延\n`+st.map(t=>`· ${t.title}（顺延 ${t.rollCount} 次）`).join('\n')+'\n';
  return s;
}
</script>

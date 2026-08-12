<script>
/* ==================== 工具 ==================== */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseD=s=>{if(!s)return null;const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c);};
const TODAY=()=>ymd(new Date());
const addDays=(s,n)=>{const d=parseD(s)||new Date();d.setDate(d.getDate()+n);return ymd(d);};
const addMonths=(s,n)=>{const d=parseD(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);
  d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return ymd(d);};
const diffDays=(a,b)=>Math.round((parseD(b)-parseD(a))/864e5);
const WD=['周日','周一','周二','周三','周四','周五','周六'];
function humanDate(s){if(!s)return'无期限';const t=TODAY(),d=diffDays(t,s);
  if(d===0)return'今天';if(d===1)return'明天';if(d===2)return'后天';if(d===-1)return'昨天';
  if(d<0)return`逾期${-d}天`;if(d<7)return`${d}天后`;
  const dt=parseD(s);return `${dt.getMonth()+1}月${dt.getDate()}日`;}
const md=s=>{const d=parseD(s);return d?`${d.getMonth()+1}月${d.getDate()}日`:'';};
function mondayOf(s){const d=parseD(s);const w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return ymd(d);}
const PRI={P0:{t:'紧急重要',c:'red',k:'p0'},P1:{t:'重要',c:'amb',k:'p1'},P2:{t:'一般',c:'blu',k:'p2'}};
const PSTAT={active:'进行中',blocked:'卡住了',done:'已完成'};
/* 周期定义表：以后要加「每三周 / 每季度」只需在这里补一行 */
const REP_DEF={
  daily:   {label:'每天',  unit:'天',   days:1},
  weekly:  {label:'每周',  unit:'周',   days:7},
  biweekly:{label:'每两周',unit:'两周', days:14},
  monthly: {label:'每月',  unit:'月',   months:1}
};
const REPEAT=Object.assign({none:'不重复'},Object.fromEntries(Object.entries(REP_DEF).map(([k,v])=>[k,v.label])));
/* 在 date 基础上推进 k 个周期 */
const repAdd=(r,date,k)=>{const c=REP_DEF[r];if(!c||!date)return date;
  return c.months?addMonths(date,c.months*k):addDays(date,c.days*k);};

/* ---------- 提前提醒（相对截止时刻的提前量） ---------- */
const LEAD_DEF={
  '15m':{label:'提前15分钟'},
  '30m':{label:'提前半小时'},
  '1h' :{label:'提前1小时'},
  '2h' :{label:'提前2小时'},
  '1d' :{label:'提前1天'},
  '1w' :{label:'提前1周'}
};
const LEAD_OPTS=[['','不提醒'],['15m','提前15分钟'],['30m','提前半小时'],['1h','提前1小时'],['2h','提前2小时'],['1d','提前1天'],['1w','提前1周']];
const leadLabel=v=>LEAD_DEF[v]?LEAD_DEF[v].label:'';
function leadMs(v){return ({'15m':9e5,'30m':18e5,'1h':36e5,'2h':72e5,'1d':864e5,'1w':6048e5})[v]||0;}
/* 任务的实际「提醒时刻」：截止日+提醒时间(默认当天结束) 减去提前量；无截止日返回 null */
function remindMoment(t){
  if(!t.due)return null;
  const base=t.remind||'23:59';const p=base.split(':');const d=parseD(t.due);
  d.setHours(+p[0]||0,+p[1]||0,0,0);
  return new Date(d.getTime()-leadMs(t.lead));
}
/* 任务卡片上的提醒标签：时间 + 提前量 组合展示 */
function remindTag(t){
  const clock=t.remind?esc(t.remind):'',L=leadLabel(t.lead);
  if(!clock&&!L)return '';
  if(!L)return `<span class="tag"><svg class="ic"><use href="#i-clock"/></svg>${clock}</span>`;
  if(!clock)return `<span class="tag"><svg class="ic"><use href="#i-clock"/></svg>${L}</span>`;
  return `<span class="tag"><svg class="ic"><use href="#i-clock"/></svg>${clock} · ${L}</span>`;
}
/* 日历行内简短前缀：优先显示提前量，其次显示提醒时间 */
function remindShort(t){const L=leadLabel(t.lead);return L||(t.remind?esc(t.remind):'');}

function toast(msg,type=''){const w=$('#toasts');const el=document.createElement('div');
  el.className='toast '+type;el.innerHTML=`<svg class="ic sm"><use href="#${type==='err'?'i-alert':'i-check-sq'}"/></svg><span>${esc(msg)}</span>`;
  w.appendChild(el);setTimeout(()=>{el.style.transition='.3s';el.style.opacity='0';el.style.transform='translateY(8px)';setTimeout(()=>el.remove(),300);},2400);}

/* ==================== 数据 ==================== */
const KEY='wb_office_desk_v1';
let DB={version:1,tasks:[],notes:[],projects:[],settings:{},meta:{}};
let saveTimer=null;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
  try{localStorage.setItem(KEY,JSON.stringify(DB));const n=$('#navSave');if(n){n.textContent='已自动保存 '+pad(new Date().getHours())+':'+pad(new Date().getMinutes());}}
  catch(e){toast('保存失败：本地存储已满，请先导出备份','err');}
  if(typeof scheduleFileSync==='function')scheduleFileSync();
  if(typeof scheduleServerSync==='function')scheduleServerSync();
},180);}
function load(){
  try{const r=localStorage.getItem(KEY);if(r){DB=JSON.parse(r);}}catch(e){console.warn(e);}
  DB.tasks=DB.tasks||[];DB.notes=DB.notes||[];DB.projects=DB.projects||[];
  DB.settings=Object.assign({sedEnabled:false,sedMin:45,sedRest:5,sedSound:true,sedMusic:'',sedMusicName:'',sedCount:0,sedDone:0,sedDay:TODAY(),sedStart:0,taskSound:true},DB.settings||{});
  DB.meta=Object.assign({lastRoll:'',sample:false,lastExport:'',lastExportCount:0,dismissTip:0},DB.meta||{});
  /* 兼容旧数据：修正被早期导入损坏的重复值，补齐周期限制字段 */
  const REP_FIX={'天':'daily','周':'weekly','月':'monthly','两周':'biweekly'};
  Object.keys(REP_DEF).forEach(k=>{REP_FIX[k]=k;REP_FIX[REP_DEF[k].label]=k;});
  DB.tasks.forEach(x=>{
    if(x.repeat&&x.repeat!=='none'){
      x.repeat=REP_FIX[x.repeat]||'none';
      if(x.repeat!=='none'){x.repEnd=x.repEnd||'never';x.repIdx=x.repIdx||1;
        if(x.repEnd==='count'&&!x.repTotal)x.repEnd='never';
        if(x.repEnd==='until'&&!x.repUntil)x.repEnd='never';}
    }
  });
  if(!DB.meta.sample&&!DB.tasks.length&&!DB.notes.length&&!DB.projects.length)seedSample();
  rollover();
}
const totalCount=()=>DB.tasks.length+DB.notes.length+DB.projects.length;

/* ---------- 自动顺延：昨天没做完的挪到今天 ---------- */
function rollover(){
  const t=TODAY();if(DB.meta.lastRoll===t)return;
  let n=0;
  DB.tasks.forEach(x=>{
    if(!x.done&&x.due&&x.due<t){
      x.origDue=x.origDue||x.due;
      x.rollCount=(x.rollCount||0)+1;
      x.due=t;x.overdue=true;n++;
    }
  });
  DB.meta.lastRoll=t;
  if(n)DB.meta.rolledToday=n;else DB.meta.rolledToday=0;
  save();
}

/* ---------- 示例数据 ---------- */
function seedSample(){
  const t=TODAY();
  const p1=uid(),p2=uid(),p3=uid();
  DB.projects=[
    {id:p1,name:'Q3 客户续约方案',stage:'已完成初稿，等法务确认条款',next:'周四前把定价表补齐并发给王总',blocker:'法务反馈还没回，条款卡住 3 天了',status:'blocked',sample:1,createdAt:addDays(t,-16),updatedAt:addDays(t,-2)},
    {id:p2,name:'部门季度汇报材料',stage:'数据已拉齐，PPT 完成 6 页',next:'补充竞品对比页，周五过一遍逻辑',blocker:'',status:'active',sample:1,createdAt:addDays(t,-9),updatedAt:addDays(t,-1)},
    {id:p3,name:'新人培训手册',stage:'大纲已定',next:'先写第一章：入职流程',blocker:'',status:'active',sample:1,createdAt:addDays(t,-4),updatedAt:t}
  ];
  DB.tasks=[
    {id:uid(),title:'把续约方案的定价表补齐',pri:'P0',due:addDays(t,-2),remind:'09:30',done:false,projectId:p1,sample:1,repeat:'none',createdAt:addDays(t,-6),note:'重点核对折扣区间'},
    {id:uid(),title:'催一下法务的条款反馈',pri:'P0',due:t,remind:'10:00',done:false,projectId:p1,sample:1,repeat:'none',createdAt:addDays(t,-1),note:''},
    {id:uid(),title:'季度汇报 PPT 补竞品对比页',pri:'P1',due:t,remind:'14:00',done:false,projectId:p2,sample:1,repeat:'none',createdAt:addDays(t,-2),note:''},
    {id:uid(),title:'每日站会',pri:'P2',due:t,remind:'09:00',lead:'15m',done:false,projectId:null,sample:1,repeat:'daily',repEnd:'count',repTotal:10,repIdx:4,createdAt:addDays(t,-20),note:'15 分钟以内'},
    {id:uid(),title:'周五写周报',pri:'P1',due:nextWeekday(t,5),remind:'16:30',lead:'1d',done:false,projectId:null,sample:1,repeat:'weekly',repEnd:'until',repUntil:addDays(t,45),repIdx:1,createdAt:addDays(t,-14),note:''},
    {id:uid(),title:'双周迭代评审会',pri:'P1',due:addDays(t,4),remind:'15:00',lead:'1d',done:false,projectId:p2,sample:1,repeat:'biweekly',repEnd:'count',repTotal:6,repIdx:2,createdAt:addDays(t,-18),note:'提前一天发议题'},
    {id:uid(),title:'月初对一次账',pri:'P2',due:addMonths(t,1).slice(0,8)+'01',remind:'10:00',lead:'1d',done:false,projectId:null,sample:1,repeat:'monthly',repEnd:'never',repIdx:1,createdAt:addDays(t,-10),note:''},
    {id:uid(),title:'新人手册第一章初稿',pri:'P1',due:addDays(t,3),remind:'',done:false,projectId:p3,sample:1,repeat:'none',createdAt:addDays(t,-3),note:''},
    {id:uid(),title:'整理上周会议纪要',pri:'P2',due:addDays(t,-3),remind:'',done:true,doneAt:addDays(t,-3),projectId:p2,sample:1,repeat:'none',createdAt:addDays(t,-5),note:''},
    {id:uid(),title:'汇报数据源核对',pri:'P1',due:addDays(t,-2),remind:'',done:true,doneAt:addDays(t,-2),projectId:p2,sample:1,repeat:'none',createdAt:addDays(t,-6),note:''},
    {id:uid(),title:'客户拜访行程确认',pri:'P0',due:addDays(t,-1),remind:'',done:true,doneAt:addDays(t,-1),projectId:p1,sample:1,repeat:'none',createdAt:addDays(t,-4),note:''}
  ];
  // 逾期那条：模拟已顺延 2 次
  DB.tasks[0].origDue=addDays(t,-4);DB.tasks[0].rollCount=2;DB.tasks[0].overdue=true;
  DB.notes=[
    {id:uid(),content:'汇报开头别堆数据，先给结论：这季度增长主要来自老客户复购，新增只占 3 成。',tags:['汇报','表达'],sample:1,createdAt:addDays(t,-1)+' 21:10',updatedAt:''},
    {id:uid(),content:'续约谈判可以先给客户三个套餐档位，让他在里面选，而不是问要不要续。',tags:['销售','谈判'],sample:1,createdAt:addDays(t,-3)+' 08:42',updatedAt:''},
    {id:uid(),content:'新人手册加一页「第一周你会遇到的 8 个问题」，比流程图管用。',tags:['管理'],sample:1,createdAt:t+' 09:05',updatedAt:''}
  ];
  DB.meta.sample=true;
}
function nextWeekday(from,wd){const d=parseD(from);let i=0;while(i<8){if(d.getDay()===wd&&ymd(d)>=from)break;d.setDate(d.getDate()+1);i++;}return ymd(d);}

/* ---------- 周期任务：展开到某天 ---------- */
/* 从 from 到 to 相隔几个完整周期；对不上周期返回 -1 */
function repStep(r,from,to){
  const c=REP_DEF[r];
  if(!c||!from||!to||to<from)return -1;
  if(from===to)return 0;
  if(c.months){const a=parseD(from),b=parseD(to);
    const m=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());
    const k=Math.floor(m/c.months);
    return k>=0&&addMonths(from,c.months*k)===to?k:-1;}
  const d=diffDays(from,to);
  return d%c.days===0?d/c.days:-1;
}
/* 第 n 次（1 起算）落在哪天 */
function repDateAt(t,n){
  const k=n-(t.repIdx||1);if(k<0)return null;
  return repAdd(t.repeat,t.due,k);
}
/* 还剩几次（含当次）；无限制返回 Infinity */
function repRemain(t){
  if((t.repeat||'none')==='none')return 1;
  if(t.repEnd==='count')return Math.max(0,(t.repTotal||1)-(t.repIdx||1)+1);
  return Infinity;
}
/* 限制说明文案，无限制返回空串 */
function repLimitText(t){
  if((t.repeat||'none')==='none')return '';
  if(t.repEnd==='count')return `第 ${t.repIdx||1}/${t.repTotal||1} 次`;
  if(t.repEnd==='until'&&t.repUntil)return '至 '+md(t.repUntil);
  return '';
}
/* 某次出现是否仍在限制范围内 */
function repInLimit(t,date){
  if(t.repEnd==='until')return !t.repUntil||date<=t.repUntil;
  if(t.repEnd==='count'){const k=repStep(t.repeat,t.due,date);
    return k>=0&&((t.repIdx||1)+k)<=(t.repTotal||1);}
  return true;
}
function occursOn(task,date){
  if(!task.due)return false;
  if(task.due===date)return true;
  const r=task.repeat||'none';
  if(r==='none'||date<task.due)return false;
  if(repStep(r,task.due,date)<0)return false;
  return repInLimit(task,date);
}
function tasksOn(date){
  const out=[];
  DB.tasks.forEach(t=>{
    if(t.due===date){out.push({t,virtual:false});}
    else if((t.repeat||'none')!=='none'&&!t.done&&occursOn(t,date)){out.push({t,virtual:true});}
  });
  function rmCmp(x,y){const a=remindMoment(x.t),b=remindMoment(y.t);
    if(!a&&!b)return x.t.pri.localeCompare(y.t.pri);
    if(!a)return 1;if(!b)return -1;return a-b;}
  return out.sort(rmCmp);
}

/* ---------- 任务操作 ---------- */
function toggleTask(id){
  const t=DB.tasks.find(x=>x.id===id);if(!t)return;
  t.done=!t.done;
  if(t.done){
    t.doneAt=TODAY();
    if((t.repeat||'none')!=='none'){
      const raw=repAdd(t.repeat,t.due,1);
      const nx=raw<TODAY()?TODAY():raw, idx=(t.repIdx||1)+1;
      let stop='';
      if(t.repEnd==='count'&&idx>(t.repTotal||1))stop=`已完成全部 ${t.repTotal||1} 次`;
      else if(t.repEnd==='until'&&t.repUntil&&raw>t.repUntil)stop=`已到重复截止日 ${t.repUntil}`;
      if(stop){toast('这轮周期任务收官 · '+stop,'ok');}
      else{
        DB.tasks.push({...t,id:uid(),done:false,doneAt:null,due:nx,repIdx:idx,rollCount:0,origDue:null,overdue:false,createdAt:TODAY()});
        const left=t.repEnd==='count'?`，还剩 ${(t.repTotal||1)-idx+1} 次`:'';
        toast('已完成，下一次排到 '+humanDate(nx)+left,'ok');
      }
    }else toast('搞定一件','ok');
  }else{t.doneAt=null;}
  save();renderAll();
}
function rollTask(id,days=1){
  const t=DB.tasks.find(x=>x.id===id);if(!t)return;
  t.origDue=t.origDue||t.due;t.rollCount=(t.rollCount||0)+1;
  t.due=addDays(TODAY(),days);t.overdue=true;
  save();renderAll();toast(`已顺延到${days===1?'明天':humanDate(t.due)}（第 ${t.rollCount} 次）`);
}
function delTask(id){confirmBox('删除这条任务？','删除后不可恢复。',()=>{DB.tasks=DB.tasks.filter(x=>x.id!==id);save();renderAll();toast('已删除');});}
function delNote(id){confirmBox('删除这条灵感？','删除后不可恢复。',()=>{DB.notes=DB.notes.filter(x=>x.id!==id);save();renderAll();toast('已删除');});}
function delProj(id){confirmBox('删除这个项目？','关联任务会保留，但不再挂在项目下。',()=>{
  DB.projects=DB.projects.filter(x=>x.id!==id);DB.tasks.forEach(t=>{if(t.projectId===id)t.projectId=null;});save();renderAll();toast('已删除');});}
const projOf=id=>DB.projects.find(p=>p.id===id);
function projStat(id){const ts=DB.tasks.filter(t=>t.projectId===id);
  const d=ts.filter(t=>t.done).length;return{all:ts.length,done:d,pct:ts.length?Math.round(d/ts.length*100):0,open:ts.length-d,
  over:ts.filter(t=>!t.done&&t.overdue).length};}
</script>

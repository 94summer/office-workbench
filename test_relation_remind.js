// 验证两件事：
// 1) applyStructured（xlsx 重载路径）多次载入后，待办与项目的关联关系不丢失且 ID 稳定（幂等）
// 2) 待办到点提醒：设置了提醒时间的任务到点会触发弹层 + 声音，未设置的不会
const fs=require('fs');const vm=require('vm');
const html=fs.readFileSync('办公工作台.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let code=scripts.join('\n').replace(/<\/?script[^>]*>/g,'');
const noop=()=>{};
function mkEl(){return {textContent:'',innerHTML:'',style:{},value:'',checked:false,appendChild:noop,remove:noop,
  classList:{toggle:noop,add:noop,remove:noop},addEventListener:noop,onclick:null,oninput:null,onchange:null,
  querySelector:()=>mkEl(),querySelectorAll:()=>[],closest:()=>null,dataset:{},files:[],click:noop};}
const elStub=mkEl();
const documentStub={getElementById:id=>(id==='taskAlert'?null:elStub),querySelector:()=>elStub,querySelectorAll:()=>[],
  createElement:()=>mkEl(),body:elStub,addEventListener:noop};
const localStorageStub={_d:{},getItem(k){return this._d[k]||null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}};
const sandbox={console,document:documentStub,localStorage:localStorageStub,window:{},
  $:()=>elStub,$$:()=>[],setTimeout,clearTimeout,setInterval,clearInterval,fetch:()=>Promise.reject(new Error('no')),
  TextEncoder,TextDecoder,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  Response,DecompressionStream,Uint8Array,DataView,ArrayBuffer,Math,JSON,Date,Object,Array,String,Number,Boolean,parseInt,parseFloat,isNaN,RegExp,
  navigator:{},location:{protocol:'http:',hostname:'127.0.0.1',href:'http://127.0.0.1:9876/'},
  toast:noop,renderAll:noop,renderTodo:noop,renderNote:noop,renderProj:noop,renderCal:noop,renderReview:noop,renderBanner:noop,renderSetting:noop,renderInspire:noop,
  totalCount:()=>0,uid:()=>'u'+Math.random().toString(36).slice(2,9),TODAY:()=>'2026-08-12',fmtNow:()=>'2026-08-12 09:00',fmtTime:()=>'2026-08-12 09:00',
  pad:n=>String(n).padStart(2,'0'),esc:s=>s};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const run=s=>vm.runInContext(s,sandbox);
const dbSnap=()=>JSON.parse(run('JSON.stringify({tasks:DB.tasks,projects:DB.projects})'));

let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;console.log('  ✔',m);}else{fail++;console.log('  ✘ FAIL:',m);}};

/* ========== 测试 1：xlsx 结构载入 → 重载 → 关联保持 ========== */
console.log('\n[1] 待办-项目关联保持');
const ts=[['标题','轻重缓急','截止日期','提醒时间','提前提醒','重复','重复结束','重复进度','关联项目','备注','状态','创建日期'],
  ['完成Q3续约方案','紧急','2026-08-15','09:30','','不重复','','','Q3客户续约','重点核对折扣','未完成','2026-08-01'],
  ['催法务条款反馈','重要','2026-08-13','10:00','提前15分钟','不重复','','','Q3客户续约','','未完成','2026-08-02'],
  ['整理上周纪要','一般','2026-08-10','','','不重复','','','新人带教','','已完成','2026-08-05'],
  ['独立任务不挂项目','一般','2026-08-12','','','不重复','','','','','未完成','2026-08-12']];
const ps=[['项目名','现在到哪一步','下一步','卡点','状态','创建','更新'],
  ['Q3客户续约','谈判中','发报价单','等法务','进行中','2026-07-01','2026-08-01'],
  ['新人带教','进行中','准备第一章','','进行中','2026-07-10','2026-08-02']];
const ns=[['内容','标签','创建时间']];
run(`applyStructured(${JSON.stringify(ts)},${JSON.stringify(ns)},${JSON.stringify(ps)})`); // 首次载入
let db=dbSnap();
ok(db.projects.length===2,'项目表 2 个项目都载入');
ok(db.tasks.length===4,'待办表 4 条任务都载入');
ok(db.tasks.find(t=>t.title==='完成Q3续约方案').projectId===db.projects.find(p=>p.name==='Q3客户续约').id,'任务1 关联到新载入的项目 ID');
ok(db.tasks.find(t=>t.title==='催法务条款反馈').projectId===db.projects.find(p=>p.name==='Q3客户续约').id,'任务2 关联正确');
ok(db.tasks.find(t=>t.title==='整理上周纪要').projectId===db.projects.find(p=>p.name==='新人带教').id,'任务3 关联正确');
ok(db.tasks.find(t=>t.title==='独立任务不挂项目').projectId===null,'未填项目名的任务 projectId=null');
const idA1=db.projects.find(p=>p.name==='Q3客户续约').id;

run(`applyStructured(${JSON.stringify(ts)},${JSON.stringify(ns)},${JSON.stringify(ps)})`); // 模拟「重新加载」
db=dbSnap();
ok(db.projects.find(p=>p.name==='Q3客户续约').id===idA1,'重载后同名项目 ID 不变（幂等）');
ok(db.tasks.find(t=>t.title==='完成Q3续约方案').projectId===db.projects.find(p=>p.name==='Q3客户续约').id,'重载后任务1 仍关联项目（关联不丢失）');
ok(db.tasks.find(t=>t.title==='催法务条款反馈').projectId===db.projects.find(p=>p.name==='Q3客户续约').id,'重载后任务2 仍关联项目');
ok(db.tasks.find(t=>t.title==='整理上周纪要').projectId===db.projects.find(p=>p.name==='新人带教').id,'重载后任务3 仍关联项目');

run(`applyStructured(${JSON.stringify(ts)},${JSON.stringify(ns)},${JSON.stringify([])})`); // 无项目表的文件
db=dbSnap();
ok(db.projects.length===2,'无项目表的文件重载后，现有项目保留（不误删）');
ok(db.tasks.find(t=>t.title==='完成Q3续约方案').projectId===db.projects.find(p=>p.name==='Q3客户续约').id,'无项目表时任务仍挂靠到现有项目');

/* ========== 测试 2：待办到点提醒 ========== */
console.log('\n[2] 待办到点提醒');
const now=new Date();
const hh=String(now.getHours()).padStart(2,'0'),mm=String(now.getMinutes()).padStart(2,'0');
run(`DB.tasks=[
  {id:'t1',title:'带提醒的任务',due:'2026-08-12',remind:'${hh}:${mm}',lead:'',done:false,projectId:null,repeat:'none'},
  {id:'t2',title:'不带提醒时间的任务',due:'2026-08-12',remind:'',lead:'',done:false,projectId:null,repeat:'none'},
  {id:'t3',title:'已完成的任务',due:'2026-08-12',remind:'${hh}:${mm}',lead:'',done:true,projectId:null,repeat:'none'},
  {id:'t4',title:'提醒已过1小时的任务',due:'2026-08-12',remind:'07:30',lead:'',done:false,projectId:null,repeat:'none'}
];DB.settings.taskSound=true;`);
let played=0; run('playAlert=function(){__played++;}'); sandbox.__played=0;
run('checkTaskReminds();');
ok(sandbox.__played===1,'到点且未提醒的任务触发 1 次声音');
run('checkTaskReminds();');
ok(sandbox.__played===1,'重复检查不重复触发（同一提醒时刻只响一次）');

console.log('\n结果: '+(pass+fail)+' 项断言, '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);

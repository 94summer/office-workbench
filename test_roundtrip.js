/* 导出→导入 往返一致性测试 —— 临时文件，不进最终产物 */
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9335, PROFILE='C:\\Users\\admin\\WorkBuddy\\个人工作台2\\__rt_'+Date.now();
const URL='file:///C:/Users/admin/WorkBuddy/个人工作台2/办公工作台.html';
const proc=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run',
  '--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let target=null;
  for(let i=0;i<30;i++){await sleep(500);
    try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){}}
  if(!target){console.log('FAIL CDP');proc.kill();process.exit(1);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  let id=0;const w=new Map();
  const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);}});
  await new Promise(r=>ws.addEventListener('open',r));
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:URL});await sleep(2500);

  const expr=`(function(){
    var R=[];
    function t(n,c){R.push((c?'PASS ':'FAIL ')+n);}
    try{
      /* 造 4 条覆盖全部周期类型 + 全部限制模式 */
      DB.tasks=[
        {id:'a1',title:'双周评审',pri:'P1',due:'2026-08-10',remind:'15:00',repeat:'biweekly',repEnd:'count',repTotal:6,repIdx:3,projectId:null,note:'',done:false,createdAt:'2026-08-01',overdue:false,rollCount:0,origDue:null},
        {id:'a2',title:'周报',pri:'P1',due:'2026-08-14',remind:'',repeat:'weekly',repEnd:'until',repUntil:'2026-12-31',repIdx:1,projectId:null,note:'',done:false,createdAt:'2026-08-01',overdue:false,rollCount:0,origDue:null},
        {id:'a3',title:'站会',pri:'P2',due:'2026-08-10',remind:'',repeat:'daily',repEnd:'never',repIdx:1,projectId:null,note:'',done:false,createdAt:'2026-08-01',overdue:false,rollCount:0,origDue:null},
        {id:'a4',title:'一次性',pri:'P0',due:'2026-08-20',remind:'',repeat:'none',repEnd:'never',repIdx:1,projectId:null,note:'',done:false,createdAt:'2026-08-01',overdue:false,rollCount:0,origDue:null}
      ];
      var rows=taskRows();
      var hdr=rows[0];
      t('表头含重复结束列', hdr.indexOf('重复结束')>=0 && hdr.indexOf('重复进度')>=0);
      var by={}; rows.slice(1).forEach(function(r){by[r[0]]=r;});
      /* 按表头动态定位列（表头顺序后续可能变化，避免固定 index 断言过时） */
      var ci=function(name){return hdr.indexOf(name);};
      var repC=ci('重复'), endC=ci('重复结束'), idxC=ci('重复进度');
      t('双周-重复列=每两周', by['双周评审'][repC]==='每两周');
      t('双周-结束列=共 6 次', by['双周评审'][endC]==='共 6 次');
      t('双周-进度列=第 3 次', by['双周评审'][idxC]==='第 3 次');
      t('周报-结束列=至日期', by['周报'][endC]==='至 2026-12-31');
      t('站会-结束列=一直重复', by['站会'][endC]==='一直重复');
      t('一次性-无结束值', by['一次性'][endC]==='');

      /* 导回来 */
      applyStructured(rows, noteRows(), projRows());
      var m={}; DB.tasks.forEach(function(x){m[x.title]=x;});
      t('导回 4 条', DB.tasks.length===4);
      var b=m['双周评审'];
      t('双周 repeat 还原', b.repeat==='biweekly');
      t('双周 repEnd/repTotal 还原', b.repEnd==='count'&&b.repTotal===6);
      t('双周 repIdx 还原', b.repIdx===3);
      t('双周 剩余次数=4', repRemain(b)===4);
      t('双周 标签文案', repLimitText(b)==='第 3/6 次');
      var wk=m['周报'];
      t('周报 until 还原', wk.repeat==='weekly'&&wk.repEnd==='until'&&wk.repUntil==='2026-12-31');
      var dl=m['站会'];
      t('站会 never 还原', dl.repeat==='daily'&&dl.repEnd==='never');
      t('一次性 none 还原', m['一次性'].repeat==='none');

      /* 还原后周期展开仍正确：第3次是8-10，共6次 → 末次 = 8-10 + 14*3 = 9-21 */
      t('还原后 D+14 出现', tasksOn('2026-08-24').some(function(x){return x.t.id===b.id;}));
      t('还原后 D+7 不出现', !tasksOn('2026-08-17').some(function(x){return x.t.id===b.id;}));
      t('还原后 末次9-21出现', tasksOn('2026-09-21').some(function(x){return x.t.id===b.id;}));
      t('还原后 10-05 越界', !tasksOn('2026-10-05').some(function(x){return x.t.id===b.id;}));
    }catch(e){R.push('FAIL 异常: '+e.message);}
    return R.join(' ||| ');
  })()`;
  const out=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  const rows=((out.result&&out.result.value)||'FAIL 无返回').split(' ||| ');
  rows.forEach(r=>console.log(r));
  const pass=rows.filter(r=>r.startsWith('PASS')).length;
  console.log(`\n==== ${pass}/${rows.length} 通过 ====`);
  ws.close();proc.kill();
  setTimeout(()=>{try{require('fs').rmSync(PROFILE,{recursive:true,force:true});}catch(e){}
    process.exit(pass===rows.length?0:1);},800);
})();

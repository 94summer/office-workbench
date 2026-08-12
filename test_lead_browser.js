/* 提前提醒 浏览器交互测试（CDP 驱动 headless Edge，全新 profile） —— 临时文件 */
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9337, PROFILE='C:\\Users\\admin\\WorkBuddy\\个人工作台2\\__ld_'+Date.now();
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
    var R=[];function t(n,c){R.push((c?'PASS ':'FAIL ')+n);}
    try{
      /* 1) 新建任务表单：默认提前15分钟 + 下拉7项 */
      openTask(null);
      var sel=document.getElementById('fTLead');
      t('新任务默认提前15分钟', !!sel && sel.value==='15m');
      var opts=[].slice.call(sel.options).map(function(o){return o.textContent;});
      t('下拉含6档+不提醒', opts.length===7);
      t('选项文案齐全', ['不提醒','提前15分钟','提前半小时','提前1小时','提前2小时','提前1天','提前1周'].every(function(x){return opts.indexOf(x)>=0;}));

      /* 2) 编辑已有任务：沿用其 lead=1d */
      var bi=DB.tasks.find(function(x){return x.title==='双周迭代评审会';});
      openTask(bi.id);
      t('编辑沿用已有lead=1d', document.getElementById('fTLead').value==='1d');

      /* 3) 保存一条新任务，lead=2h */
      openTask(null);
      document.getElementById('fTTitle').value='测试提前提醒任务';
      document.getElementById('fTLead').value='2h';
      document.getElementById('tSave').onclick();
      var nt=DB.tasks.find(function(x){return x.title==='测试提前提醒任务';});
      t('保存写入lead=2h', !!nt && nt.lead==='2h');

      /* 4) 示例数据 */
      t('示例双周 lead=1d', bi.lead==='1d');
      t('示例双周提醒时间保留', bi.remind==='15:00');

      /* 5) 卡片展示：提前1天 + 时间组合 */
      var html=taskRow(bi);
      t('卡片显示提前1天', html.indexOf('提前1天')>=0);
      t('卡片时间+提前组合', html.indexOf('15:00')>=0 && html.indexOf('提前1天')>=0 && html.indexOf('·')>=0);

      /* 6) 导出 */
      var rows=taskRows();var hdr=rows[0];
      t('导出表头含提前提醒', hdr.indexOf('提前提醒')>=0);
      var by={};rows.slice(1).forEach(function(r){by[r[0]]=r;});
      t('导出双周提前1天', by['双周迭代评审会'][4]==='提前1天');
      t('导出双周提醒时间', by['双周迭代评审会'][3]==='15:00');

      /* 7) 导入往返：lead 还原 */
      applyStructured(rows, noteRows(), projRows());
      var bi2=DB.tasks.find(function(x){return x.title==='双周迭代评审会';});
      t('导入还原 lead=1d', !!bi2 && bi2.lead==='1d');
      t('导入还原提醒时间', !!bi2 && bi2.remind==='15:00');

      /* 8) 旧格式（无提前提醒列）导入：lead 默认空，不报错 */
      var oldHdr=['标题','轻重缓急','截止日期','提醒时间','重复','状态'];
      var oldRow=['旧任务','重要','2026-08-20','09:00','不重复','未完成'];
      applyStructured([oldHdr,oldRow],[],[]);
      var old=DB.tasks.find(function(x){return x.title==='旧任务';});
      t('旧格式无该列 lead为空', !!old && old.lead==='');
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

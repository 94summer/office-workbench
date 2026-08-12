/* CDP 驱动 headless Edge 跑交互测试 —— 临时文件，不进最终产物 */
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9333, URL='file:///C:/Users/admin/WorkBuddy/个人工作台2/__test.html';
/* 每次用全新 profile：file:// 的 localStorage 存在 profile 里，复用会导致上一轮脏数据干扰 */
const PROFILE='C:\\Users\\admin\\WorkBuddy\\个人工作台2\\__profile_'+Date.now();
const proc=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run',
  '--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let target=null;
  for(let i=0;i<30;i++){await sleep(500);
    try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){}}
  if(!target){console.log('FAIL 无法连接 CDP');proc.kill();process.exit(1);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  let id=0;const w=new Map();
  const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);}});
  await new Promise(r=>ws.addEventListener('open',r));
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:URL});
  await sleep(4000);
  const out=await send('Runtime.evaluate',{
    expression:`(function(){var e=document.getElementById('__RESULT__');return e?e.textContent:'NO_RESULT len='+document.body.innerHTML.length;})()`,
    returnByValue:true});
  const txt=(out.result&&out.result.value)||'(空)';
  const rows=txt.replace(/^<<</,'').replace(/>>>$/,'').split(' ||| ');
  rows.forEach(r=>console.log(r));
  const pass=rows.filter(r=>r.startsWith('PASS')).length;
  console.log(`\n==== ${pass}/${rows.length} 通过 ====`);
  ws.close();proc.kill();
  setTimeout(()=>{try{require('fs').rmSync(PROFILE,{recursive:true,force:true});}catch(e){}
    process.exit(pass===rows.length?0:1);},800);
})();

/* CDP 驱动 headless Edge 加载「运行中的 exe 服务」页面，验证 ServerSync：
   (1) 页面从服务端注入的共享 DB 初始化（而非默认示例）；
   (2) 保存时把改动 push 到 /api/push，服务端 state 更新。
   依赖：app/out2/办公工作台.exe 已在后台运行并监听 9876。 */
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9876, URL='http://127.0.0.1:'+PORT+'/';
const PROFILE='C:\\Users\\admin\\WorkBuddy\\个人工作台2\\__sync_'+Date.now();
const proc=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run',
  '--remote-debugging-port='+(PORT+200),'--user-data-dir='+PROFILE,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  let target=null;
  for(let i=0;i<30;i++){await sleep(500);
    try{const l=await (await fetch(`http://127.0.0.1:${PORT+200}/json/list`)).json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){}}
  if(!target){console.log('FAIL 无法连接 CDP');try{proc.kill();}catch(e){}process.exit(1);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  let id=0;const w=new Map();
  const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);}});
  await new Promise(r=>ws.addEventListener('open',r));
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:URL});
  await sleep(3500);
  // (1) 页面应从服务端注入的 DB 初始化（含 FILE_PERSIST_TASK）
  const init=await send('Runtime.evaluate',{expression:'(typeof DB!=="undefined"&&DB.tasks)?DB.tasks.map(t=>t.title).join("|"):"NO_DB"',returnByValue:true});
  const initTitles=(init.result&&init.result.value)||'';
  console.log((initTitles.indexOf('FILE_PERSIST_TASK')>=0?'PASS':'FAIL')+': (1) 页面从服务端共享 DB 初始化 -> '+initTitles);
  // (2) 改动并保存，应 push 到 /api/push
  const push=await send('Runtime.evaluate',{expression:'(function(){DB.tasks.push({id:uid(),title:"SYNC_PUSH_TEST",pri:"P1",due:"2026-08-11",done:false,projectId:null,repeat:"none",repEnd:"never",repIdx:1,createdAt:"2026-08-11",overdue:false,rollCount:0,origDue:null});save();return "ok";})()',returnByValue:true});
  await sleep(1200);
  const st=await (await fetch('http://127.0.0.1:'+PORT+'/api/state')).json();
  const stTitles=(st.db&&st.db.tasks)?st.db.tasks.map(t=>t.title).join('|'):'';
  console.log((stTitles.indexOf('SYNC_PUSH_TEST')>=0?'PASS':'FAIL')+': (2) 保存后 push 到服务端 -> '+stTitles);
  const allPass=initTitles.indexOf('FILE_PERSIST_TASK')>=0 && stTitles.indexOf('SYNC_PUSH_TEST')>=0;
  ws.close();try{proc.kill();}catch(e){}
  setTimeout(()=>{try{require('fs').rmSync(PROFILE,{recursive:true,force:true});}catch(e){}
    process.exit(allPass?0:1);},800);
})();

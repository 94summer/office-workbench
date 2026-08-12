/* CDP 驱动 headless Edge 跑「配置文件数据源」集成测试（注入 mock C# 桥）
   验证：save() 自动写回、另存为、重新加载、xlsx base64 往返、bootFromConfig 自动载入。
   临时文件，不进最终产物。 */
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9341, URL='file:///C:/Users/admin/WorkBuddy/个人工作台2/办公工作台.html';
const PROFILE='C:\\Users\\admin\\WorkBuddy\\个人工作台2\\__cfg_'+Date.now();
const proc=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run',
  '--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const mockSrc=`(function(){var ls=window.localStorage;
  var getF=function(p){try{return JSON.parse(ls.getItem('__mf__'+p));}catch(e){return null;}};
  var setF=function(p,o){ls.setItem('__mf__'+p,JSON.stringify(o));};
  var L=[];
  var wv={addEventListener:function(t,cb){if(t==='message')L.push(cb);},
    postMessage:function(msg){setTimeout(function(){
      var m=msg,resp={id:m.id};
      try{
        if(m.action==='readConfig'){var f=getF(m.path);resp=f?{id:m.id,ok:true,text:f.text}:{id:m.id,ok:false,error:'no'};}
        else if(m.action==='writeConfig'){setF(m.path,{text:m.text,binary:m.binary});resp={id:m.id,ok:true};}
        else if(m.action==='pickOpen'){var p=window.__pickOpenPath;var f2=getF(p)||{text:window.__pickOpenText,binary:/\\.xlsx$/i.test(p)};resp={id:m.id,ok:true,path:p,text:f2.text,bin:f2.binary};}
        else if(m.action==='pickSave'){resp={id:m.id,ok:true,path:window.__pickSavePath};}
      }catch(e){resp={id:m.id,ok:false,error:String(e)};}
      L.forEach(function(cb){cb({data:JSON.stringify(resp)});});
    },0);}};
  window.chrome={webview:wv};
  window.__mockFile=function(p){return getF(p);};
  window.__setMockFile=function(p,o){setF(p,o);};
})();`;

async function assertions(){
  const R=[];const ok=(c,m)=>R.push((c?'PASS':'FAIL')+': '+m);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const fileText=p=>{const f=window.__mockFile(p);return f?f.text:null;};
  // A) JSON 另存为
  window.__pickSavePath='C:/cfg/test.json';
  await saveAsConfigFile();await wait(600);
  let t=fileText('C:/cfg/test.json');
  ok(!!t && t.indexOf('每日站会')>=0,'A JSON 另存为写入文件');
  // B) 自动写回
  DB.tasks.push({id:'aw1',title:'AUTO_WRITE_X',pri:'P1',due:'2026-08-11',done:false,projectId:null,repeat:'none',repEnd:'never',repIdx:1,createdAt:'2026-08-11',overdue:false,rollCount:0,origDue:null});
  save();await wait(700);
  t=fileText('C:/cfg/test.json');
  ok(!!t && t.indexOf('AUTO_WRITE_X')>=0,'B save() 自动写回 JSON 文件');
  // C) 重新加载（外部修改）
  const obj=JSON.parse(t);obj.tasks[0].title='EXTERNAL_EDIT_Y';
  window.__setMockFile('C:/cfg/test.json',{text:JSON.stringify(obj),binary:false});
  await reloadConfigFile();
  ok(DB.tasks.some(x=>x.title==='EXTERNAL_EDIT_Y'),'C 重新加载应用外部修改');
  // D) xlsx 另存为 + 写回 + 重载
  window.__pickSavePath='C:/cfg/test.xlsx';
  await saveAsConfigFile();await wait(600);
  let xt=fileText('C:/cfg/test.xlsx');
  ok(!!xt && xt.length>50,'D xlsx 另存为写入(base64)');
  const u8=b64ToBytes(xt);const px=await parseWorkbook(u8);
  ok(px.ts.length===DB.tasks.length+1,'D xlsx base64 可解析且含全部任务');
  DB.tasks.push({id:'aw2',title:'AUTO_WRITE_XLSX',pri:'P2',due:'2026-08-11',done:false,projectId:null,repeat:'none',repEnd:'never',repIdx:1,createdAt:'2026-08-11',overdue:false,rollCount:0,origDue:null});
  save();await wait(700);
  xt=fileText('C:/cfg/test.xlsx');
  ok(!!xt && b64ToBytes(xt).length>u8.length,'D xlsx 写回后体积增大(含新任务)');
  const px2=await parseWorkbook(b64ToBytes(xt));
  ok(px2.ts.some(r=>String(r[0]).indexOf('AUTO_WRITE_XLSX')>=0),'D xlsx 写回含新任务');
  window.__setMockFile('C:/cfg/test.xlsx',{text:xt,binary:true});
  await reloadConfigFile();
  ok(DB.tasks.some(x=>x.title==='AUTO_WRITE_XLSX'),'D xlsx 重新加载还原新任务');
  // E) bootFromConfig 从文件载入整库
  window.__setMockFile('C:/cfg/boot.json',{text:JSON.stringify({version:1,tasks:[{id:'s1',title:'SENTINEL_BOOT',pri:'P1',due:'2026-08-11',done:false,projectId:null,repeat:'none',repEnd:'never',repIdx:1,createdAt:'2026-08-11',overdue:false,rollCount:0,origDue:null}],notes:[],projects:[],settings:{sedEnabled:false,sedMin:45,sedRest:5,sedSound:true,sedCount:0,sedDone:0,sedDay:'2026-08-11',sedStart:0},meta:{sample:false}}),binary:false});
  CONFIG_BIND={path:'C:/cfg/boot.json',mode:'json'};
  await bootFromConfig();
  ok(DB.tasks.some(x=>x.title==='SENTINEL_BOOT'),'E bootFromConfig 从文件载入整库');
  return R.join(' ||| ');
}

(async()=>{
  let target=null;
  for(let i=0;i<30;i++){await sleep(500);
    try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();target=l.find(t=>t.type==='page');if(target)break;}catch(e){}}
  if(!target){console.log('FAIL 无法连接 CDP');try{proc.kill();}catch(e){}process.exit(1);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  let id=0;const w=new Map();
  const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id);}});
  await new Promise(r=>ws.addEventListener('open',r));
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:mockSrc});
  await send('Page.navigate',{url:URL});
  await sleep(3500);
  const out=await send('Runtime.evaluate',{expression:'('+assertions.toString()+')()',awaitPromise:true,returnByValue:true});
  const txt=(out.result&&out.result.value)||'(空)';
  const rows=txt.split(' ||| ').map(s=>s.trim()).filter(Boolean);
  let pass=0;
  rows.forEach(r=>{if(r.startsWith('PASS'))pass++;console.log(r);});
  console.log(`\n==== ${pass}/${rows.length} 通过 ====`);
  ws.close();try{proc.kill();}catch(e){}
  setTimeout(()=>{try{require('fs').rmSync(PROFILE,{recursive:true,force:true});}catch(e){}
    process.exit(pass===rows.length?0:1);},800);
})();

/* 版本管理 / 需求管理 集成冒烟测试：DOM 桩 + 模拟 C# 桥，跑真实模块代码（不启动 GUI、不碰任何用户原始文件）。
   测试夹具由 app 自身的 buildWorkbookBytes 现造，往返验证，完全隔离。 */
const vm=require('vm');
const fs=require('fs');

/* ---- 元素桩 ---- */
const registry={};
function makeEl(key){
  const store={_html:'',_key:key,value:'',textContent:'',scrollTop:0,onclick:null,onchange:null,className:''};
  const el=new Proxy(store,{
    get(t,p){
      if(p in t)return t[p];
      if(p==='classList')return {add(){},remove(){},toggle(){},contains:c=>t._key==='#p-market'&&c==='on'};
      if(p==='dataset')return t.dataset||(t.dataset={});
      if(p==='style')return t.style||(t.style={});
      if(p==='files')return [];
      if(p==='appendChild'||p==='addEventListener'||p==='removeEventListener'||p==='focus'||p==='select'||p==='click'||p==='remove'||p==='setAttribute'||p==='getAttribute')return ()=>{};
      if(p==='querySelector')return ()=>makeEl(key+'>q');
      if(p==='querySelectorAll')return ()=>[];
      if(p==='closest')return ()=>null;
      return makeEl(key+'>'+String(p));
    },
    set(t,p,v){t[p]=v;return true;}
  });
  return el;
}
function getEl(key){return registry[key]||(registry[key]=makeEl(key));}
const documentStub={
  getElementById:id=>getEl('#'+id),
  querySelector:sel=>getEl(sel),
  querySelectorAll:()=>[],
  createElement:()=>makeEl('new'),
  addEventListener:()=>{},
};

/* ---- 模拟 C# 桥（可被测试重新指向夹具） ---- */
let rpcMock=async(msg)=>({id:msg.id,ok:true});
const webviewListeners=[];
const webviewStub={
  addEventListener:(ev,cb)=>{if(ev==='message')webviewListeners.push(cb);},
  postMessage:(msg)=>{
    const m=typeof msg==='string'?JSON.parse(msg):msg;
    Promise.resolve(rpcMock(m)).then(r=>{webviewListeners.forEach(l=>l({data:JSON.stringify(r)}));});
  }
};

const ctx={TextDecoder,TextEncoder,btoa,atob,Response,DecompressionStream,console,
  Blob:class{constructor(){}},
  setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},requestAnimationFrame:cb=>setTimeout(cb,0),
  localStorage:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}},
  document:documentStub,
  window:{chrome:{webview:webviewStub},scrollTo:()=>{},addEventListener:()=>{},open:()=>{}},
  navigator:{userAgent:'node'},location:{href:''},URL:{createObjectURL:()=>'blob:x',revokeObjectURL:()=>{}},
  History:{},fetch:()=>Promise.resolve({json:()=>Promise.resolve({})})};
ctx.globalThis=ctx;
vm.createContext(ctx);

const html=fs.readFileSync('办公工作台.html','utf8');
const big=html.substring(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
vm.runInContext(big,ctx);

let fail=0;
function ok(c,m){console.log((c?'  ✅':'  ❌')+' '+m);if(!c)fail++;}

/* 现造夹具：app 自身的序列化器生成 xlsx，再解析回来，完全隔离 */
const fixtureRows=[['产品','版本','状态','说明'],['密码机','V1.0','open','首版\n第二行'],['网关','V2.0','closed','已发布']];
const wbBytes=ctx.buildWorkbookBytes([['版本跟踪',fixtureRows]]);
const fixtureB64=ctx.bytesToB64(wbBytes);

(async()=>{
  console.log('[T1] 模块与标签页结构');
  const vC=ctx.tkTab('version','crypto'), vD=ctx.tkTab('version','dsec'), vT=ctx.tkTab('version','term');
  const rC=ctx.tkTab('requirement','crypto'), rD=ctx.tkTab('requirement','dsec'), rT=ctx.tkTab('requirement','term');
  ok(!!(vC&&vD&&vT&&rC&&rD&&rT),'版本管理/需求管理 各含 3 个产品类别 tab（密码/数据安全/终端安全 产品）');
  ok(vC!==rC,'两模块状态互相独立（不同实例）');
  ok(!!(vC.path&&vD.path&&vT.path),'每个 tab 已预置默认数据源路径（指向给定的 .dbt 文件）');

  console.log('\n[T2] xlsx 解析（含多行换行）');
  const parsed=await ctx.tkParse('fixture.xlsx',wbBytes);
  ok(parsed.rows.length===3,'解析出 3 行（含表头）');
  ok(parsed.rows[1][0]==='密码机'&&parsed.rows[2][1]==='V2.0','单元格内容正确');
  ok(parsed.rows[1][3]==='首版\n第二行','多行单元格的换行 \\n 被原样保留');

  console.log('\n[T3] WPS 在线文件桩检测');
  const stub=new Uint8Array([0x71,0x6f,0x6e,0x6c,0x69,0x6e,0x65,0x00,0x02,0x00,0x00,0x00,0x18]);
  let threw=false,code='';
  try{await ctx.tkParse('x.dbt.wpsonline',stub);}catch(e){threw=true;code=e.code;}
  ok(threw&&code==='WPS_ONLINE','WPS 云「在线文件」桩被识别并抛 WPS_ONLINE（不误当数据解析）');

  console.log('\n[T4] 自定义展示列');
  ctx.tkLoad();
  const tab=ctx.tkTab('version','crypto');
  tab.cols=['产品','版本','状态','说明'];tab.rows=JSON.parse(JSON.stringify(fixtureRows));tab.colShow=null;
  const all=ctx.tkShowCols(tab);
  ok(all.length===4&&all.join()==='0,1,2,3','默认展示全部 4 列');
  tab.colShow=[0,2];const sub=ctx.tkShowCols(tab);
  ok(sub.join()==='0,2','自定义列生效（仅展示 0、2 两列）');
  tab.colShow=null;

  console.log('\n[T5] 序列化往返（xlsx 写回再读一致）');
  const ser=ctx.tkSerialize(tab);
  ok(ser.ext==='xlsx','tkSerialize 生成 xlsx');
  const rep=await ctx.tkParse('out.xlsx',ser.bytes);
  ok(rep.rows.length===3&&rep.rows[1][0]==='密码机','往返后行数/内容一致');
  ok(rep.rows[1][3]==='首版\n第二行','往返保留多行换行（读写一致）');

  console.log('\n[T6] 配置数据源（只读加载，不回写原文件）');
  rpcMock=(msg)=>{if(msg.action==='mkPickTable'||msg.action==='mkRead')return {id:msg.id,ok:true,path:'D:/fixture.xlsx',name:'fixture.xlsx',text:fixtureB64,binary:true};return {id:msg.id,ok:true};};
  await ctx.tkConfigSource('version','crypto');
  const t2=ctx.tkTab('version','crypto');
  ok(t2.rows.length===3&&t2.cols[0]==='产品','tkConfigSource 通过 mkPickTable 只读加载数据源');
  ok(t2.path==='D:/fixture.xlsx','数据源路径已记录（用于导出副本，不回写）');

  console.log('\n[T7] 页面渲染（标签页与工具按钮）');
  getEl('#tkRoot-version').dataset.built=undefined;          // 允许重新渲染
  ctx.tkRender('version');
  const rootHtml=getEl('#tkRoot-version').innerHTML;
  ok(/密码产品/.test(rootHtml)&&/数据安全产品/.test(rootHtml)&&/终端安全产品/.test(rootHtml),'渲染出 3 个产品类别标签页（密码/数据安全/终端安全 产品）');
  ok(/配置数据源/.test(rootHtml)&&/列设置/.test(rootHtml)&&/导出副本/.test(rootHtml),'渲染出 配置数据源 / 列设置 / 导出副本 按钮');

  console.log('\n[T8] 需求管理模块独立（与版本管理互不影响）');
  const rtab=ctx.tkTab('requirement','dsec');
  rtab.cols=['需求','优先级'];rtab.rows=[['需求','优先级'],['A','高'],['B','中']];rtab.colShow=[0];
  ok(ctx.tkShowCols(rtab).join()==='0','需求管理(数据安全) 的自定义列独立于版本管理');
  ok(ctx.tkTab('version','crypto').rows.length===3,'版本管理数据未被需求管理改动');

  console.log('\n==== 结果：'+(fail===0?'全部通过 ✅':(fail+' 项失败 ❌'))+' ====');
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('测试异常：',e);process.exit(2);});

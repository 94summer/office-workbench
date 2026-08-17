/* 全量集成冒烟测试：用 DOM 桩 + 模拟 C# 桥，跑真实模块代码（不启动 GUI、不碰用户数据） */
const vm=require('vm');
const fs=require('fs');

/* ---- 元素桩：吸收任意属性/方法调用 ---- */
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

/* ---- 模拟 C# 桥：按 action 返回结果，并通过 window.chrome.webview.postMessage 闭环回包 ---- */
const samplePath='C:/Users/admin/Downloads/市场项目跟踪表.xlsx';
const sampleB64=fs.readFileSync(samplePath).toString('base64');
let lastWrite=null;
const rpcMock=async(msg)=>{
  switch(msg.action){
    case 'mkPickDir':return {id:msg.id,ok:true,path:'D:/市场数据'};
    case 'mkListDir':return {id:msg.id,ok:true,path:msg.path,files:[{name:'市场项目跟踪表.xlsx',path:'D:/市场数据/市场项目跟踪表.xlsx',size:sampleB64.length,mtime:'2024-09-01 10:00',ext:'xlsx'}]};
    case 'mkRead':return {id:msg.id,ok:true,path:msg.path,text:sampleB64};
    case 'mkWrite':lastWrite={path:msg.path,bytes:Buffer.from(msg.text,'base64').length};return {id:msg.id,ok:true,path:msg.path,bak:msg.path+'.bak'};
    case 'mkSaveInto':return {id:msg.id,ok:true,path:(msg.path||'')+'/副本.xlsx',name:'副本.xlsx'};
    case 'mkPickTable':return {id:msg.id,ok:true,path:samplePath,name:'市场项目跟踪表.xlsx',text:sampleB64,binary:true};
    case 'mkReveal':return {id:msg.id,ok:true};
    default:return {id:msg.id,ok:true};
  }
};
const webviewListeners=[];
const webviewStub={
  addEventListener:(ev,cb)=>{if(ev==='message')webviewListeners.push(cb);},
  postMessage:(msg)=>{
    const m=typeof msg==='string'?JSON.parse(msg):msg;
    Promise.resolve(rpcMock(m)).then(r=>{webviewListeners.forEach(l=>l({data:JSON.stringify(r)}));});
  }
};

const ctx={TextDecoder,TextEncoder,btoa,atob,Response,DecompressionStream,console,
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

let fail=0;
function ok(c,m){console.log((c?'  ✅':'  ❌')+' '+m);if(!c)fail++;}

(async()=>{
  console.log('[A] 加载整页脚本（含全部模块）');
  try{vm.runInContext(big,ctx);ok(true,'脚本加载无异常');}
  catch(e){ok(false,'脚本加载抛异常：'+e.message);console.error(e);process.exit(2);}

  console.log('\n[B] 模拟真实操作：选目录 → 打开表格 → 进入市场页');
  try{
    await ctx.mkPickDir();                                   // 选择数据目录（设置 MK.dir）
    await ctx.mkLoadFile('D:/市场数据/市场项目跟踪表.xlsx'); // 读取并解析
    ctx.go('market');                                        // 进入市场页，触发完整渲染
    ok(true,'选目录/打开/进入页面全链路无异常');
  }catch(e){ok(false,'全流程抛异常：'+e.message);console.error(e);process.exit(2);}

  console.log('\n[C] 校验渲染产物');
  console.log('    [debug] active(p-market)='+getEl('#p-market').classList.contains('on')+'  built='+getEl('#mkRoot').dataset.built);
  await ctx.renderMarket();
  const gridHtml=getEl("#mkGrid").innerHTML||'';
  const rootHtml=getEl("#mkRoot").innerHTML||'';
  console.log('    [debug] mkRoot._html 长度='+rootHtml.length+'  mkGrid._html 长度='+gridHtml.length);
  console.log('    [debug] mkRoot 片段='+rootHtml.slice(0,120).replace(/\n/g,' '));
  const bodyHtml=getEl('#mkTbody').innerHTML||'';   // 真实数据落在 tbody（stub 中独立于 #mkGrid）
  ok(gridHtml.length>0,'#mkGrid 已生成表格 HTML（长度='+gridHtml.length+'）');
  ok(rootHtml.includes('市场项目跟踪表.xlsx'),'目录标签显示了数据文件');
  ok(bodyHtml.includes('交通运输部海事局数据安全防护项目'),'表格含真实项目名称（解析正确）');
  ok(gridHtml.includes('记录时间')&&gridHtml.includes('状态'),'表头列正确渲染（含记录时间/状态）');
  ok(!gridHtml.includes('历史进展'),'历史进展默认不展示（已从网格表头隐藏）');
  // 日期应被转换为文本（序列号不再出现）
  ok(!bodyHtml.includes('45555'),'日期序列号已转换为文本（无 45555 残留）');
  ok(bodyHtml.includes('2024-09-20'),'日期已转换为 YYYY-MM-DD（2024-09-20 出现）');

  console.log('\n[C2] 校验新需求：列白名单 / 每列筛选 / 最新进展自动日期续写');
  const MK=vm.runInContext('MK',ctx);   // let 绑定需在同一 context 内求值才能读到
  const showC=ctx.mkShowCols();
  ok(showC.length===9,'白名单仅展示 9 列（历史进展已默认隐藏，实际 '+showC.length+'）');
  ok(!showC.includes(0),'「序号」列已隐藏（索引0不在展示列）');
  const ajHist=MK.cols.findIndex(c=>String(c||'').trim()==='历史进展');
  ok(!showC.includes(ajHist),'「历史进展」实际列不在展示白名单中');
  const ajLatest=MK.cols.findIndex(c=>String(c||'').trim()==='最新进展');
  ok(ajLatest>=0&&ajHist>=0,'定位到最新进展/历史进展实际列');
  let eri=-1;for(let i=1;i<MK.rows.length;i++){if(!MK.rows[i][ajLatest]||String(MK.rows[i][ajLatest]).trim()===''){eri=i;break;}}
  if(eri<0)eri=1;
  const beforeHist=MK.rows[eri][ajHist]||'';
  ctx.mkSetLatest(eri,ajLatest,'完成首轮联调测试');
  const d=new Date(),exp=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}：完成首轮联调测试`;
  ok(MK.rows[eri][ajLatest]===exp,'最新进展自动加当前日期前缀 → '+MK.rows[eri][ajLatest]);
  ok(MK.rows[eri][ajHist].startsWith(exp)&&(beforeHist===''||MK.rows[eri][ajHist].endsWith(beforeHist.replace(/\n$/,''))),'历史进展最前面续写带日期内容');
  // 行点击详情：打开弹窗后保存，应落到同一行（用 mkOpenDetail 验证不抛异常且能触发保存）
  try{ctx.mkOpenDetail(eri);ok(true,'mkOpenDetail(行) 调用无异常（详情弹窗已就绪）');}catch(e){ok(false,'mkOpenDetail 抛异常：'+e.message);}

  console.log('\n[C3] 顶部「进行中项目数」= 市场表状态列 open 数量');
  const sIdx=MK.cols.findIndex(c=>String(c||'').trim()==='状态');
  ok(sIdx>=0,'定位到「状态」列（索引 '+sIdx+'）');
  if(sIdx>=0){
    // 重置为可计数状态：偶数行 open / 奇数行 closed，另置一行中文「进行中」
    for(let i=1;i<MK.rows.length;i++)MK.rows[i][sIdx]=(i%2===0?'open':'closed');
    MK.rows[1][sIdx]='进行中';           // 中文同义词也应被计入
    const expOpen=Math.floor((MK.rows.length-1)/2)+1;   // 偶数行+i=1 的「进行中」
    ok(ctx.mkOpenCount()===expOpen,'mkOpenCount 统计 open+进行中 = '+ctx.mkOpenCount()+'（预期 '+expOpen+'）');
    // 不含 open 的行不应被计入
    MK.rows[2][sIdx]='done';
    ok(ctx.mkOpenCount()===expOpen-1,'非 open 状态（done）不计入 → '+ctx.mkOpenCount());
  }
  vm.runInContext('mkFilters={};mkFilters['+ajLatest+']="完成首轮联调测试"', ctx);
  const fdr=ctx.mkDisplayRows();
  ok(fdr.length>=1&&fdr.every(r=>String(r[ajLatest]||'').includes('完成首轮联调测试')),'每列筛选生效（仅返回匹配行，共 '+fdr.length+' 行）');
  vm.runInContext('mkFilters={}', ctx);

  console.log('\n[C4] 校验本次优化：状态下拉 / 富文本 / 自定义列 / 对比指标');
  // 状态列渲染为下拉枚举
  const sIdx2=MK.cols.findIndex(c=>String(c||'').trim()==='状态');
  ok(sIdx2>=0,'定位到「状态」列（C4）');
  const dBody=ctx.mkDetailBody(eri);
  ok(dBody.includes(`data-mkj="${sIdx2}"`)&&dBody.includes('<select'),'状态列渲染为下拉枚举 <select data-mkj="'+sIdx2+'">');
  const statusOpts=vm.runInContext('mkStatusOptions',ctx);
  ok(Array.isArray(statusOpts)&&statusOpts.length>=5,'状态枚举至少 5 个选项（实际 '+(statusOpts?statusOpts.length:0)+'）');
  // 富文本：图片 / 链接 / 防 XSS
  const rich=ctx.mkRichHtml('参考图 https://x.com/a.png\n普通链接 https://example.com/doc?id=1&b=2');
  ok(rich.includes('<img')&&rich.includes('https://x.com/a.png'),'图片 URL 渲染为 <img>');
  ok(rich.includes('<a href="https://example.com/doc'),'普通链接渲染为 <a>（含 &amp; 转义仍可用）');
  ok(!ctx.mkRichHtml('<script>alert(1)</script>').includes('<script>'),'富文本对 <script> 转义防 XSS');
  // 自定义展示列
  const pIdx=MK.cols.findIndex(c=>String(c||'').trim()==='项目名称');
  vm.runInContext('MK.colShow=['+pIdx+','+sIdx2+']', ctx);
  const custom=ctx.mkShowCols();
  ok(custom.length===2&&custom.includes(pIdx)&&custom.includes(sIdx2),'自定义列设置生效（仅 2 列）');
  vm.runInContext('MK.colShow=null', ctx);
  ok(ctx.mkShowCols().length===9,'恢复默认后回到 9 列白名单');
  // 对比指标
  const mst=ctx.mkMarketStats();
  ok(mst.total===MK.rows.length-1,'mkMarketStats.total = 总行数-1（'+mst.total+'）');
  ok(mst.open+mst.closed===mst.total,'进行中('+mst.open+') + 已关闭('+mst.closed+') = 总数('+mst.total+')');

  console.log('\n[C5] 换行一致性：Excel 的 &#10; ↔ exe 的 \\n（读取/写入/展示三方一致）');
  // 1) 底层 xmlUnesc / xmlEsc 互逆（&#10;→\n，&#13;→\r；真实换行由后续 mkNormNewlines 统一成 \n）
  ok(vm.runInContext('xmlUnesc("a&#10;b")',ctx)==='a\nb','xmlUnesc 把 &#10; 解码成真实换行 \\n');
  ok(vm.runInContext('xmlUnesc("a&#13;b")',ctx)==='a\rb','xmlUnesc 把 &#13; 解码成 \\r（CR）');
  ok(vm.runInContext('xmlEsc("a\\nb")',ctx)==='a&#10;b','xmlEsc 把 \\n 编码成 &#10;（写回 Excel 用）');
  // 2) 全流程：内存里真实 \n → 写 xlsx → 再读回，仍为真实 \n（且不含字面量 &#10;）
  const savedMK=JSON.stringify(MK);   // 备份，便于后面还原现场
  const ajH=MK.cols.findIndex(c=>String(c||'').trim()==='历史进展');
  ok(ajH>=0,'定位到「历史进展」列（C5）');
  MK.rows[1][ajH]='首条：联调通过\n第二条：待生产验证';
  const ser=ctx.mkSerialize();
  ok(ser.ext==='xlsx','mkSerialize 生成 xlsx（当前文件为 xlsx）');
  const reparsed=await ctx.mkParseXlsx(ser.bytes);
  const repRows=reparsed[0].rows;
  const hj=repRows[0].findIndex(h=>String(h||'').trim()==='历史进展');
  ok(hj>=0,'回读表格定位到历史进展列');
  if(hj>=0){
    const cell=repRows[1][hj];
    ok(cell==='首条：联调通过\n第二条：待生产验证','回读单元格换行保持一致（含真实 \\n，非字面量）');
    ok(!String(cell).includes('&#10;')&&!String(cell).includes('&#13;'),'回读后不含字面量 &#10;/&#13; 实体');
  }
  // 3) 兜底：旧 localStorage 里的字面量 &#10; 在 mkLoad 时被还原为 \n
  const MKEY=vm.runInContext('MKEY',ctx);
  ctx.localStorage.setItem(MKEY,JSON.stringify({cols:['历史进展'],rows:[['历史进展'],['第一行&#10;第二行']]}));
  vm.runInContext('MK=null',ctx);
  const loaded=ctx.mkLoad();
  ok(loaded.rows[1][0]==='第一行\n第二行','mkLoad 把遗留的字面量 &#10; 还原成真实换行 \\n');
  // 还原现场，避免影响 [D]
  vm.runInContext('MK=JSON.parse('+JSON.stringify(savedMK)+')',ctx);

  console.log('\n[D] 校验自动保存写回了目录副本');
  ctx.mkAddRow();                   // 触发一次编辑 → 自动保存
  await new Promise(r=>setTimeout(r,600));   // 等 400ms 防抖
  ok(lastWrite&&lastWrite.path==='D:/市场数据/市场项目跟踪表.xlsx','mkWrite 写入目标=数据目录副本');
  ok(lastWrite&&lastWrite.bytes>0,'写入字节数>0（bytes='+(lastWrite&&lastWrite.bytes)+'）');

  console.log('\n'+(fail===0?'✅ 集成冒烟全部通过':'❌ 有 '+fail+' 项失败'));
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('测试异常：',e);process.exit(2);});

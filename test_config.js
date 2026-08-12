/* 配置文件数据源：序列化/解析/写回 纯函数单测（Node vm 沙箱）
   目的：验证 JSON 与 Excel(xlsx) 两种配置文件格式能完整往返还原整库。临时文件，不进最终产物。 */
const fs=require('fs');const vm=require('vm');
const dir='C:/Users/admin/WorkBuddy/个人工作台2';
const strip=s=>{s=s.trim();if(s.startsWith('<script>'))s=s.slice(8);if(s.endsWith('</script>'))s=s.slice(0,-9);return s.trim();};
const src=['03_core.js','04_render_a.js','05_render_b.js','06_app.js','07_file.js']
  .map(f=>strip(fs.readFileSync(dir+'/src/'+f,'utf8'))).join('\n\n');

const noop=()=>{};
function fakeEl(){return{innerHTML:'',textContent:'',value:'',style:{},dataset:{},
  classList:{toggle:noop,add:noop,remove:noop,contains:()=>false},
  addEventListener:noop,removeEventListener:noop,appendChild:noop,remove:noop,
  querySelector:()=>fakeEl(),querySelectorAll:()=>[],closest:()=>null,focus:noop,click:noop,
  onclick:null,onchange:null,files:[],getContext:()=>null};}
const store=new Map();
const ctx={
  console,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  document:{querySelector:()=>fakeEl(),querySelectorAll:()=>[],getElementById:()=>fakeEl(),createElement:()=>fakeEl(),addEventListener:noop,body:fakeEl()},
  window:{addEventListener:noop,chrome:null,showSaveFilePicker:undefined,prompt:undefined},
  navigator:{clipboard:{writeText:async()=>{}}},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  setTimeout,setInterval,clearTimeout,clearInterval,
  TextEncoder,TextDecoder,Blob,URL,Response,DecompressionStream,Date,Math,JSON,Object,Array,String,Number,Boolean,parseInt,parseFloat,isNaN,Uint8Array,ArrayBuffer,DataView,Map,Set,Promise,Error
};
vm.createContext(ctx);
vm.runInContext(src,ctx,{filename:'app-bundle.js'});

const assert=`
(async()=>{
  const out={pass:0,fail:0,log:[]};
  const ok=(c,m)=>{if(c)out.pass++;else{out.fail++;out.log.push('FAIL: '+m);}};
  // 1) JSON 往返
  const j=dbToContent('json');
  const o=JSON.parse(j);
  ok(o.tasks && o.tasks.length===DB.tasks.length,'json 任务条数一致');
  ok(o.notes.length===DB.notes.length && o.projects.length===DB.projects.length,'json 灵感/项目条数一致');
  applyData(o,'测试');
  ok(DB.tasks.length===o.tasks.length,'applyData 还原任务');
  // 2) xlsx 往返
  const bytes=dbToContent('xlsx');
  ok(bytes instanceof Uint8Array && bytes.length>100,'xlsx 生成字节');
  const parsed=await parseWorkbook(bytes);
  ok(parsed.ts.length===DB.tasks.length+1,'xlsx 待办表含表头+数据');
  ok(parsed.cfg.length>=2,'xlsx 含配置表');
  const before=DB.tasks.length, beforeN=DB.notes.length;
  await loadDbFromConfigFile(bytes,'xlsx');
  ok(DB.tasks.length===before,'xlsx 还原任务条数');
  ok(DB.notes.length===beforeN,'xlsx 还原灵感条数');
  ok(DB.projects.length>0,'xlsx 还原项目');
  // 3) base64
  const rb=new Uint8Array([1,2,3,250,128,0,255,77]);
  const back=b64ToBytes(bytesToB64(rb));
  ok(back.length===rb.length && back.every((v,i)=>v===rb[i]),'base64 往返');
  // 4) detectMode
  ok(detectMode('a.xlsx')==='xlsx' && detectMode('a.json')==='json' && detectMode('a.txt')==='json','detectMode');
  // 5) applyConfigSheet 合并设置
  DB.settings.sedMin=99;DB.settings.sedSound=true;
  applyConfigSheet([['配置项','值'],['久坐提醒间隔(分钟)',30],['提示音','关'],['完整数据(JSON,请勿手动修改)','x']]);
  ok(DB.settings.sedMin===30,'applyConfigSheet 间隔');
  ok(DB.settings.sedSound===false,'applyConfigSheet 提示音');
  // 6) FileIO 在 Node 无桥
  ok(FileIO.webview===null,'Node 下 FileIO 无桥');
  ok(typeof scheduleFileSync==='function','scheduleFileSync 已定义');
  return out;
})();
`;
(async()=>{
  let res;
  try{res=await vm.runInContext(assert,ctx,{filename:'assert.js'});}
  catch(e){console.error('运行异常：',e);process.exit(1);}
  console.log('通过 '+res.pass+' / 失败 '+res.fail);
  if(res.log.length)console.log(res.log.join('\n'));
  process.exit(res.fail?1:0);
})();

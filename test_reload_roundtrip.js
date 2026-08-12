// Round-trip test: build xlsx via taskRows()/buildWorkbookBytes(), then parseWorkbook()/applyStructured()
const fs=require('fs');
const vm=require('vm');

const html=fs.readFileSync('办公工作台.html','utf8');
// extract the <script> blocks (the app code). Strip the leading <script> and trailing </script>.
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let code=scripts.join('\n');

// Strip any explicit <script> tags if present inside
code=code.replace(/<\/?script[^>]*>/g,'');

// Mock DOM / browser globals used by the code paths we will NOT call, but that are referenced at definition time? 
// We only call pure functions; provide stubs to be safe.
const noop=()=>{};
const elStub={textContent:'',innerHTML:'',style:{},value:'',appendChild:noop,remove:noop,classList:{toggle:noop,add:noop,remove:noop},addEventListener:noop,onclick:null,oninput:null,querySelector:()=>elStub,querySelectorAll:()=>[],closest:()=>null,dataset:{},files:[],click:noop};
const documentStub={getElementById:()=>elStub,querySelector:()=>elStub,querySelectorAll:()=>[],createElement:()=>elStub,body:elStub,addEventListener:noop};
const localStorageStub={_d:{},getItem(k){return this._d[k]||null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}};
const windowStub={};

const sandbox={
  console,document:documentStub,localStorage:localStorageStub,window:windowStub,
  $:()=>elStub,$$:()=>[],setTimeout,clearTimeout,setInterval,clearInterval,
  fetch:()=>Promise.reject(new Error('no fetch')),
  TextEncoder,TextDecoder,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  Response,DecompressionStream,
  Uint8Array,DataView,ArrayBuffer,Math,JSON,Date,Object,Array,String,Number,Boolean,parseInt,parseFloat,isNaN,RegExp,
  navigator:{},location:{protocol:'http:',hostname:'127.0.0.1',href:'http://127.0.0.1:9876/'},
  toast:(m,t)=>console.log('[toast]',t||'',m),
  renderAll:noop,renderTodo:noop,renderNote:noop,renderProj:noop,renderCal:noop,renderReview:noop,renderBanner:noop,renderSetting:noop,renderInspire:noop,
  totalCount:()=> (sandbox.DB.tasks.length+sandbox.DB.notes.length+sandbox.DB.projects.length),
  uid:()=>'u'+Math.random().toString(36).slice(2,9),
  TODAY:()=>'2026-08-11',fmtNow:()=>'2026-08-11 10:00',fmtTime:()=>'2026-08-11 10:00',pad:n=>String(n).padStart(2,'0'),
  esc:s=>s,
};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);

// Set up a DB with a couple of tasks
sandbox.DB={version:1,
  tasks:[
    {id:'t1',title:'完成季度报表',pri:'P1',due:'2026-08-15',remind:'09:00',lead:'1d',repeat:'weekly',repEnd:'count',repTotal:4,repUntil:'',repIdx:2,projectId:null,note:'先看上月',done:false,doneAt:'',rollCount:0,createdAt:'2026-08-01',overdue:false,origDue:null},
    {id:'t2',title:'',pri:'P0',due:'',remind:'',lead:'',repeat:'none',repEnd:'never',repUntil:'',repTotal:null,repIdx:1,projectId:null,note:'',done:true,doneAt:'2026-08-10',rollCount:0,createdAt:'2026-08-02',overdue:false,origDue:null}
  ],
  notes:[{id:'n1',content:'灵感一',tags:['idea'],createdAt:'2026-08-03',updatedAt:''}],
  projects:[{id:'p1',name:'项目A',stage:'设计',next:'评审',blocker:'',status:'active',createdAt:'2026-08-01',updatedAt:'2026-08-04'}],
  settings:{sedEnabled:false,sedMin:45,sedRest:5,sedSound:true},
  meta:{sample:false}
};

const buildWorkbookBytes=sandbox.buildWorkbookBytes;
const taskRows=sandbox.taskRows, noteRows=sandbox.noteRows, projRows=sandbox.projRows, cfgRows=sandbox.cfgRows;
const parseWorkbook=sandbox.parseWorkbook;

(async()=>{
  // Build xlsx from the code's internal (embedded sample) DB via taskRows()
  const xlsx=buildWorkbookBytes([['待办',taskRows()],['灵感',noteRows()],['项目',projRows()],['配置',cfgRows()]]);
  console.log('xlsx bytes:',xlsx.length);

  const {jsonObj,ts,ns,ps,cfg}=await parseWorkbook(xlsx);
  console.log('jsonObj?',!!jsonObj, '| ts rows:',ts.length);
  if(ts.length){ console.log('header:',JSON.stringify(ts[0])); console.log('row1 :',JSON.stringify(ts[1])); }

  // Simulate reload: applyStructured mutates the code's internal DB; verify by re-reading taskRows()
  sandbox.applyStructured(ts,ns,ps);
  console.log('\n=== AFTER applyStructured (re-read via taskRows) ===');
  const out=taskRows();
  out.slice(1).forEach((r,i)=>console.log(`task${i}: title=${JSON.stringify(r[0])} pri=${r[1]} due=${r[2]} repeat=${r[5]}`));

  // Second round-trip: write the re-read data again, ensure stable
  const xlsx2=buildWorkbookBytes([['待办',out],['灵感',noteRows()],['项目',projRows()],['配置',cfgRows()]]);
  const p2=await parseWorkbook(xlsx2);
  const o2=taskRows();
  console.log('\n=== round 2 ===');
  o2.slice(1).forEach((r,i)=>console.log(`task${i}: title=${JSON.stringify(r[0])} pri=${r[1]}`));
})().catch(e=>{console.error('ERR',e);});

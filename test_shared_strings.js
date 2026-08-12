// Simulate an Excel-saved xlsx (shared strings t="s") and verify parseWorkbook reads text correctly.
const fs=require('fs');const vm=require('vm');
const html=fs.readFileSync('办公工作台.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let code=scripts.join('\n').replace(/<\/?script[^>]*>/g,'');
const noop=()=>{};
const elStub={textContent:'',innerHTML:'',style:{},value:'',appendChild:noop,remove:noop,classList:{toggle:noop,add:noop,remove:noop},addEventListener:noop,onclick:null,oninput:null,querySelector:()=>elStub,querySelectorAll:()=>[],closest:()=>null,dataset:{},files:[],click:noop};
const documentStub={getElementById:()=>elStub,querySelector:()=>elStub,querySelectorAll:()=>[],createElement:()=>elStub,body:elStub,addEventListener:noop};
const localStorageStub={_d:{},getItem(k){return this._d[k]||null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}};
const sandbox={console,document:documentStub,localStorage:localStorageStub,window:{},
  $:()=>elStub,$$:()=>[],setTimeout,clearTimeout,setInterval,clearInterval,fetch:()=>Promise.reject(new Error('no')),
  TextEncoder,TextDecoder,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  Response,DecompressionStream,Uint8Array,DataView,ArrayBuffer,Math,JSON,Date,Object,Array,String,Number,Boolean,parseInt,parseFloat,isNaN,RegExp,
  navigator:{},location:{protocol:'http:',hostname:'127.0.0.1',href:'http://127.0.0.1:9876/'},
  toast:(m,t)=>console.log('[toast]',t||'',m),renderAll:noop,renderTodo:noop,renderNote:noop,renderProj:noop,renderCal:noop,renderReview:noop,renderBanner:noop,renderSetting:noop,renderInspire:noop,
  totalCount:()=>0,uid:()=>'u'+Math.random().toString(36).slice(2,9),TODAY:()=>'2026-08-11',fmtNow:()=>'t',fmtTime:()=>'t',pad:n=>String(n).padStart(2,'0'),esc:s=>s};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(code,sandbox);

// Build an Excel-style xlsx: shared strings + sheet referencing them by index
const zipStore=sandbox.zipStore, crc32=sandbox.crc32, xmlEsc=sandbox.xmlEsc, concatU=sandbox.concatU, colLetter=sandbox.colLetter;
const enc=new TextEncoder();
// shared strings table (order = index)
const SS=['标题','轻重缓急','截止日期','状态','完成季度报表','重要','2026-08-15','未完成','写周报','一般','2026-08-14'];
const ssXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'+SS.length+'" uniqueCount="'+SS.length+'">'+SS.map(s=>'<si><t xml:space="preserve">'+xmlEsc(s)+'</t></si>').join('')+'</sst>';
// sheet: header row uses shared strings; data rows reference indices
function sheetXml(rows){
  let r='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row,i)=>{const ri=i+1;r+=`<row r="${ri}">`;
    row.forEach((cell,j)=>{const ref=colLetter(j)+ri;
      if(cell==null){r+=`<c r="${ref}"/>`;}
      else if(typeof cell==='number'){r+=`<c r="${ref}"><v>${cell}</v></c>`;}
      else{r+=`<c r="${ref}" t="s"><v>${cell}</v></c>`;}});
    r+='</row>';});
  return r+'</sheetData></worksheet>';
}
const header=['标题','轻重缓急','截止日期','状态'].map(t=>String(SS.indexOf(t)));
const data=[
  ['完成季度报表','重要','2026-08-15','未完成'].map(t=>String(SS.indexOf(t))),
  ['写周报','一般','2026-08-14','未完成'].map(t=>String(SS.indexOf(t))),
];
const sheet=sheetXml([header,...data]);

const ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';
const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="待办" sheetId="1" r:id="rId1"/></sheets></workbook>';
const wbRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
const files=[
  {name:'[Content_Types].xml',data:enc.encode(ct)},
  {name:'_rels/.rels',data:enc.encode(rels)},
  {name:'xl/workbook.xml',data:enc.encode(wb)},
  {name:'xl/_rels/workbook.xml.rels',data:enc.encode(wbRels)},
  {name:'xl/worksheets/sheet1.xml',data:enc.encode(sheet)},
  {name:'xl/sharedStrings.xml',data:enc.encode(ssXml)},
];
const xlsx=zipStore(files);
console.log('excel-style xlsx bytes:',xlsx.length);

const parseWorkbook=sandbox.parseWorkbook;
const applyStructured=sandbox.applyStructured;
(async()=>{
  const {jsonObj,ts,ns,ps,cfg}=await parseWorkbook(xlsx);
  console.log('待办 rows:',ts.length);
  ts.forEach((r,i)=>console.log('row'+i+':',JSON.stringify(r)));
  applyStructured(ts,[],[]);
  console.log('\n=== AFTER applyStructured (via taskRows) ===');
  sandbox.taskRows().slice(1).forEach((r,i)=>console.log(`task${i}: title=${JSON.stringify(r[0])} pri=${r[1]}`));
})().catch(e=>{console.error('ERR',e);}).finally(()=>process.exit(0));

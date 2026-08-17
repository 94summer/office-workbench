<script>
/* ==================== 市场项目跟踪模块 ==================== */
/* 关键隔离原则（与系统其他数据完全解耦）：
   1) 状态只存在独立 localStorage 键 MKEY，绝不读写系统 DB（wb_office_desk_v1）。
   2) 数据文件只读写用户单独指定的「市场数据目录」，通过 C# 桥的 mk* 动作完成，
      复用系统 readConfig/writeConfig 的路径一律不碰。
   3) 导入附件时只把副本复制进数据目录，用户原始附件文件永远不会被改动。
   4) 每次写回前自动生成 .bak 备份，且用「临时文件→替换」方式，避免写一半损坏。 */

const MKEY='wb_market_track_v1';
let MK=null;
let mkSaveTimer=null, mkBusy=false, mkEditInput=null;
let mkQuery='', mkFilters={}, mkSortCol=-1, mkSortDir=1;

const mkBaseName=p=>String(p||'').split(/[\\/]/).pop();

function mkState(){return {dir:'',cur:'',sheet:'',cols:[],rows:[],dirty:false,_files:[],_bak:'',colShow:null};}
function mkLoad(){
  if(MK)return MK;
  try{MK=Object.assign(mkState(),JSON.parse(localStorage.getItem(MKEY)||'{}'));}catch(e){MK=mkState();}
  if(!MK.cols)MK.cols=[]; if(!MK.rows)MK.rows=[]; if(!MK._files)MK._files=[];
  /* 兜底清理：旧版本可能把字面量 &#10;/&#13; 存进了 localStorage，统一还原成真实换行 \n，
     保证「exe 展示」与「Excel 文件」一致（与读取端 xmlUnesc、写入端 xmlEsc 互逆）。 */
  if(MK.rows)MK.rows=MK.rows.map(r=>r.map(c=>typeof c==='string'?mkNormNewlines(c):c));
  if(MK.cols)MK.cols=MK.cols.map(c=>typeof c==='string'?mkNormNewlines(c):c);
  return MK;
}
/* 换行规范化：把 Excel/CSV 里各种换行形态统一成 \n，并清理旧版本遗留的字面量 &#10;/&#13; 实体。
   ① 读取端 xmlUnesc 已能把 &#10; 解码成 \n，这里再兜一层（已存 localStorage 的旧数据、CSV 的 \r\n）；
   ② 与写入端 xmlEsc（\n → &#10;）互逆，保证读 / 写 / 展示三方一致。 */
function mkNormNewlines(s){
  if(typeof s!=='string')return s;
  return s.replace(/&#13;&#10;/gi,'\n').replace(/&#13;/gi,'\n').replace(/&#10;/gi,'\n')
          .replace(/\r\n/g,'\n').replace(/\r/g,'\n');
}
function mkNormalizeRows(rows){return (rows||[]).map(r=>r.map(c=>typeof c==='string'?mkNormNewlines(c):c));}
function mkPersist(){try{localStorage.setItem(MKEY,JSON.stringify(MK||mkState()));}catch(e){}}

/* 展示列：优先用用户自定义（MK.colShow，存实际列索引），否则退回默认白名单。
   返回的是「实际列索引」数组，渲染与编辑都通过它做映射，保证底层数据（含序号）不丢失。 */
function mkShowCols(){
  if(MK.colShow&&MK.colShow.length){
    const valid=MK.colShow.filter(i=>i>=0&&i<MK.cols.length);
    if(valid.length)return valid;
  }
  const names=['产品类别','记录时间','关闭时间','项目名称','涉及产品','支持类型','最新进展','接口人','状态'];
  const out=[];
  names.forEach(nm=>{const idx=MK.cols.findIndex(c=>String(c||'').trim()===nm);if(idx>=0)out.push(idx);});
  return out.length?out:MK.cols.map((_,i)=>i);
}

/* 状态枚举：详情弹窗里「状态」列用下拉选择，避免手填不一致导致 open 统计漏算。
   值用规范英文（open/closed/done/pending/blocked），展示带中文；
   用户历史数据若是中文「进行中」等，会在下拉里自动保留为可选项。 */
const mkStatusOptions=[
  {v:'open',t:'进行中 · open'},
  {v:'closed',t:'已关闭 · closed'},
  {v:'done',t:'已完成 · done'},
  {v:'pending',t:'待启动'},
  {v:'blocked',t:'已卡住'}
];
/* 哪些取值算「进行中」（计入顶部指标）。兼容英文与中文同义词。 */
const mkOpenValues=new Set(['open','ongoing','active','进行中','未关闭','处理中','进行','opened','working']);

/* 顶部「进行中项目数」：统计市场项目跟踪表中「状态」列属于 open 集合的行数。 */
function mkOpenCount(){
  mkLoad();
  if(!MK||!MK.rows||MK.rows.length<2)return 0;
  const sIdx=MK.cols.findIndex(c=>String(c||'').trim()==='状态');
  if(sIdx<0)return 0;
  let n=0;
  for(let i=1;i<MK.rows.length;i++){
    const v=String(MK.rows[i][sIdx]||'').trim().toLowerCase();
    if(mkOpenValues.has(v))n++;
  }
  return n;
}

/* 顶部「对比指标」：市场表整体概览（总数 / 进行中 / 已关闭 / 本周新增 / 本周关闭）。
   日期比较基于「记录时间」「关闭时间」列（导入时已转成 YYYY-MM-DD，可直接按字符串比较）。 */
function mkMarketStats(){
  mkLoad();
  const st={total:0,open:0,closed:0,weekNew:0,weekClosed:0};
  if(!MK||!MK.rows||MK.rows.length<2)return st;
  const sIdx=MK.cols.findIndex(c=>String(c||'').trim()==='状态');
  const rIdx=MK.cols.findIndex(c=>String(c||'').trim()==='记录时间');
  const cIdx=MK.cols.findIndex(c=>String(c||'').trim()==='关闭时间');
  const mon=mondayOf(TODAY()), sun=addDays(mon,7);
  st.total=MK.rows.length-1;
  for(let i=1;i<MK.rows.length;i++){
    const sv=sIdx>=0?String(MK.rows[i][sIdx]||'').trim().toLowerCase():'';
    if(mkOpenValues.has(sv))st.open++; else st.closed++;
    if(rIdx>=0){const rd=String(MK.rows[i][rIdx]||'').trim();if(rd>=mon&&rd<sun)st.weekNew++;}
    if(cIdx>=0){const cd=String(MK.rows[i][cIdx]||'').trim();if(cd>=mon&&cd<sun)st.weekClosed++;}
  }
  return st;
}

/* ---------- 解析：xlsx（按 r 属性对齐列，修复空单元格错位） ---------- */
function mkColIndex(ref){const m=/^([A-Z]+)/.exec(ref||'');if(!m)return 0;let n=0;for(const ch of m[1])n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function mkAlignRows(xml,ss){
  const rows=[];let maxCol=-1;
  const reRow=/<row\b[^>]*>([\s\S]*?)<\/row>/g;let rm;
  while(rm=reRow.exec(xml)){
    const cells={};let rowMax=-1;
    const reC=/<c\b([^>]*?)(?:\/>|>\s*([\s\S]*?)<\/c>)/g;let cm;
    while(cm=reC.exec(rm[1])){
      const attrs=cm[1],inner=cm[2]!==undefined?cm[2]:'';
      const rA=/r="([^"]+)"/.exec(attrs), tA=/t="([^"]+)"/.exec(attrs);
      const type=tA?tA[1]:'n';
      const ci=rA?mkColIndex(rA[1]):(rowMax+1);   // 无 r 属性时退化为顺序对齐
      cells[ci]=cellValue(inner,type,ss);
      if(ci>rowMax)rowMax=ci;
    }
    const arr=[];for(let i=0;i<=rowMax;i++)arr[i]=cells[i]!==undefined?cells[i]:'';
    if(rowMax>maxCol)maxCol=rowMax;
    rows.push(arr);
  }
  rows.forEach(r=>{while(r.length<=maxCol)r.push('');});   // 统一行宽
  return rows;
}
async function mkParseXlsx(u8){
  const zip=await readZip(u8 instanceof Uint8Array?u8:new Uint8Array(u8));
  const ss=readSharedStrings(zip);
  const wb=xmlText(zip['xl/workbook.xml']||''),rels=xmlText(zip['xl/_rels/workbook.xml.rels']||'');
  const ridMap={};let m;const reRel=/Id="([^"]+)"[^>]*Target="([^"]+)"/g;while(m=reRel.exec(rels))ridMap[m[1]]=m[2];
  const sheets=[];const reSh=/name="([^"]+)"[^>]*r:id="([^"]+)"/g;while(m=reSh.exec(wb))sheets.push({name:m[1],file:'xl/'+(ridMap[m[2]]||'')});
  return sheets.map(sh=>({name:sh.name,rows:mkAlignRows(xmlText(zip[sh.file]||''),ss)}));
}

/* ---------- 日期：Excel 序列号 → YYYY-MM-DD ---------- */
function mkIsDateCol(header){return /时间|日期|date|time/i.test(String(header||''));}
function mkIsDateSerial(s){if(typeof s!=='string')return false;if(!/^\d{4,5}(\.\d+)?$/.test(s))return false;const n=parseFloat(s);return n>=20000&&n<=80000;}
function mkExcelDate(n){
  const d=new Date(Math.round((n-25569)*86400*1000));
  const y=d.getUTCFullYear(),mo=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${mo}-${da}`;
}
function mkPostProcessDates(){
  const idx=MK.cols.map((c,i)=>mkIsDateCol(c)?i:-1).filter(i=>i>=0);
  if(!idx.length)return;
  MK.rows.forEach((r,ri)=>{if(ri===0)return;idx.forEach(i=>{if(mkIsDateSerial(r[i]))r[i]=mkExcelDate(parseFloat(r[i]));});});
}

/* ---------- 解析：CSV（引号内逗号/换行 + 自动探测分隔符与编码） ---------- */
function mkDecodeBytes(u8){
  let s=new TextDecoder('utf-8',{fatal:false}).decode(u8);
  if(/�/.test(s)){try{s=new TextDecoder('gb18030').decode(u8);}catch(e){try{s=new TextDecoder('gbk',{fatal:false}).decode(u8);}catch(e2){}}}
  return s;
}
function mkDetectDelim(text){
  const fl=(text.split(/\r?\n/)[0]||'');
  const c={',':(fl.match(/,/g)||[]).length,';':(fl.match(/;/g)||[]).length,'\t':(fl.match(/\t/g)||[]).length};
  let best=',';for(const k in c)if(c[k]>(c[best]||0))best=k;return best;
}
function mkParseCsv(text){
  const delim=mkDetectDelim(text);
  const rows=[];let row=[],field='',i=0,inQ=false;
  while(i<text.length){
    const ch=text[i];
    if(inQ){
      if(ch==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}inQ=false;i++;continue;}
      field+=ch;i++;continue;
    }else{
      if(ch==='"'){inQ=true;i++;continue;}
      if(ch===delim){row.push(field);field='';i++;continue;}
      if(ch==='\r'){i++;continue;}
      if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue;}
      field+=ch;i++;continue;
    }
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows;
}
function mkCsvEscape(f){const s=f==null?'':String(f);if(/[",\n\r]/.test(s))return '"'+s.replace(/"/g,'""')+'"';return s;}
function mkSerializeCsv(rows){return rows.map(r=>r.map(mkCsvEscape).join(',')).join('\r\n');}

/* ---------- 序列化回 xlsx / csv ---------- */
function mkCellOut(v){
  if(v==null||v==='')return null;
  if(typeof v==='number'&&isFinite(v))return v;
  const s=String(v);
  if(/^\s*-?\d+(\.\d+)?\s*$/.test(s))return parseFloat(s.trim());   // 纯数字写回为数字，其余按文本（保留原样，含首尾空格）
  return s;
}
function mkSerialize(){
  const cur=MK.cur||'data.xlsx';
  if(/\.csv$/i.test(cur))return {ext:'csv',bytes:new TextEncoder().encode('\uFEFF'+mkSerializeCsv(MK.rows))};
  const sheetName=MK.sheet||'市场项目跟踪';
  const data=MK.rows.map(r=>r.map(mkCellOut));
  return {ext:'xlsx',bytes:buildWorkbookBytes([[sheetName,data]])};
}

/* ---------- 桥调用 ---------- */
async function mkRpc(msg){return await FileIO.rpc(msg);}

/* ---------- 目录与文件 ---------- */
async function mkPickDir(){
  if(!FileIO.webview){toast('浏览器模式无法选择系统目录，请直接用窗口版 exe','err');return;}
  const r=await mkRpc({action:'mkPickDir',path:MK.dir||''});
  if(!r.ok||!r.path)return;
  MK.dir=r.path;MK.cur='';MK.cols=[];MK.rows=[];MK._files=[];MK._bak='';mkPersist();
  await mkRefreshDir();renderMarket();
}
async function mkRefreshDir(){
  if(!MK.dir)return;
  try{const r=await mkRpc({action:'mkListDir',path:FileIO.webview?MK.dir:''});
    if(r.ok){MK._files=r.files||[];mkPersist();}}catch(e){}
}
async function mkLoadFile(path){
  try{
    toast('正在读取 '+mkBaseName(path),'…');
    const r=await mkRpc({action:'mkRead',path});
    if(!r.ok)throw new Error(r.error||'读取失败');
    if(!r.text)throw new Error('文件内容为空');
    const u8=b64ToBytes(r.text);
    let rows,sheet='';
    if(/\.csv$/i.test(path)){rows=mkParseCsv(mkDecodeBytes(u8));sheet='';}
    else{
      const sh=await mkParseXlsx(u8);
      if(!sh.length)throw new Error('未找到工作表');
      sheet=sh[0].name;rows=sh[0].rows;
    }
    if(!rows.length)throw new Error('表格为空');
    rows=mkNormalizeRows(rows);
    MK.cur=path;MK.sheet=sheet;MK.cols=rows[0]||[];MK.rows=rows;
    mkPostProcessDates();mkQuery='';mkFilters={};mkSortCol=-1;mkSortDir=1;
    MK.dirty=false;mkPersist();renderMarket();toast('已打开：'+mkBaseName(path)+'（'+(rows.length-1)+' 行）','ok');
  }catch(e){toast('打开表格失败：'+(e.message||e),'err');}
}
async function mkUpload(){
  if(!FileIO.webview){await mkUploadBrowser();return;}
  if(!MK.dir){toast('请先选择数据目录，再导入附件','err');return;}
  try{
    let r;
    try{r=await mkRpc({action:'mkPickTable'});}
    catch(e){toast('选择文件失败：'+(e.message||e),'err');return;}
    if(!r.ok){toast(r.error?('导入失败：'+r.error):'已取消选择',r.error?'err':'');return;}
    if(!r.path||!r.text){toast('未能读取附件内容（文件可能为空或被占用，请先关闭 Excel 再试）','err');return;}
    const name=mkBaseName(r.name||r.path);
    const sin=await mkRpc({action:'mkSaveInto',path:MK.dir,name:name,text:r.text,binary:true});
    if(!sin.ok){toast('复制进数据目录失败：'+(sin.error||''),'err');return;}
    await mkRefreshDir();
    await mkLoadFile(sin.path||(MK.dir.replace(/[\\/]$/,'')+'/'+name));
  }catch(e){toast('导入失败：'+(e.message||e),'err');}
}
async function mkUploadBrowser(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.csv';
  inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
    const buf=await f.arrayBuffer();let rows,sheet='';
    if(/\.csv$/i.test(f.name))rows=mkParseCsv(mkDecodeBytes(new Uint8Array(buf)));
    else{const sh=await mkParseXlsx(new Uint8Array(buf));sheet=sh[0].name;rows=sh[0].rows;}
    rows=mkNormalizeRows(rows);
    MK.cur=f.name;MK.sheet=sheet;MK.cols=rows[0]||[];MK.rows=rows;mkPostProcessDates();
    mkQuery='';mkFilters={};mkSortCol=-1;mkSortDir=1;MK.dirty=true;mkPersist();renderMarket();
    toast('已导入（本地模式：改动仅缓存，点「导出」可保存）','ok');
  };
  inp.click();
}

/* ---------- 自动保存（实时写回目录副本） ---------- */
function mkScheduleSave(){
  MK.dirty=true;renderMkMeta();
  if(!FileIO.webview||!MK.cur){mkPersist();return;}   // 浏览器本地模式：仅缓存
  clearTimeout(mkSaveTimer);mkSaveTimer=setTimeout(mkSave,400);
}
async function mkSave(){
  if(!FileIO.webview||!MK.cur||mkBusy)return;
  mkBusy=true;
  try{
    const {bytes}=mkSerialize();
    const r=await mkRpc({action:'mkWrite',path:MK.cur,text:bytesToB64(bytes),binary:true,backup:true});
    if(!r.ok)throw new Error(r.error||'写入失败');
    MK.dirty=false;MK._bak=r.bak||'';renderMkMeta();
  }catch(e){toast('自动保存失败：'+(e.message||e),'err');}
  finally{mkBusy=false;}
}
function mkExport(){
  if(!MK.rows.length){toast('没有可导出的数据','err');return;}
  const {ext,bytes}=mkSerialize();
  const name=(MK.cur?mkBaseName(MK.cur).replace(/\.(xlsx|csv)$/i,'')+'_导出':'市场项目跟踪')+'.'+ext;
  download(new Blob([bytes],{type:ext==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
  toast('已导出 '+name,'ok');
}

/* ---------- 视图行（每列筛选 + 全局搜索 + 排序，仅影响显示，不改底层顺序） ---------- */
function mkDisplayRows(){
  let data=MK.rows.slice(1);
  if(mkQuery){const q=mkQuery.toLowerCase();data=data.filter(r=>r.some(c=>String(c||'').toLowerCase().includes(q)));}
  const fk=Object.keys(mkFilters).map(Number).filter(aj=>mkFilters[aj]&&mkFilters[aj].trim()!=='');
  if(fk.length)data=data.filter(r=>fk.every(aj=>String(r[aj]||'').toLowerCase().includes(mkFilters[aj].toLowerCase().trim())));
  if(mkSortCol>=0){const show=mkShowCols();const aj=show[mkSortCol];if(aj!=null)data=data.slice().sort((a,b)=>{
    const nx=parseFloat(a[aj]),ny=parseFloat(b[aj]);
    if(!isNaN(nx)&&!isNaN(ny)&&String(a[aj]).trim()!==''&&String(b[aj]).trim()!=='')
      return (nx-ny)*mkSortDir;
    return String(a[aj]||'').localeCompare(String(b[aj]||''),'zh')*mkSortDir;
  });}
  return data;
}

/* ---------- 渲染 ---------- */
async function renderMarket(){
  mkLoad();
  const root=$('#mkRoot');if(!root)return;
  const active=document.getElementById('p-market')&&document.getElementById('p-market').classList.contains('on');
  if(!active && root.dataset.built==='1')return;          // 不在前台则不重建，避免后台轮询冲掉编辑
  if(MK.dir && FileIO.webview && !MK._files.length) await mkRefreshDir();
  root.dataset.built='1';

  /* 未配置目录 */
  if(!MK.dir){
    root.innerHTML=`<div class="mk-empty card">
      <div class="mk-empty-ico"><svg class="ic lg"><use href="#i-grid"/></svg></div>
      <h3>市场项目跟踪</h3>
      <p>这是一个<b>完全独立的数据模块</b>：所有表格文件都放在你单独指定的「市场数据目录」里，和系统其他数据相互隔离；导入附件时也只复制一份进目录，<b>绝不改动你的原始文件</b>。</p>
      <button class="btn pri" id="mkPickDir2"><svg class="ic sm"><use href="#i-folder"/></svg>选择数据目录…</button>
      <p class="mk-tip">${FileIO.webview?'在窗口版里选择任意文件夹作为专属目录，目录下的 xlsx / csv 都会出现在上方标签。':'当前为浏览器打开模式：可直接导入本地表格（改动仅缓存，点「导出」可保存为文件）。'}</p>
    </div>`;
    const b=$('#mkPickDir2');if(b)b.onclick=mkPickDir;
    return;
  }

  /* 已配置目录 */
  const files=MK._files||[];
  const tabs=files.length?`<div class="mk-tabs">`+files.map(f=>{
    const cur=MK.cur===f.path;
    const ic=f.ext==='csv'?'i-dl':'i-file';
    return `<button class="mk-tab ${cur?'on':''}" data-path="${esc(f.path)}">
      <svg class="ic sm"><use href="#${ic}"/></svg><span>${esc(f.name)}</span><span class="mk-tab-sub">${esc(f.mtime)}</span></button>`;
  }).join('')+`</div>`:`<div class="mk-empty2">该目录还没有表格文件，点「导入附件」把市场项目跟踪表复制进来（原始文件不会被动）。</div>`;

  root.innerHTML=`
    <div class="mk-bar">
      <div class="mk-dir">
        <button class="btn pri sm" id="mkPickDir"><svg class="ic sm"><use href="#i-folder"/></svg>切换目录</button>
        <span class="mk-dirlabel" title="${esc(MK.dir)}">📁 ${esc(mkBaseName(MK.dir))}</span>
        ${FileIO.webview?'<button class="btn sm" id="mkReveal"><svg class="ic sm"><use href="#i-arr"/></svg>打开</button>':''}
      </div>
      <div class="mk-acts">
        <button class="btn sm" id="mkUpload"><svg class="ic sm"><use href="#i-ul"/></svg>导入附件</button>
        <button class="btn sm" id="mkAdd"><svg class="ic sm"><use href="#i-plus"/></svg>新增行</button>
        <button class="btn sm" id="mkExport"><svg class="ic sm"><use href="#i-dl"/></svg>导出</button>
      </div>
    </div>
    ${tabs}
    <div class="mk-meta" id="mkMeta"></div>
    <div class="mk-toolbar" id="mkToolbar" ${MK.rows.length?'':'hidden'}>
      <div class="searchbox"><svg class="ic"><use href="#i-search"/></svg><input class="inp" id="mkSearch" placeholder="搜索全部内容…"></div>
      <span class="mk-fhint">每列表头下方可单独输入筛选 · 点击任意行查看 / 编辑全部字段</span>
      <button class="btn sm" id="mkColSet"><svg class="ic sm"><use href="#i-set"/></svg>列设置</button>
      <button class="btn sm" id="mkClearF">清除筛选</button>
    </div>
    <div class="mk-gridwrap" id="mkGrid"></div>`;

  const pd=$('#mkPickDir');if(pd)pd.onclick=mkPickDir;
  const rv=$('#mkReveal');if(rv)rv.onclick=()=>mkRpc({action:'mkReveal',path:MK.dir}).catch(()=>{});
  const up=$('#mkUpload');if(up)up.onclick=mkUpload;
  const ad=$('#mkAdd');if(ad)ad.onclick=mkAddRow;
  const ex=$('#mkExport');if(ex)ex.onclick=mkExport;
  const cs=$('#mkColSet');if(cs)cs.onclick=mkColSettings;
  $$('#mkRoot .mk-tab').forEach(t=>t.onclick=()=>{if(MK.cur!==t.dataset.path)mkLoadFile(t.dataset.path);});

  /* 搜索 + 清除筛选 */
  const srch=$('#mkSearch');if(srch){srch.value=mkQuery;srch.oninput=()=>{mkQuery=srch.value.trim();renderMkBody();};}
  const cf=$('#mkClearF');if(cf)cf.onclick=()=>{mkQuery='';mkFilters={};if(srch)srch.value='';renderMkGrid();};

  renderMkMeta();renderMkGrid();
}

function renderMkMeta(){
  const el=$('#mkMeta');if(!el)return;
  if(!MK.rows.length){el.innerHTML='';return;}
  let s=`共 <b>${MK.rows.length-1}</b> 行 · 显示 <b>${mkShowCols().length}</b>/<b>${MK.cols.length}</b> 列`;
  if(MK.colShow&&MK.colShow.length)s+=` · <span class="mk-custom">自定义列</span>`;
  if(MK.dirty)s+=` · <span class="mk-dirty">● 有未保存改动（正在写回…）</span>`;
  else s+=` · <span style="color:var(--green)">已自动保存到目录副本</span>`;
  if(MK._bak)s+=` · 已备份 <code>${esc(mkBaseName(MK._bak))}</code>`;
  if(!FileIO.webview)s+=` · <span style="color:var(--amber)">本地模式（仅缓存，导出可保存）</span>`;
  el.innerHTML=s;
}
function renderMkGrid(){
  const wrap=$('#mkGrid');if(!wrap)return;
  const st=wrap.scrollTop;
  if(!MK.rows.length){wrap.innerHTML=`<div class="empty"><svg class="ic"><use href="#i-grid"/></svg><div>还没有数据，导入一个表格附件开始吧</div></div>`;return;}
  const cols=MK.cols, show=mkShowCols();
  const longByActual=cols.map(c=>/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i.test(String(c||'')));
  let h=`<table class="mk-table"><thead>`;
  // 表头行（点击排序 / 双击改名 / × 删列）
  h+=`<tr class="mk-hrow"><th class="mk-rownum">#</th>`;
  show.forEach((aj,dj)=>{
    h+=`<th class="mk-th${mkSortCol===dj?' on':''}" data-aj="${aj}">${esc(cols[aj]||'')}`+
       (mkSortCol===dj?`<span class="mk-arrow">${mkSortDir===1?' ▲':' ▼'}</span>`:'')+
       `<span class="mk-thx" data-x="${aj}" title="删除该列">×</span></th>`;
  });
  h+=`<th class="mk-th-act"></th></tr>`;
  // 筛选行（每列一个输入框，独立筛选）
  h+=`<tr class="mk-frow"><th class="mk-rownum"></th>`;
  show.forEach(aj=>{
    const f=mkFilters[aj]||'';
    h+=`<th class="mk-fltth"><input class="inp mk-flt" data-aj="${aj}" value="${esc(f)}" placeholder="筛选"></th>`;
  });
  h+=`<th class="mk-th-act"></th></tr>`;
  h+=`</thead><tbody id="mkTbody"></tbody></table>`;
  wrap.innerHTML=h;
  wrap.scrollTop=st;

  $$('#mkGrid .mk-th').forEach(th=>{
    const aj=+th.dataset.aj;
    th.addEventListener('click',e=>{if(e.target.classList.contains('mk-thx'))return;const dj=show.indexOf(aj);
      if(mkSortCol===dj)mkSortDir*=-1;else{mkSortCol=dj;mkSortDir=1;}renderMkGrid();});
    th.addEventListener('dblclick',e=>{if(e.target.classList.contains('mk-thx'))return;mkRenameCol(aj);});
  });
  $$('#mkGrid .mk-thx').forEach(x=>x.onclick=()=>mkDelCol(+x.dataset.x));
  $$('#mkGrid .mk-flt').forEach(inp=>{const aj=+inp.dataset.aj;
    inp.oninput=()=>{mkFilters[aj]=inp.value;renderMkBody();};});
  renderMkBody();
}
function renderMkBody(){
  const tb=document.getElementById('mkTbody');if(!tb)return;
  const wrap=$('#mkGrid');const st=wrap?wrap.scrollTop:0;
  const cols=MK.cols, show=mkShowCols();
  const longByActual=cols.map(c=>/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i.test(String(c||'')));
  const data=mkDisplayRows();
  let h='';
  if(!data.length)h=`<tr><td colspan="${show.length+2}" class="mk-nodata">没有匹配的行</td></tr>`;
  data.forEach(r=>{
    const ri=MK.rows.indexOf(r);          // 原始行索引，保证编辑定位正确
    h+=`<tr data-ri="${ri}" style="cursor:pointer">`;
    h+=`<td class="mk-rownum">${ri}</td>`;
    show.forEach(aj=>{
      const v=r[aj],isLong=longByActual[aj],empty=v===''||v==null;
      h+=`<td class="mk-td${isLong?' mk-long':''}" data-ri="${ri}" data-aj="${aj}" title="点击查看全部字段">${empty?'<span class="mk-ph">—</span>':esc(v)}</td>`;
    });
    h+=`<td class="mk-td-act">
      <button class="iconbtn" title="查看 / 编辑全部字段"><svg class="ic sm"><use href="#i-edit"/></svg></button>
      <button class="iconbtn dgr mk-delrow" data-ri="${ri}" title="删除该行"><svg class="ic sm"><use href="#i-trash"/></svg></button></td></tr>`;
  });
  tb.innerHTML=h;
  if(wrap)wrap.scrollTop=st;
  $$('#mkGrid #mkTbody tr').forEach(tr=>{tr.onclick=()=>{const ri=+tr.dataset.ri;mkOpenDetail(ri);};});
  $$('#mkGrid .mk-delrow').forEach(b=>b.onclick=e=>{e.stopPropagation();mkDelRow(+b.dataset.ri);});
}

/* ---------- 详情：点击行查看 / 编辑全部字段（含历史进展） ---------- */
/* 富文本预览：把纯文本里的链接 / 图片 URL 渲染成可点击链接与图片。
   先整体转义防 XSS，再用单次正则（图片URL优先于普通URL）替换，避免重复嵌套。 */
function mkRichHtml(plain){
  const re=/(https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?=\s|$))|(https?:\/\/[^\s<>"']+)/gi;
  return String(plain||'').split('\n').map(line=>{
    if(!line.trim())return '<div class="mk-rich-line">&nbsp;</div>';
    const s=esc(line).replace(re,(m,isImg)=>isImg
      ? `<a href="${isImg}" target="_blank" rel="noopener"><img class="mk-rich-img" src="${isImg}" alt="图片" loading="lazy"></a>`
      : `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
    return `<div class="mk-rich-line">${s}</div>`;
  }).join('');
}
/* 构建详情弹窗正文（独立函数，便于测试断言）。状态列渲染为下拉枚举，长文本列带实时富文本预览。 */
function mkDetailBody(ri){
  const cols=MK.cols, row=MK.rows[ri];
  const longRe=/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i;
  let body='';
  cols.forEach((c,j)=>{
    const v=row[j]==null?'':row[j];
    const isLong=longRe.test(String(c||''));
    const isStatus=String(c||'').trim()==='状态';
    const lab=esc(c||('列'+j));
    if(isStatus){
      const opts=mkStatusOptions.slice();
      if(v&&!opts.some(o=>o.v===v))opts.unshift({v:v,t:v});   // 保留用户历史中文值
      body+=`<div class="fld" style="margin-bottom:11px"><label>${lab}</label>`+
        `<select class="inp" data-mkj="${j}">`+
        opts.map(o=>`<option value="${esc(o.v)}" ${o.v===v?'selected':''}>${esc(o.t)}</option>`).join('')+
        `</select></div>`;
    }else if(isLong){
      body+=`<div class="fld" style="margin-bottom:11px"><label>${lab} <span style="color:var(--tx3);font-weight:400;font-size:11px">（多行，支持链接/图片，下方实时预览）</span></label>`+
        `<textarea class="inp mk-detail-ta" data-mkj="${j}" data-rich="1" style="min-height:${String(v).length>120?170:84}px">${esc(v)}</textarea>`+
        `<div class="mk-rich-preview" data-prev="${j}">${mkRichHtml(v)}</div></div>`;
    }else{
      body+=`<div class="fld" style="margin-bottom:11px"><label>${lab}</label><input class="inp" data-mkj="${j}" value="${esc(v)}"></div>`;
    }
  });
  return body;
}
function mkOpenDetail(ri){
  if(mkEditInput)return;
  openModal('项目详情 · 第 '+(ri+1)+' 行', mkDetailBody(ri),
    `<button class="btn" id="mkDetClose">关闭</button><button class="btn pri" id="mkDetSave"><svg class="ic sm"><use href="#i-check-sq"/></svg>保存修改</button>`);
  // 长字段实时预览：输入即刷新下方富文本
  $$('#modalRoot [data-rich="1"]').forEach(ta=>{
    ta.addEventListener('input',()=>{const pj=ta.dataset.mkj;const pv=document.querySelector('#modalRoot [data-prev="'+pj+'"]');if(pv)pv.innerHTML=mkRichHtml(ta.value);});
  });
  const close=$('#mkDetClose');if(close)close.onclick=closeModal;
  const save=$('#mkDetSave');if(save)save.onclick=()=>{
    const oHist=MK.cols.findIndex(c=>String(c||'').trim()==='历史进展');
    const oLatest=MK.cols.findIndex(c=>String(c||'').trim()==='最新进展');
    const origHist=oHist>=0?MK.rows[ri][oHist]:'';
    let histVal=origHist;
    $$('#modalRoot [data-mkj]').forEach(inp=>{
      const j=+inp.dataset.mkj;
      if(j===oHist)return;                       // 历史进展最后统一落盘
      const nv=inp.value;
      if(j===oLatest){                           // 最新进展：套用日期前缀 + 追加到历史进展最前
        const content=String(nv||'').trim().replace(/^\s*\d{4}[\/\-]\d{2}[\/\-]\d{2}[：:]\s*/,'');
        if(content!=='')histVal=mkSetLatest(ri,j,content);
      }else if(String(MK.rows[ri][j]??'')!==String(nv)){
        MK.rows[ri][j]=nv;
      }
    });
    const histInp=oHist>=0?document.querySelector('#modalRoot [data-mkj="'+oHist+'"]'):null;
    if(histInp&&String(histInp.value??'')!==String(origHist))histVal=histInp.value;  // 用户手动改历史进展 → 以用户为准
    if(oHist>=0)MK.rows[ri][oHist]=histVal;
    mkScheduleSave();renderMkGrid();closeModal();
    toast('已保存修改','ok');
  };
}
/* 最新进展这类字段的落盘规则：去手填日期前缀 → 加当前日期 → 续写到历史进展最前。
   返回更新后的「历史进展」值，供详情弹窗统一回写；非最新进展列原样赋值。 */
function mkSetLatest(ri,aj,raw){
  const content=String(raw||'').trim().replace(/^\s*\d{4}[\/\-]\d{2}[\/\-]\d{2}[：:]\s*/,'');
  if(content==='')return MK.rows[ri][aj];
  const d=new Date(),y=d.getFullYear(),mo=pad(d.getMonth()+1),da=pad(d.getDate());
  const entry=`${y}/${mo}/${da}：`+content;
  MK.rows[ri][aj]=entry;
  const hIdx=MK.cols.findIndex(c=>String(c||'').trim()==='历史进展');
  if(hIdx>=0){
    const oh=MK.rows[ri][hIdx]||'';
    MK.rows[ri][hIdx]=entry+(oh?'\n'+oh:'');
    return MK.rows[ri][hIdx];
  }
  return MK.rows[ri][aj];
}
function mkRenameCol(j){
  openModal('重命名列',`<input class="inp" id="mkNewName" value="${esc(MK.cols[j]||'')}" style="width:100%">`,
    `<button class="btn" id="mkRnNo">取消</button><button class="btn pri" id="mkRnYes">确定</button>`);
  const i=$('#mkNewName');if(i)i.focus();
  $('#mkRnNo').onclick=closeModal;
  $('#mkRnYes').onclick=()=>{MK.cols[j]=$('#mkNewName').value.trim();closeModal();mkScheduleSave();renderMkGrid();};
}
function mkDelCol(j){
  confirmBox('删除这一列？','列名：'+(MK.cols[j]||'')+'。删除后无法撤销（但每次保存前都会自动备份 .bak）。',()=>{
    MK.cols.splice(j,1);MK.rows.forEach(r=>r.splice(j,1));
    if(MK.colShow)MK.colShow=MK.colShow.filter(x=>x!==j).map(x=>x>j?x-1:x);  // 校正自定义列索引
    mkScheduleSave();mkFilters={};renderMarket();});
}
function mkDelRow(ri){
  confirmBox('删除这一行？','删除后无法撤销（但每次保存前都会自动备份 .bak）。',()=>{
    MK.rows.splice(ri,1);mkScheduleSave();renderMkGrid();renderMkMeta();});
}
function mkAddRow(){
  MK.rows.push(MK.cols.map(()=>''));mkScheduleSave();renderMkGrid();
  const w=$('#mkGrid');if(w)w.scrollTop=w.scrollHeight;
}
/* 自定义展示列：勾选要显示的实际列，应用后写入 MK.colShow（实际列索引，随增删列自动校正）。 */
function mkColSettings(){
  const cols=MK.cols, cur=mkShowCols();
  let body=`<div class="mk-colsets">`+cols.map((c,j)=>{
    const on=cur.includes(j);
    return `<label class="mk-colset"><input type="checkbox" data-cj="${j}" ${on?'checked':''}><span>${esc(c||('列'+(j+1)))}</span></label>`;
  }).join('')+`</div>
  <div class="btn-row" style="margin-top:10px">
    <button class="btn sm" id="mkColAll">全选</button>
    <button class="btn sm" id="mkColNone">全不选</button>
    <button class="btn sm" id="mkColDef">恢复默认白名单</button>
  </div>`;
  openModal('自定义展示列', body,
    `<button class="btn" id="mkColCancel">取消</button><button class="btn pri" id="mkColOk">应用</button>`);
  const boxes=()=>$$('#modalRoot [data-cj]');
  const all=$('#mkColAll');if(all)all.onclick=()=>boxes().forEach(c=>c.checked=true);
  const none=$('#mkColNone');if(none)none.onclick=()=>boxes().forEach(c=>c.checked=false);
  const def=$('#mkColDef');if(def)def.onclick=()=>{MK.colShow=null;mkPersist();renderMkGrid();closeModal();toast('已恢复默认列','ok');};
  const canc=$('#mkColCancel');if(canc)canc.onclick=()=>{MK.colShow=null;closeModal();};
  const okB=$('#mkColOk');if(okB)okB.onclick=()=>{
    const idx=boxes().filter(c=>c.checked).map(c=>+c.dataset.cj);
    MK.colShow=idx.length?idx:null;
    mkPersist();renderMkGrid();closeModal();toast('已更新展示列','ok');
  };
}

/* 启动时恢复状态（仅读取 localStorage，不触碰任何文件） */
mkLoad();
</script>

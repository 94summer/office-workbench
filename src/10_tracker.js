<script>
/* ==================== 通用产品跟踪模块（版本管理 / 需求管理） ==================== */
/* 隔离与读写原则（与系统其他数据完全解耦，且「数据源」机制刻意不同于 待办/市场项目）：
   1) 状态只存在独立 localStorage 键 TK_KEY，绝不读写系统 DB（wb_office_desk_v1）。
   2) 每个「模块 × 产品类别」标签页各自维护一份数据；标签页的数据源可单独配置
      （默认指向用户给定的 .dbt 文件），读取为「只读加载」，编辑只缓存到本机浏览器，
      需要落盘时点「导出」另存为副本 —— 绝不回写/改动用户原始文件。
   3) 复用系统 C# 桥的 mk* 动作（mkRead / mkPickTable / mkReveal 等）完成文件读取，
      不新增任何 C# 代码；解析与写回逻辑本文件自包含。
   4) 导入/导出均不触碰原始表格：导入只把选中文件作为该 tab 的「数据源」只读加载。 */

/* 模块与标签页配置。def 为默认数据源路径（用户给定的 3 个 .dbt 文件，按产品类别）。
   注意：这些 .dbt 在 WPS 云盘里是「在线文件」桩，本地无数据；真正可用时需用户在
   WPS 中「下载/始终保留在此设备」或导出为 Excel(xlsx) 后，再通过「配置数据源」重新指向。 */
const TK_MODS={
  version:{ title:'版本管理', icon:'i-grid',
    tabs:[
      {key:'crypto', label:'密码产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/密码产品版本和需求跟踪表.dbt'},
      {key:'dsec',   label:'数据安全产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/数据安全产品需求和版本跟踪.dbt.dbt'},
      {key:'term',   label:'终端安全产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/终端产品版本规划.dbt'}
    ]},
  requirement:{ title:'需求管理', icon:'i-layers',
    tabs:[
      {key:'crypto', label:'密码产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/密码产品版本和需求跟踪表.dbt'},
      {key:'dsec',   label:'数据安全产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/数据安全产品需求和版本跟踪.dbt.dbt'},
      {key:'term',   label:'终端安全产品', def:'C:/Users/admin/WPSDrive/389384028/WPS云盘/孙卓工作/终端产品版本规划.dbt'}
    ]}
};

const TK_KEY='wb_tracker_v1';
let TK=null;
function tkBaseName(p){return String(p||'').split(/[\\/]/).pop();}
/* 换行规范化：统一 Excel/CSV 各种换行，并清理旧版本遗留的字面量 &#10;/&#13; 实体。 */
function tkNorm(s){
  if(typeof s!=='string')return s;
  return s.replace(/&#13;&#10;/gi,'\n').replace(/&#13;/gi,'\n').replace(/&#10;/gi,'\n')
          .replace(/\r\n/g,'\n').replace(/\r/g,'\n');
}
function tkNormalizeRows(rows){return (rows||[]).map(r=>r.map(c=>typeof c==='string'?tkNorm(c):c));}
function tkLoad(){
  if(TK)return TK;
  try{TK=JSON.parse(localStorage.getItem(TK_KEY)||'{}');}catch(e){TK={};}
  if(!TK.version)TK.version={tab:'crypto',tabs:{}};
  if(!TK.requirement)TK.requirement={tab:'crypto',tabs:{}};
  for(const mk in TK_MODS){
    const m=TK[mk]; if(!m.tabs)m.tabs={};
    TK_MODS[mk].tabs.forEach(t=>{
      if(!m.tabs[t.key])m.tabs[t.key]={path:t.def||'',sheet:'',cols:[],rows:[],colShow:null,dirty:false,_bak:'',query:'',filters:{},sortCol:-1,sortDir:1};
      else{const tt=m.tabs[t.key];tt.query=tt.query||'';tt.filters=tt.filters||{};tt.sortCol=tt.sortCol==null?-1:tt.sortCol;tt.sortDir=tt.sortDir||1;if(tt.colShow===undefined)tt.colShow=null;}
    });
  }
  return TK;
}
function tkPersist(){try{localStorage.setItem(TK_KEY,JSON.stringify(TK||{}));}catch(e){}}
function tkRpc(msg){return FileIO.rpc(msg);}

/* ---------- 解析：xlsx（按 r 属性对齐列，修复空单元格错位） ---------- */
function tkColIndex(ref){const m=/^([A-Z]+)/.exec(ref||'');if(!m)return 0;let n=0;for(const ch of m[1])n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function tkAlignRows(xml,ss){
  const rows=[];let maxCol=-1;
  const reRow=/<row\b[^>]*>([\s\S]*?)<\/row>/g;let rm;
  while(rm=reRow.exec(xml)){
    const cells={};let rowMax=-1;
    const reC=/<c\b([^>]*?)(?:\/>|>\s*([\s\S]*?)<\/c>)/g;let cm;
    while(cm=reC.exec(rm[1])){
      const attrs=cm[1],inner=cm[2]!==undefined?cm[2]:'';
      const rA=/r="([^"]+)"/.exec(attrs),tA=/t="([^"]+)"/.exec(attrs);
      const type=tA?tA[1]:'n';
      const ci=rA?tkColIndex(rA[1]):(rowMax+1);
      cells[ci]=cellValue(inner,type,ss);
      if(ci>rowMax)rowMax=ci;
    }
    const arr=[];for(let i=0;i<=rowMax;i++)arr[i]=cells[i]!==undefined?cells[i]:'';
    if(rowMax>maxCol)maxCol=rowMax;
    rows.push(arr);
  }
  rows.forEach(r=>{while(r.length<=maxCol)r.push('');});
  return rows;
}
async function tkParseXlsx(u8){
  const zip=await readZip(u8 instanceof Uint8Array?u8:new Uint8Array(u8));
  const ss=readSharedStrings(zip);
  const wb=xmlText(zip['xl/workbook.xml']||''),rels=xmlText(zip['xl/_rels/workbook.xml.rels']||'');
  const ridMap={};let m;const reRel=/Id="([^"]+)"[^>]*Target="([^"]+)"/g;while(m=reRel.exec(rels))ridMap[m[1]]=m[2];
  const sheets=[];const reSh=/name="([^"]+)"[^>]*r:id="([^"]+)"/g;while(m=reSh.exec(wb))sheets.push({name:m[1],file:'xl/'+(ridMap[m[2]]||'')});
  return sheets.map(sh=>({name:sh.name,rows:tkAlignRows(xmlText(zip[sh.file]||''),ss)}));
}
/* ---------- 解析：CSV ---------- */
function tkDecodeBytes(u8){
  let s=new TextDecoder('utf-8',{fatal:false}).decode(u8);
  if(/�/.test(s)){try{s=new TextDecoder('gb18030').decode(u8);}catch(e){try{s=new TextDecoder('gbk',{fatal:false}).decode(u8);}catch(e2){}}}
  return s;
}
function tkDetectDelim(text){
  const fl=(text.split(/\r?\n/)[0]||'');
  const c={',':(fl.match(/,/g)||[]).length,';':(fl.match(/;/g)||[]).length,'\t':(fl.match(/\t/g)||[]).length};
  let best=',';for(const k in c)if(c[k]>(c[best]||0))best=k;return best;
}
function tkParseCsv(text){
  const delim=tkDetectDelim(text);
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
function tkCsvEscape(f){const s=f==null?'':String(f);if(/[",\n\r]/.test(s))return '"'+s.replace(/"/g,'""')+'"';return s;}
function tkSerializeCsv(rows){return rows.map(r=>r.map(tkCsvEscape).join(',')).join('\r\n');}
/* ---------- 序列化回 xlsx / csv ---------- */
function tkCellOut(v){
  if(v==null||v==='')return null;
  if(typeof v==='number'&&isFinite(v))return v;
  const s=String(v);
  if(/^\s*-?\d+(\.\d+)?\s*$/.test(s))return parseFloat(s.trim());
  return s;
}
function tkSerialize(tab){
  const cur=tab.path||'data.xlsx';
  if(/\.csv$/i.test(cur))return {ext:'csv',bytes:new TextEncoder().encode('\uFEFF'+tkSerializeCsv(tab.rows))};
  const sheetName=tab.sheet||TK_MODS.version.title;
  const data=tab.rows.map(r=>r.map(tkCellOut));
  return {ext:'xlsx',bytes:buildWorkbookBytes([[sheetName,data]])};
}

/* 检测 WPS 云「在线文件」桩：本地只有 fileid/groupid 指针，无真实数据。 */
function tkIsWpsOnline(u8){
  const head=String.fromCharCode.apply(null,Array.from(u8.slice(0,24))).replace(/\0/g,'');
  return /qonline/i.test(head);
}
/* 解析入口：优先 xlsx，失败回退 csv；遇到 WPS 在线桩抛 WPS_ONLINE 错误。 */
async function tkParse(path,u8){
  if(tkIsWpsOnline(u8)){const e=new Error('WPS在线文件（本地无数据）');e.code='WPS_ONLINE';throw e;}
  if(/\.csv$/i.test(path))return {rows:tkParseCsv(tkDecodeBytes(u8)),sheet:''};
  try{const sh=await tkParseXlsx(u8);if(sh.length&&sh[0].rows.length)return {rows:sh[0].rows,sheet:sh[0].name};}catch(e){}
  return {rows:tkParseCsv(tkDecodeBytes(u8)),sheet:''};
}

/* ---------- 展示列：优先用用户自定义（tab.colShow，存实际列索引），否则全部 ---------- */
function tkShowCols(tab){
  if(tab.colShow&&tab.colShow.length){
    const valid=tab.colShow.filter(i=>i>=0&&i<tab.cols.length);
    if(valid.length)return valid;
  }
  return tab.cols.map((_,i)=>i);
}

/* ---------- 视图行（每列筛选 + 全局搜索 + 排序，仅影响显示） ---------- */
function tkDisplayRows(tab){
  let data=tab.rows.slice(1);
  if(tab.query){const q=tab.query.toLowerCase();data=data.filter(r=>r.some(c=>String(c||'').toLowerCase().includes(q)));}
  const fk=Object.keys(tab.filters||{}).map(Number).filter(aj=>tab.filters[aj]&&tab.filters[aj].trim()!=='');
  if(fk.length)data=data.filter(r=>fk.every(aj=>String(r[aj]||'').toLowerCase().includes(tab.filters[aj].toLowerCase().trim())));
  if(tab.sortCol>=0){const show=tkShowCols(tab);const aj=show[tab.sortCol];if(aj!=null)data=data.slice().sort((a,b)=>{
    const nx=parseFloat(a[aj]),ny=parseFloat(b[aj]);
    if(!isNaN(nx)&&!isNaN(ny)&&String(a[aj]).trim()!==''&&String(b[aj]).trim()!=='')return (nx-ny)*tab.sortDir;
    return String(a[aj]||'').localeCompare(String(b[aj]||''),'zh')*tab.sortDir;
  });}
  return data;
}

/* ---------- 渲染 ---------- */
function tkRender(mod){
  tkLoad();
  const root=$('#tkRoot-'+mod);if(!root)return;
  const active=document.getElementById('p-'+mod)&&document.getElementById('p-'+mod).classList.contains('on');
  if(!active && root.dataset.built==='1')return;          // 不在前台则不重建，避免后台轮询冲掉编辑
  root.dataset.built='1';
  const m=TK[mod], cfg=TK_MODS[mod];
  const tab=tkTab(mod,m.tab);

  /* 产品类别标签页 */
  const tabs=cfg.tabs.map(t=>{
    const cur=m.tab===t.key;
    const tt=m.tabs[t.key];
    const rows=(tt.rows&&tt.rows.length)?(tt.rows.length-1):0;
    return `<button class="tk-tab ${cur?'on':''}" data-mod="${mod}" data-tab="${t.key}">
      <span>${esc(t.label)}</span><span class="tk-tab-sub">${rows}行</span></button>`;
  }).join('');

  root.innerHTML=`
    <div class="tk-bar">
      <div class="tk-dir">
        <span class="tk-dirlabel" title="${esc(tab.path||'未配置数据源')}">📁 ${esc(tab.path?tkBaseName(tab.path):'未配置数据源')}</span>
        ${FileIO.webview&&tab.path?'<button class="btn sm" id="tkReveal-'+mod+'"><svg class="ic sm"><use href="#i-arr"/></svg>打开</button>':''}
      </div>
      <div class="tk-acts">
        <button class="btn pri sm" id="tkCfg-${mod}"><svg class="ic sm"><use href="#i-folder"/></svg>配置数据源</button>
        <button class="btn sm" id="tkAdd-${mod}"><svg class="ic sm"><use href="#i-plus"/></svg>新增行</button>
        <button class="btn sm" id="tkExport-${mod}"><svg class="ic sm"><use href="#i-dl"/></svg>导出副本</button>
      </div>
    </div>
    <div class="tk-tabs">${tabs}</div>
    <div class="tk-meta" id="tkMeta-${mod}"></div>
    <div class="tk-toolbar" id="tkToolbar-${mod}" ${tab.rows.length?'':'hidden'}>
      <div class="searchbox"><svg class="ic"><use href="#i-search"/></svg><input class="inp" id="tkSearch-${mod}" placeholder="搜索全部内容…"></div>
      <span class="tk-fhint">每列表头下方可单独输入筛选 · 点击任意行查看 / 编辑全部字段</span>
      <button class="btn sm" id="tkColSet-${mod}"><svg class="ic sm"><use href="#i-set"/></svg>列设置</button>
      <button class="btn sm" id="tkClearF-${mod}"><svg class="ic sm"><use href="#i-x"/></svg>清除筛选</button>
    </div>
    <div class="mk-gridwrap" id="tkGrid-${mod}"></div>`;

  const rv=document.getElementById('tkReveal-'+mod);if(rv)rv.onclick=()=>tkRpc({action:'mkReveal',path:tab.path}).catch(()=>{});
  const cfgBtn=document.getElementById('tkCfg-'+mod);if(cfgBtn)cfgBtn.onclick=()=>tkConfigSource(mod,m.tab);
  const ad=document.getElementById('tkAdd-'+mod);if(ad)ad.onclick=()=>tkAddRow(mod,m.tab);
  const ex=document.getElementById('tkExport-'+mod);if(ex)ex.onclick=()=>tkExport(mod,m.tab);
  const cs=document.getElementById('tkColSet-'+mod);if(cs)cs.onclick=()=>tkColSettings(mod,m.tab);
  const cf=document.getElementById('tkClearF-'+mod);if(cf)cf.onclick=()=>{tab.query='';tab.filters={};const s=document.getElementById('tkSearch-'+mod);if(s)s.value='';tkRenderGrid(mod,m.tab);};
  $$('#tkRoot-'+mod+' .tk-tab').forEach(b=>b.onclick=()=>{if(TK[mod].tab!==b.dataset.tab){TK[mod].tab=b.dataset.tab;tkPersist();tkRender(mod);}});
  const srch=document.getElementById('tkSearch-'+mod);if(srch){srch.value=tab.query;srch.oninput=()=>{tab.query=srch.value.trim();tkRenderBody(mod,m.tab);};}

  tkRenderMeta(mod);tkRenderGrid(mod,m.tab);
}
function tkTab(mod,tabKey){tkLoad();if(!TK[mod].tabs[tabKey]){const cfg=TK_MODS[mod].tabs.find(t=>t.key===tabKey);TK[mod].tabs[tabKey]={path:cfg?cfg.def:'',sheet:'',cols:[],rows:[],colShow:null,dirty:false,_bak:'',query:'',filters:{},sortCol:-1,sortDir:1};}return TK[mod].tabs[tabKey];}
function tkRenderMeta(mod){
  const el=document.getElementById('tkMeta-'+mod);if(!el)return;
  const tab=tkTab(mod,TK[mod].tab);
  if(!tab.rows||!tab.rows.length){el.innerHTML='<span class="tk-empty3">尚未加载数据。点「配置数据源」选择该类别的表格文件（支持 xlsx / csv / dbt）。</span>';return;}
  let s=`共 <b>${tab.rows.length-1}</b> 行 · 显示 <b>${tkShowCols(tab).length}</b>/<b>${tab.cols.length}</b> 列`;
  if(tab.colShow&&tab.colShow.length)s+=` · <span class="mk-custom">自定义列</span>`;
  if(tab.dirty)s+=` · <span class="mk-dirty">● 有未保存改动（已缓存到本机）</span>`;else s+=` · <span style="color:var(--green)">已缓存到本机</span>`;
  if(!FileIO.webview)s+=` · <span style="color:var(--amber)">本地模式（仅缓存，导出可保存副本）</span>`;
  el.innerHTML=s;
}
function tkRenderGrid(mod,tabKey){
  const wrap=document.getElementById('tkGrid-'+mod);if(!wrap)return;
  const st=wrap.scrollTop;
  const tab=tkTab(mod,tabKey);
  if(!tab.rows||!tab.rows.length){wrap.innerHTML=`<div class="empty"><svg class="ic"><use href="#i-grid"/></svg><div>还没有数据，点「配置数据源」选择表格文件</div></div>`;return;}
  const cols=tab.cols, show=tkShowCols(tab);
  const longByActual=cols.map(c=>/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i.test(String(c||'')));
  let h=`<table class="mk-table"><thead>`;
  h+=`<tr class="mk-hrow"><th class="mk-rownum">#</th>`;
  show.forEach((aj,dj)=>{
    h+=`<th class="mk-th${tab.sortCol===dj?' on':''}" data-aj="${aj}">${esc(cols[aj]||'')}`+
       (tab.sortCol===dj?`<span class="mk-arrow">${tab.sortDir===1?' ▲':' ▼'}</span>`:'')+
       `<span class="mk-thx" data-x="${aj}" title="删除该列">×</span></th>`;
  });
  h+=`<th class="mk-th-act"></th></tr>`;
  h+=`<tr class="mk-frow"><th class="mk-rownum"></th>`;
  show.forEach(aj=>{
    const f=tab.filters[aj]||'';
    h+=`<th class="mk-fltth"><input class="inp mk-flt" data-aj="${aj}" value="${esc(f)}" placeholder="筛选"></th>`;
  });
  h+=`<th class="mk-th-act"></th></tr>`;
  h+=`</thead><tbody id="tkTbody-${mod}"></tbody></table>`;
  wrap.innerHTML=h;wrap.scrollTop=st;
  $$('#tkGrid-'+mod+' .mk-th').forEach(th=>{
    const aj=+th.dataset.aj;
    th.addEventListener('click',e=>{if(e.target.classList.contains('mk-thx'))return;const dj=show.indexOf(aj);
      if(tab.sortCol===dj)tab.sortDir*=-1;else{tab.sortCol=dj;tab.sortDir=1;}tkRenderGrid(mod,tabKey);});
    th.addEventListener('dblclick',e=>{if(e.target.classList.contains('mk-thx'))return;tkRenameCol(mod,tabKey,aj);});
  });
  $$('#tkGrid-'+mod+' .mk-thx').forEach(x=>x.onclick=()=>tkDelCol(mod,tabKey,+x.dataset.x));
  $$('#tkGrid-'+mod+' .mk-flt').forEach(inp=>{const aj=+inp.dataset.aj;inp.oninput=()=>{tab.filters[aj]=inp.value;tkRenderBody(mod,tabKey);};});
  tkRenderBody(mod,tabKey);
}
function tkRenderBody(mod,tabKey){
  const tb=document.getElementById('tkTbody-'+mod);if(!tb)return;
  const wrap=document.getElementById('tkGrid-'+mod);const st=wrap?wrap.scrollTop:0;
  const tab=tkTab(mod,tabKey);
  const cols=tab.cols, show=tkShowCols(tab);
  const longByActual=cols.map(c=>/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i.test(String(c||'')));
  const data=tkDisplayRows(tab);
  let h='';
  if(!data.length)h=`<tr><td colspan="${show.length+2}" class="mk-nodata">没有匹配的行</td></tr>`;
  data.forEach(r=>{
    const ri=tab.rows.indexOf(r);
    h+=`<tr data-ri="${ri}" style="cursor:pointer">`;
    h+=`<td class="mk-rownum">${ri}</td>`;
    show.forEach(aj=>{
      const v=r[aj],isLong=longByActual[aj],empty=v===''||v==null;
      h+=`<td class="mk-td${isLong?' mk-long':''}" data-ri="${ri}" data-aj="${aj}" title="点击查看全部字段">${empty?'<span class="mk-ph">—</span>':esc(v)}</td>`;
    });
    h+=`<td class="mk-td-act">
      <button class="iconbtn" title="查看 / 编辑全部字段"><svg class="ic sm"><use href="#i-edit"/></svg></button>
      <button class="iconbtn dgr tk-delrow" data-ri="${ri}" title="删除该行"><svg class="ic sm"><use href="#i-trash"/></svg></button></td></tr>`;
  });
  tb.innerHTML=h;
  if(wrap)wrap.scrollTop=st;
  $$('#tkTbody-'+mod+' tr').forEach(tr=>{tr.onclick=()=>{const ri=+tr.dataset.ri;tkOpenDetail(mod,tabKey,ri);};});
  $$('#tkGrid-'+mod+' .tk-delrow').forEach(b=>b.onclick=e=>{e.stopPropagation();tkDelRow(mod,tabKey,+b.dataset.ri);});
}

/* ---------- 详情：点击行查看 / 编辑全部字段 ---------- */
function tkRichHtml(plain){
  const re=/(https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?=\s|$))|(https?:\/\/[^\s<>"']+)/gi;
  return String(plain||'').split('\n').map(line=>{
    if(!line.trim())return '<div class="mk-rich-line">&nbsp;</div>';
    const s=esc(line).replace(re,(m,isImg)=>isImg
      ? `<a href="${isImg}" target="_blank" rel="noopener"><img class="mk-rich-img" src="${isImg}" alt="图片" loading="lazy"></a>`
      : `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
    return `<div class="mk-rich-line">${s}</div>`;
  }).join('');
}
function tkDetailBody(mod,tabKey,ri){
  const tab=tkTab(mod,tabKey);const cols=tab.cols, row=tab.rows[ri];
  const longRe=/进展|备注|说明|描述|历史|内容|详情|detail|note|desc|remark|comment/i;
  let body='';
  cols.forEach((c,j)=>{
    const v=row[j]==null?'':row[j];
    const isLong=longRe.test(String(c||''));
    const lab=esc(c||('列'+j));
    if(isLong){
      body+=`<div class="fld" style="margin-bottom:11px"><label>${lab} <span style="color:var(--tx3);font-weight:400;font-size:11px">（多行，支持链接/图片，下方实时预览）</span></label>`+
        `<textarea class="inp mk-detail-ta" data-mkj="${j}" data-rich="1" style="min-height:${String(v).length>120?170:84}px">${esc(v)}</textarea>`+
        `<div class="mk-rich-preview" data-prev="${j}">${tkRichHtml(v)}</div></div>`;
    }else{
      body+=`<div class="fld" style="margin-bottom:11px"><label>${lab}</label><input class="inp" data-mkj="${j}" value="${esc(v)}"></div>`;
    }
  });
  return body;
}
function tkOpenDetail(mod,tabKey,ri){
  const tab=tkTab(mod,tabKey);
  openModal(TK_MODS[mod].title+' · '+TK_MODS[mod].tabs.find(t=>t.key===tabKey).label+' · 第 '+(ri+1)+' 行', tkDetailBody(mod,tabKey,ri),
    `<button class="btn" id="tkDetClose">关闭</button><button class="btn pri" id="tkDetSave"><svg class="ic sm"><use href="#i-check-sq"/></svg>保存修改</button>`);
  $$('#modalRoot [data-rich="1"]').forEach(ta=>{
    ta.addEventListener('input',()=>{const pj=ta.dataset.mkj;const pv=document.querySelector('#modalRoot [data-prev="'+pj+'"]');if(pv)pv.innerHTML=tkRichHtml(ta.value);});
  });
  const close=$('#tkDetClose');if(close)close.onclick=closeModal;
  const save=$('#tkDetSave');if(save)save.onclick=()=>{
    $$('#modalRoot [data-mkj]').forEach(inp=>{const j=+inp.dataset.mkj;if(String(tab.rows[ri][j]??'')!==String(inp.value))tab.rows[ri][j]=inp.value;});
    tkScheduleSave(mod,tabKey);tkRenderGrid(mod,tabKey);closeModal();toast('已保存修改（已缓存到本机）','ok');
  };
}
function tkRenameCol(mod,tabKey,j){
  const tab=tkTab(mod,tabKey);
  openModal('重命名列',`<input class="inp" id="tkNewName" value="${esc(tab.cols[j]||'')}" style="width:100%">`,
    `<button class="btn" id="tkRnNo">取消</button><button class="btn pri" id="tkRnYes">确定</button>`);
  const i=$('#tkNewName');if(i)i.focus();
  $('#tkRnNo').onclick=closeModal;
  $('#tkRnYes').onclick=()=>{tab.cols[j]=$('#tkNewName').value.trim();closeModal();tkScheduleSave(mod,tabKey);tkRenderGrid(mod,tabKey);};
}
function tkDelCol(mod,tabKey,j){
  const tab=tkTab(mod,tabKey);
  confirmBox('删除这一列？','列名：'+(tab.cols[j]||'')+'。删除后无法撤销（数据已缓存，可重新导入恢复）。',()=>{
    tab.cols.splice(j,1);tab.rows.forEach(r=>r.splice(j,1));
    if(tab.colShow)tab.colShow=tab.colShow.filter(x=>x!==j).map(x=>x>j?x-1:x);
    tkScheduleSave(mod,tabKey);tab.filters={};tkRender(mod);});
}
function tkDelRow(mod,tabKey,ri){
  const tab=tkTab(mod,tabKey);
  confirmBox('删除这一行？','删除后无法撤销（数据已缓存，可重新导入恢复）。',()=>{
    tab.rows.splice(ri,1);tkScheduleSave(mod,tabKey);tkRenderGrid(mod,tabKey);tkRenderMeta(mod);});
}
function tkAddRow(mod,tabKey){
  const tab=tkTab(mod,tabKey);
  tab.rows.push(tab.cols.map(()=>''));tkScheduleSave(mod,tabKey);tkRenderGrid(mod,tabKey);
  const w=document.getElementById('tkGrid-'+mod);if(w)w.scrollTop=w.scrollHeight;
}
/* 自定义展示列：勾选要显示的实际列，应用后写入 tab.colShow（实际列索引，随增删列自动校正）。 */
function tkColSettings(mod,tabKey){
  const tab=tkTab(mod,tabKey);const cols=tab.cols, cur=tkShowCols(tab);
  let body=`<div class="mk-colsets">`+cols.map((c,j)=>{
    const on=cur.includes(j);
    return `<label class="mk-colset"><input type="checkbox" data-cj="${j}" ${on?'checked':''}><span>${esc(c||('列'+(j+1)))}</span></label>`;
  }).join('')+`</div>
  <div class="btn-row" style="margin-top:10px">
    <button class="btn sm" id="tkColAll">全选</button>
    <button class="btn sm" id="tkColNone">全不选</button>
    <button class="btn sm" id="tkColDef">恢复默认（显示全部）</button>
  </div>`;
  openModal('自定义展示列 · '+TK_MODS[mod].title, body,
    `<button class="btn" id="tkColCancel">取消</button><button class="btn pri" id="tkColOk">应用</button>`);
  const boxes=()=>$$('#modalRoot [data-cj]');
  const all=$('#tkColAll');if(all)all.onclick=()=>boxes().forEach(c=>c.checked=true);
  const none=$('#tkColNone');if(none)none.onclick=()=>boxes().forEach(c=>c.checked=false);
  const def=$('#tkColDef');if(def)def.onclick=()=>{tab.colShow=null;tkPersist();tkRenderGrid(mod,tabKey);closeModal();toast('已恢复默认列（显示全部）','ok');};
  const canc=$('#tkColCancel');if(canc)canc.onclick=()=>{tab.colShow=null;closeModal();};
  const okB=$('#tkColOk');if(okB)okB.onclick=()=>{
    const idx=boxes().filter(c=>c.checked).map(c=>+c.dataset.cj);
    tab.colShow=idx.length?idx:null;tkPersist();tkRenderGrid(mod,tabKey);closeModal();toast('已更新展示列','ok');
  };
}

/* ---------- 数据源配置（每 tab 可单独设置，只读加载，不改动原文件） ---------- */
function tkScheduleSave(mod,tabKey){const tab=tkTab(mod,tabKey);tab.dirty=true;tkRenderMeta(mod);tkPersist();}
async function tkConfigSource(mod,tabKey){
  const tab=tkTab(mod,tabKey);
  if(FileIO.webview){
    let r;try{r=await tkRpc({action:'mkPickTable'});}catch(e){toast('选择文件失败：'+(e.message||e),'err');return;}
    if(!r.ok){if(r.error)toast('选择失败：'+r.error,'err');else toast('已取消选择');return;}
    if(!r.path||!r.text){toast('未能读取文件内容（文件可能为空、被占用，或是在线文件请先下载到本地）','err');return;}
    await tkLoadFile(mod,tabKey,r.path,r.text);
  }else{
    tkConfigSourceBrowser(mod,tabKey);
  }
}
function tkConfigSourceBrowser(mod,tabKey){
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.csv,.dbt';
  inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
    const buf=await f.arrayBuffer();
    await tkLoadFile(mod,tabKey,f.name, bytesToB64(new Uint8Array(buf)));
  };
  inp.click();
}
async function tkLoadFile(mod,tabKey,path,textB64){
  const tab=tkTab(mod,tabKey);
  try{
    toast('正在读取 '+tkBaseName(path),'…');
    let u8;
    if(textB64){u8=b64ToBytes(textB64);}
    else{
      const r=await tkRpc({action:'mkRead',path});
      if(!r.ok)throw new Error(r.error||'读取失败');
      if(!r.text)throw new Error('文件内容为空');
      u8=b64ToBytes(r.text);
    }
    let res;
    try{res=await tkParse(path,u8);}
    catch(e){
      if(e.code==='WPS_ONLINE'){
        tab.path=path;tab.cols=[];tab.rows=[];tkPersist();tkRender(mod);
        openModal('该文件是在线文件，本地没有数据',
          `<div style="line-height:1.8">选中的 <b>${esc(tkBaseName(path))}</b> 是 WPS 云盘的「在线文件」占位（${esc(path)}），本地只有云指针、没有真实内容。<br><br>请任选一种方式后重新「配置数据源」：<br>
          ① 在 WPS / 文件管理器里对该文件点「<b>下载</b> / 始终保留在此设备</b>」，让它变成真正可读取的文件；<br>
          ② 或在 WPS 里把表格<b>导出为 Excel(.xlsx)</b>，再指向导出文件。</div>`,
          `<button class="btn pri" onclick="closeModal()">知道了</button>`);
        return;
      }
      throw e;
    }
    const rows=tkNormalizeRows(res.rows);
    tab.path=path;tab.sheet=res.sheet||'';tab.cols=rows[0]||[];tab.rows=rows;
    tab.query='';tab.filters={};tab.sortCol=-1;tab.sortDir=1;tab.dirty=false;
    tkPersist();tkRender(mod);
    toast('已加载：'+tkBaseName(path)+'（'+(rows.length-1)+' 行）','ok');
  }catch(e){toast('打开表格失败：'+(e.message||e),'err');}
}
function tkExport(mod,tabKey){
  const tab=tkTab(mod,tabKey);
  if(!tab.rows||!tab.rows.length){toast('没有可导出的数据','err');return;}
  const {ext,bytes}=tkSerialize(tab);
  const base=tab.path?tkBaseName(tab.path).replace(/\.(xlsx|csv|dbt)$/i,'')+'_导出':(TK_MODS[mod].title+'_'+TK_MODS[mod].tabs.find(t=>t.key===tabKey).label);
  const name=base+'.'+ext;
  download(new Blob([bytes],{type:ext==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
  toast('已导出副本：'+name+'（原始文件未被改动）','ok');
}

/* 启动时恢复状态（仅读取 localStorage，不触碰任何文件） */
tkLoad();
</script>

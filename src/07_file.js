<script>
/* ==================== 配置文件数据源（实时读写本地文件） ==================== */
/* 设计：优先走 WebView2 的 C# 桥（exe 内可真正实时读写任意本地文件）；
   浏览器打开时回退到 File System Access API（localhost/https）或「下载覆盖」（file://）。 */
const CFG_KEY='wb_office_desk_config';
let CONFIG_BIND=null;          // {path, mode:'json'|'xlsx', downloadOnly?}
let fileSyncTimer=null, fileBusy=false;

/* ---------- base64 辅助（xlsx 二进制在 C# 桥里以 base64 传输） ---------- */
function bytesToB64(u8){let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s);}
function b64ToBytes(b64){const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8;}
function btoaBytes(arrbuf){return bytesToB64(new Uint8Array(arrbuf));}

/* ---------- 传输层 ---------- */
const FileIO={
  webview:(typeof window!=='undefined'&&window.chrome&&window.chrome.webview)?window.chrome.webview:null,
  _seq:0,_pending:new Map(),_handle:null,
  init(){
    if(this.webview){
      this.webview.addEventListener('message',ev=>{
        let m;try{m=typeof ev.data==='string'?JSON.parse(ev.data):ev.data;}catch(e){return;}
        if(m&&m.id!=null&&this._pending.has(m.id)){const p=this._pending.get(m.id);this._pending.delete(m.id);
          if(m.ok)p.resolve(m);else p.reject(new Error(m.error||'文件操作失败'));}
      });
    }
  },
  rpc(msg){
    if(!this.webview)return Promise.reject(new Error('no-bridge'));
    const id=++this._seq,full=Object.assign({id},msg);
    return new Promise((resolve,reject)=>{this._pending.set(id,{resolve,reject});this.webview.postMessage(full);});
  },
  /* 选择并读取一个配置文件（exe 走 C# 对话框；浏览器走 <input type=file>） */
  async pickOpen(){
    if(this.webview){const r=await this.rpc({action:'pickOpen'});return r;}
    return new Promise(resolve=>{const inp=document.createElement('input');inp.type='file';inp.accept='.json,.xlsx';
      inp.onchange=()=>{const f=inp.files[0];if(!f){resolve({ok:false});return;}
        const isXls=/\.xlsx$/i.test(f.name);const rd=new FileReader();
        rd.onload=()=>{isXls?resolve({ok:true,path:f.name,text:btoaBytes(rd.result)}):resolve({ok:true,path:f.name,text:rd.result});};
        isXls?rd.readAsArrayBuffer(f):rd.readAsText(f);};
      inp.click();});
  },
  /* 选择保存位置（exe 走 C# 对话框；浏览器优先 FSA，否则返回 ok:false 触发下载回退） */
  async pickSave(){
    if(this.webview){const r=await this.rpc({action:'pickSave'});return r;}
    if(window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:'办公工作台数据.json',
      types:[{description:'配置文件',accept:{'application/json':['.json'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
      return {ok:true,path:h.name,handle:h};}catch(e){return {ok:false};}}
    return {ok:false};
  },
  /* 读取已绑定文件；浏览器无句柄时返回 ok:false */
  async read(path,mode){
    if(this.webview){const r=await this.rpc({action:'readConfig',path,binary:mode==='xlsx'});return {ok:r.ok,text:r.text};}
    if(this._handle){const f=await this._handle.getFile();
      if(mode==='xlsx')return {ok:true,text:btoaBytes(await f.arrayBuffer())};
      return {ok:true,text:await f.text()};}
    return {ok:false};
  },
  /* 写回已绑定文件；浏览器无句柄时改为下载 */
  async write(path,content,mode){
    if(this.webview){const text=mode==='json'?content:bytesToB64(content);
      const r=await this.rpc({action:'writeConfig',path,text,binary:mode==='xlsx'});return {ok:r.ok};}
    if(this._handle){const w=await this._handle.createWritable();await w.write(content);await w.close();return {ok:true};}
    const blob=mode==='json'?new Blob([content],{type:'application/json'}):new Blob([content],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    download(blob,path.split(/[\\/]/).pop());return {ok:true,downloaded:true};
  }
};

/* ---------- 绑定状态持久化（存于 localStorage，exe 重启后自动重新加载） ---------- */
function loadConfigBind(){try{const r=localStorage.getItem(CFG_KEY);if(r)CONFIG_BIND=JSON.parse(r);}catch(e){}}
function saveConfigBind(){try{localStorage.setItem(CFG_KEY,JSON.stringify(CONFIG_BIND));}catch(e){}}
function detectMode(path){return /\.xlsx$/i.test(path)?'xlsx':'json';}

/* ---------- 序列化整库 ↔ 文件内容 ---------- */
function dbToContent(mode){
  if(mode==='json')return JSON.stringify({version:DB.version||1,tasks:DB.tasks,notes:DB.notes,projects:DB.projects,settings:DB.settings,meta:DB.meta},null,2);
  return buildWorkbookBytes([['待办',taskRows()],['灵感',noteRows()],['项目',projRows()],['配置',cfgRows()]]);
}
async function loadDbFromConfigFile(text,mode){
  if(mode==='json'){const o=JSON.parse(typeof text==='string'?text:new TextDecoder().decode(text));applyData(o,'配置文件');return;}
  const u8=typeof text==='string'?b64ToBytes(text):text;
  const {jsonObj,ts,ns,ps,cfg}=await parseWorkbook(u8);
  if(jsonObj){applyData(jsonObj,'配置文件');return;}
  if(ts.length||ns.length||ps.length){
    applyStructured(ts,ns,ps);
    if(cfg.length)applyConfigSheet(cfg);
    DB.meta.sample=false;save();renderAll();toast('已从配置文件恢复 '+totalCount()+' 条数据','ok');
    return;
  }
  throw new Error('文件中没找到可识别的数据');
}

/* ---------- 实时写回 ---------- */
function scheduleFileSync(){
  if(!CONFIG_BIND)return;
  clearTimeout(fileSyncTimer);
  fileSyncTimer=setTimeout(fileSync,400);
}
async function fileSync(){
  if(!CONFIG_BIND||fileBusy)return;
  fileBusy=true;
  try{
    const content=dbToContent(CONFIG_BIND.mode);
    const res=await FileIO.write(CONFIG_BIND.path,content,CONFIG_BIND.mode);
    if(res.ok){if(res.downloaded)toast('已生成最新配置文件，请保存覆盖原文件','ok');else updateCfgBadge();}
    else toast('写入配置文件失败','err');
  }catch(e){toast('写入配置文件失败：'+(e.message||e),'err');}
  finally{fileBusy=false;}
}

/* ---------- 面板 UI ---------- */
function updateCfgBadge(){
  const el=$('#navStore');if(el)el.textContent=CONFIG_BIND?CONFIG_BIND.path.split(/[\\/]/).pop():'本机浏览器';
  const cs=$('#cfgStatus');if(cs){
    if(CONFIG_BIND)cs.innerHTML=`已绑定配置文件：<b>${esc(CONFIG_BIND.path)}</b>（${CONFIG_BIND.mode==='xlsx'?'Excel':'JSON'}）${CONFIG_BIND.downloadOnly?'<br><span style="color:var(--amber)">当前为本地打开模式，只能下载覆盖，无法自动重新加载</span>':'<br>所有改动实时写回，文件被外部修改后点「重新加载」刷新。'}`;
    else cs.innerHTML='尚未绑定配置文件，数据仅保存在本机浏览器。';
  }
}
function openConfigPanel(){
  const bound=CONFIG_BIND;
  const pathHtml=bound?`<div class="cfg-path"><svg class="ic"><use href="#i-file"/></svg><span>${esc(bound.path)}</span></div>
    <div class="cfg-mode">格式：${bound.mode==='xlsx'?'Excel (.xlsx)':'JSON'}${bound.downloadOnly?' · 本地打开模式':''}</div>`
    :`<div class="cfg-none">尚未绑定配置文件，数据仅保存在本机浏览器（localStorage）。</div>`;
  const body=`<div class="fld" style="margin-bottom:10px">${pathHtml}</div>
    <p style="font-size:12.5px;color:var(--tx2);line-height:1.7;margin:0 0 14px">
      绑定后，所有改动会<b>实时写回</b>该文件；用 Excel / 记事本改了文件后，点「重新加载」即可刷新页面。<br>
      把文件放在 OneDrive / 同步盘里，就能在多台设备间自动同步数据。</p>
    <div class="cfg-btns">
      ${bound?'':'<button class="btn pri" id="cfgPick">选择配置文件…</button>'}
      <button class="btn" id="cfgSaveAs">另存为新配置文件…</button>
      ${bound?'<button class="btn" id="cfgReload"><svg class="ic sm"><use href="#i-refresh"/></svg>重新加载</button>':''}
      ${bound?'<button class="btn dgr" id="cfgUnbind">解除绑定</button>':''}
    </div>`;
  openModal('配置文件数据源',body,`<button class="btn" id="cfgClose">关闭</button>`);
  $('#cfgClose').onclick=closeModal;
  const sw=$('#cfgPick');if(sw)sw.onclick=bindConfigFile;
  const sa=$('#cfgSaveAs');if(sa)sa.onclick=saveAsConfigFile;
  const rl=$('#cfgReload');if(rl)rl.onclick=reloadConfigFile;
  const ub=$('#cfgUnbind');if(ub)ub.onclick=unbindConfigFile;
}
async function bindConfigFile(){
  const r=await FileIO.pickOpen();
  if(!r.ok||!r.path)return;
  const mode=detectMode(r.path);
  try{
    await loadDbFromConfigFile(r.text,mode);
    CONFIG_BIND={path:r.path,mode};
    if(!FileIO.webview)CONFIG_BIND.downloadOnly=true;
    saveConfigBind();closeModal();renderAll();updateCfgBadge();
    toast('已绑定配置文件：'+r.path,'ok');
  }catch(e){toast('该文件无法解析：'+(e.message||e),'err');}
}
async function saveAsConfigFile(){
  const r=await FileIO.pickSave();
  if(!r.ok){
    if(FileIO.webview)return;
    const name=(window.prompt('输入配置文件名（不含扩展名）','办公工作台数据')||'').trim();
    if(!name)return;
    CONFIG_BIND={path:name+'.json',mode:'json',downloadOnly:true};saveConfigBind();
    await fileSync();closeModal();renderAll();updateCfgBadge();
    toast('已生成最新文件，请保存覆盖原文件','ok');
    return;
  }
  let mode=detectMode(r.path),path=r.path;
  if(!/\.(json|xlsx)$/i.test(path)){path+='.json';mode='json';}
  if(r.handle)FileIO._handle=r.handle;
  CONFIG_BIND={path,mode};saveConfigBind();
  await fileSync();closeModal();renderAll();updateCfgBadge();
  toast('已另存为配置文件：'+path,'ok');
}
async function reloadConfigFile(){
  if(!CONFIG_BIND)return;
  if(CONFIG_BIND.downloadOnly){toast('当前为本地打开模式，无法自动重新加载；请用窗口版 exe 或 localhost 方式打开本页','err');return;}
  try{
    const r=await FileIO.read(CONFIG_BIND.path,CONFIG_BIND.mode);
    if(!r.ok)throw new Error('读取失败');
    await loadDbFromConfigFile(r.text,CONFIG_BIND.mode);
    closeModal();renderAll();updateCfgBadge();
    toast('已重新加载配置文件','ok');
  }catch(e){toast('重新加载失败：'+(e.message||e),'err');}
}
function unbindConfigFile(){
  confirmBox('解除绑定？','解除后数据仍保留在本机浏览器，但不会再自动写回该文件。',()=>{
    CONFIG_BIND=null;saveConfigBind();closeModal();updateCfgBadge();toast('已解除绑定');});
}

/* ==================== 启动引导（在 06 之后运行，保证 FileIO 已就绪） ==================== */
FileIO.init();
loadConfigBind();
renderAll();
updateCfgBadge();
/* 配置文件数据源的「从服务端共享 DB 初始化 / 从本地文件启动」由 08_sync.js 统一调度，
   保证窗口版 exe（有服务端）与纯浏览器打开（无服务端）行为一致。 */
async function bootFromConfig(){
  try{
    const r=await FileIO.read(CONFIG_BIND.path,CONFIG_BIND.mode);
    if(!r.ok)throw new Error('读取失败');
    await loadDbFromConfigFile(r.text,CONFIG_BIND.mode);
    toast('已从配置文件载入：'+CONFIG_BIND.path,'ok');
  }catch(e){
    toast('绑定文件读取失败，已回退到本地数据：'+(e.message||e),'err');
    CONFIG_BIND=null;saveConfigBind();
  }
  renderAll();updateCfgBadge();
}
</script>

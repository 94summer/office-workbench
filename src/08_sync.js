<script>
/* ==================== 服务端共享同步（PC / 手机同源共用一份数据） ==================== */
/* 背景：exe 内嵌 HTTP 服务是「配置文件」的唯一权威源。PC 把配置文件的整库推送到服务端，
   服务端再把整库注入到每一个打开的页面（包括手机通过局域网 IP 访问的页面），
   这样手机看到的就不再是各自浏览器里的默认数据，而是同一份配置文件数据。
   仅当页面通过 http(s) 提供服务时启用；双击 file:// 打开时不启用，回退到本机存储。 */
const ServerSync=(function(){
  const enabled=(location.protocol==='http:'||location.protocol==='https:');
  let localRev=0, syncTimer=null, pollTimer=null, hasServerDb=false;
  const api=p=>location.origin+p;

  /* 初始化：优先使用服务端注入的共享 DB；若服务端尚无数据但本地已绑定配置文件，则先把文件数据推上去 */
  async function init(){
    if(!enabled)return;
    const db=(typeof window.__SERVER_DB__!=='undefined'&&window.__SERVER_DB__!=null)?window.__SERVER_DB__:null;
    const rev=window.__SERVER_REV__||0;
    if(db){
      try{localStorage.setItem(KEY,JSON.stringify(db));}catch(e){}
      DB=db;load();localRev=rev;hasServerDb=true;renderAll();
    }
    if(CONFIG_BIND)push();   // 只有绑定了配置文件的客户端（PC）负责把文件数据发布到服务端
    startPoll();             // 所有客户端都拉取，保持实时同步
  }
  /* 保存时调用：把当前整库推送到服务端（服务端自增修订号，返回新 rev） */
  function push(){
    if(!enabled)return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(async()=>{
      try{
        const r=await fetch(api('/api/push'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({db:DB})});
        const j=await r.json();
        if(j&&j.rev)localRev=j.rev;
      }catch(e){}
    },500);
  }
  /* 定时拉取：发现服务端有更新的修订就采用，使多端实时一致；PC 端会顺带写回配置文件 */
  function startPoll(){
    if(!enabled||pollTimer)return;
    pollTimer=setInterval(async()=>{
      try{
        const r=await fetch(api('/api/state'));const j=await r.json();
        if(j&&j.rev&&j.rev>localRev&&j.db){
          localRev=j.rev;DB=j.db;
          try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}
          load();renderAll();
          if(CONFIG_BIND){await fileSync();toast('已同步其它设备的改动并写回配置文件','ok');}
          else toast('已同步其它设备的改动','ok');
        }
      }catch(e){}
    },4000);
  }
  return{init,push,startPoll,get hasServerDb(){return hasServerDb;},get enabled(){return enabled;}};
})();
function scheduleServerSync(){ if(ServerSync.enabled)ServerSync.push(); }

/* ==================== 启动引导（在 07 之后运行，保证 ServerSync / bootFromConfig / fileSync 均已就绪） ==================== */
if(ServerSync.enabled){ ServerSync.init(); }
else { if(CONFIG_BIND){ bootFromConfig(); } }
</script>

const {app,BrowserWindow}=require('electron');
const http=require('http');
const fs=require('fs');
const path=require('path');
const os=require('os');

const HTML_PATH=path.join(__dirname,'app.html');
const PORT=9876;

function lanIP(){
  const ifs=os.networkInterfaces();
  for(const k in ifs){for(const a of ifs[k]){if(a.family==='IPv4'&&!a.internal)return a.address;}}
  return '127.0.0.1';
}

let server=null;
function startServer(){
  const content=fs.readFileSync(HTML_PATH);
  server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.end(content);
  });
  server.listen(PORT,'0.0.0.0',()=>console.log('serving on :'+PORT));
}

let win=null;
function createWindow(){
  const ip=lanIP();
  win=new BrowserWindow({
    width:1200,height:820,minWidth:380,minHeight:600,
    title:'个人办公工作台',backgroundColor:'#0e9b8e',
    webPreferences:{contextIsolation:true,nodeIntegration:false,spellcheck:false}
  });
  win.loadURL('http://127.0.0.1:'+PORT+'/');
  win.once('ready-to-show',()=>win.show());
  win.webContents.on('did-finish-load',()=>{
    win.setTitle('个人办公工作台 · 手机访问：http://'+ip+':'+PORT);
  });
  win.on('closed',()=>{win=null;});
}

app.whenReady().then(()=>{
  startServer();createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{
  if(process.platform!=='darwin'){if(server)server.close();app.quit();}
});

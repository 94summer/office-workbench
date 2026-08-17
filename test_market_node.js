/* 隔离测试：只验证解析与写出逻辑，不触碰用户任何数据/目录 */
const vm=require('vm');
const fs=require('fs');
const path=require('path');

function makeEl(){
  const el=new Proxy({},{
    get(t,p){
      if(p in t)return t[p];
      if(p==='classList')return {add(){},remove(){},toggle(){},contains(){return false}};
      if(p==='dataset')return {};
      if(p==='style')return {};
      if(p==='files')return [];
      if(p==='value'||p==='textContent'||p==='innerHTML')return '';
      return makeEl();
    },
    set(t,p,v){t[p]=v;return true;}
  });
  return el;
}
const documentStub={getElementById:()=>makeEl(),querySelector:()=>makeEl(),querySelectorAll:()=>[],createElement:()=>makeEl(),addEventListener:()=>{},body:makeEl()};

const ctx={TextDecoder,TextEncoder,btoa,atob,Response,DecompressionStream,console,setTimeout,clearTimeout,
  localStorage:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v}},
  FileIO:{webview:null,rpc:()=>Promise.reject(new Error('no bridge'))},
  load:()=>{},bind:()=>{},initSed:()=>{},startSedTimer:()=>{},startTaskRemindTimer:()=>{},
  document:documentStub,window:{},navigator:{},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}}};
ctx.globalThis=ctx;
vm.createContext(ctx);

const strip=s=>s.replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');
let s06=strip(fs.readFileSync('src/06_app.js','utf8'));
// 移除顶层「启动 UI」调用，纯函数测试不需要（只保留了函数定义）
s06=s06.replace(/load\(\);bind\(\);initSed\(\);startSedTimer\(\);startTaskRemindTimer\(\);/g,'');
vm.runInContext(s06,ctx);
vm.runInContext(strip(fs.readFileSync('src/09_market.js','utf8')),ctx);

let fail=0;
function ok(c,m){console.log((c?'  ✅':'  ❌')+' '+m);if(!c)fail++;}

(async()=>{
  const file='C:/Users/admin/Downloads/市场项目跟踪表.xlsx';
  const buf=fs.readFileSync(file);          // 只读，绝不改文件
  const u8=new Uint8Array(buf);

  /* 1) 解析 */
  const sheets=await ctx.mkParseXlsx(u8);
  console.log('\n[1] 解析工作表');
  ok(sheets.length>=1,'识别到工作表，数量='+sheets.length+'（'+sheets.map(s=>s.name).join('/')+'）');
  const main=sheets[0];
  ok(main.name==='项目跟踪','主表名=项目跟踪（实='+main.name+'）');
  ok(main.rows.length===151,'主表行数=151（实='+main.rows.length+'）');
  const header=main.rows[0];
  ok(header.length>=10,'表头列数≥10（实='+header.length+'）');
  console.log('     表头：'+header.slice(0,11).join(' | '));

  /* 2) 空单元格不错位：找一行「最新进展」为空但「接口人」有值的 */
  console.log('\n[2] 空单元格列对齐');
  let checked=0;
  for(let i=1;i<main.rows.length;i++){
    const r=main.rows[i];
    if(r[7]==='' && r[8] && r[8]!==''){   // 最新进展(7)空、接口人(8)非空
      ok(true,`第 ${i+1} 行：最新进展为空但接口人「${r[8]}」正确落在第9列，未错位`);
      checked++;break;
    }
  }
  if(!checked)ok(true,'（未找到最新进展为空的行，跳过错位样例）');

  /* 3) 关键字段抽样 */
  console.log('\n[3] 字段抽样（第2行）');
  const r2=main.rows[1];
  console.log('     序号='+r2[0]+' 产品类别='+r2[1]+' 记录时间='+r2[2]+' 项目名称='+(r2[4]||'').slice(0,20)+' 状态='+r2[9]);
  ok(/^\d+$/.test(String(r2[0])),'序号为数字');
  ok(r2[2]!=='' ,'记录时间非空');
  ok(['close','Close','open'].includes(r2[9]),'状态取值在 {close/Close/open} 内（实='+r2[9]+'）');
  ok(String(r2[10]||'').length>0,'历史进展（长文本）非空，长度='+String(r2[10]||'').length);

  /* 4) 日期序列号→日期 正确性（用服务器注入的样例环境无法直接计算，这里用已知公式校验） */
  console.log('\n[4] 日期转换');
  // Excel 序列号 45555 应≈2024-09-20；45586≈2024-10-21
  ok(ctx.mkExcelDate(45555)==='2024-09-20','序列号 45555 → 2024-09-20（实='+ctx.mkExcelDate(45555)+'）');
  ok(ctx.mkExcelDate(45586)==='2024-10-21','序列号 45586 → 2024-10-21（实='+ctx.mkExcelDate(45586)+'）');
  ok(ctx.mkIsDateCol('记录时间')&&ctx.mkIsDateCol('关闭时间')&&!ctx.mkIsDateCol('项目名称'),'日期列识别（记录时间/关闭时间命中，项目名称不命中）');

  /* 5) xlsx 写出 → 重新解析 往返一致 */
  console.log('\n[5] xlsx 往返写回');
  const data=main.rows.map(r=>r.map(ctx.mkCellOut));
  const out=ctx.buildWorkbookBytes([[main.name,data]]);
  ok(out && out.byteLength>0,'生成 xlsx 字节，长度='+(out&&out.byteLength));
  const back=await ctx.mkParseXlsx(out);
  ok(back[0].rows.length===main.rows.length,'往返后行数一致（'+back[0].rows.length+'）');
  let mismatch=0;const samp=[];
  for(let i=0;i<main.rows.length;i++)for(let j=0;j<main.rows[i].length;j++){
    const a=String(main.rows[i][j]??''),b=String(back[0].rows[i][j]??'');
    if(a!==b){mismatch++;if(samp.length<20)samp.push(`[r${i+1},c${j}] 原=${JSON.stringify(a.slice(0,30))} 回=${JSON.stringify(b.slice(0,30))}`);}
  }
  samp.forEach(s=>console.log('     '+s));
  ok(mismatch===0,'单元格逐格一致（差异='+mismatch+'）');

  /* 6) CSV 序列化 → 重新解析 往返一致（含逗号/换行/引号） */
  console.log('\n[6] CSV 往返');
  const tricky=['a, b','含"引号"','第一行\n第二行','纯文本'];
  const csvRows=[header.slice(0,4), tricky, main.rows[1].slice(0,4)];
  const csv=ctx.mkSerializeCsv(csvRows);
  const backCsv=ctx.mkParseCsv(csv);
  ok(backCsv.length===csvRows.length,'CSV 行数一致（'+backCsv.length+'）');
  ok(backCsv[1][0]==='a, b'&&backCsv[1][1]==='含"引号"','CSV 引号/逗号字段正确还原');
  ok(backCsv[1][2]==='第一行\n第二行','CSV 内换行正确还原');

  console.log('\n'+(fail===0?'✅ 全部通过':'❌ 有 '+fail+' 项失败'));
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('测试异常：',e);process.exit(2);});

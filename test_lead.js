/* 提前提醒(lead) 逻辑单测 —— 临时文件，不进最终产物
 * 用法: node test_lead.js
 */
const fs=require('fs');const vm=require('vm');
const dir='C:/Users/admin/WorkBuddy/个人工作台2';
let src=fs.readFileSync(dir+'/src/03_core.js','utf8').trim()
  .replace(/^<script>/,'').replace(/<\/script>\s*$/,'');
// 把 const 导出的对象挂到 globalThis 方便断言
src+='\nglobalThis.__X={LEAD_DEF,LEAD_OPTS,leadLabel,leadMs,remindMoment,remindTag,remindShort};';
const ctx={Date,Math,console,JSON,globalThis:{}};ctx.globalThis=ctx;
vm.createContext(ctx);vm.runInContext(src,ctx);
const X=ctx.__X;

let n=0,f=0;
const eq=(name,got,exp)=>{n++;const ok=got===exp;
  if(!ok){f++;console.log('FAIL',name,'got=',JSON.stringify(got),'exp=',JSON.stringify(exp));}
  else console.log('PASS',name);};
const ok=(name,c)=>{n++;if(!c){f++;console.log('FAIL',name);}else console.log('PASS',name);};

const ts=(y,mo,d,h,mi)=>new Date(y,mo-1,d,h,mi,0).getTime();

/* leadLabel */
eq('leadLabel(15m)','提前15分钟',X.leadLabel('15m'));
eq('leadLabel(30m)','提前半小时',X.leadLabel('30m'));
eq('leadLabel(1h)','提前1小时',X.leadLabel('1h'));
eq('leadLabel(2h)','提前2小时',X.leadLabel('2h'));
eq('leadLabel(1d)','提前1天',X.leadLabel('1d'));
eq('leadLabel(1w)','提前1周',X.leadLabel('1w'));
eq('leadLabel(空)','',X.leadLabel(''));
eq('leadLabel(脏值)','',X.leadLabel('xxx'));

/* LEAD_DEF / LEAD_OPTS 规模 */
eq('LEAD_DEF 6 种',6,Object.keys(X.LEAD_DEF).length);
ok('LEAD_OPTS 7 项含不提醒',X.LEAD_OPTS.length===7 && X.LEAD_OPTS[0][0]==='' && X.LEAD_OPTS[1][1]==='提前15分钟');
eq('默认首项=提前15分钟',X.LEAD_OPTS[1][0],'15m');

/* leadMs */
eq('leadMs(15m)',900000,X.leadMs('15m'));
eq('leadMs(1d)',86400000,X.leadMs('1d'));
eq('leadMs(1w)',604800000,X.leadMs('1w'));

/* remindMoment：任务截止时刻 - 提前量 */
eq('14:00 提前1小时=13:00',ts(2026,8,10,13,0),X.remindMoment({due:'2026-08-10',remind:'14:00',lead:'1h'}).getTime());
eq('14:00 提前1天=前一天14:00',ts(2026,8,9,14,0),X.remindMoment({due:'2026-08-10',remind:'14:00',lead:'1d'}).getTime());
eq('无时间 提前15分钟=当天23:44',ts(2026,8,10,23,44),X.remindMoment({due:'2026-08-10',lead:'15m'}).getTime());
eq('09:00 提前15分钟=08:45',ts(2026,8,10,8,45),X.remindMoment({due:'2026-08-10',remind:'09:00',lead:'15m'}).getTime());
eq('无截止日=null',null,X.remindMoment({lead:'15m'}));

/* remindTag 展示组合 */
eq('无提醒无提前=空串','',X.remindTag({}));
ok('仅时间→含clock和时间',/i-clock/.test(X.remindTag({remind:'14:00'}))&&/14:00/.test(X.remindTag({remind:'14:00'})));
ok('仅提前→含提前1天',/提前1天/.test(X.remindTag({lead:'1d'})));
ok('时间+提前→两者都在',/14:00/.test(X.remindTag({remind:'14:00',lead:'1h'}))&&/提前1小时/.test(X.remindTag({remind:'14:00',lead:'1h'})));

/* remindShort 行内前缀 */
eq('remindShort 仅提前','提前1周',X.remindShort({lead:'1w'}));
eq('remindShort 仅时间','14:00',X.remindShort({remind:'14:00'}));
eq('remindShort 优先提前','提前2小时',X.remindShort({remind:'14:00',lead:'2h'}));
eq('remindShort 空','',X.remindShort({}));

console.log(`\n==== ${n-f}/${n} 通过, ${f} 失败 ====`);
process.exit(f?1:0);

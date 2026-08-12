/* 周期任务逻辑单测（含每两周） —— 临时文件，不进最终产物 */
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('C:/Users/admin/WorkBuddy/个人工作台2/src/03_core.js','utf8').replace(/<\/?script>/g,'');
const ctx={console,document:{querySelector:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const {occursOn,repStep,repDateAt,repRemain,repLimitText}=ctx;
const repAdd=vm.runInContext('repAdd',ctx), REP_DEF=vm.runInContext('REP_DEF',ctx), REPEAT=vm.runInContext('REPEAT',ctx);

let pass=0,fail=0;
const eq=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);
  console.log((ok?'PASS ':'FAIL ')+n+(ok?'':`  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`));ok?pass++:fail++;};

/* ---- 定义表 ---- */
eq('REPEAT 含每两周', REPEAT.biweekly, '每两周');
eq('选项顺序', Object.keys(REPEAT), ['none','daily','weekly','biweekly','monthly']);

/* ---- repAdd ---- */
eq('biweekly +1', repAdd('biweekly','2026-08-10',1), '2026-08-24');
eq('biweekly +3', repAdd('biweekly','2026-08-10',3), '2026-09-21');
eq('biweekly 跨月', repAdd('biweekly','2026-08-25',1), '2026-09-08');
eq('weekly +1',   repAdd('weekly','2026-08-10',1), '2026-08-17');
eq('monthly 月末', repAdd('monthly','2026-01-31',1), '2026-02-28');

/* ---- repStep 对齐 ---- */
eq('biweekly 14天=1步', repStep('biweekly','2026-08-10','2026-08-24'), 1);
eq('biweekly 28天=2步', repStep('biweekly','2026-08-10','2026-09-07'), 2);
eq('biweekly 7天不对齐', repStep('biweekly','2026-08-10','2026-08-17'), -1);
eq('biweekly 同日=0',   repStep('biweekly','2026-08-10','2026-08-10'), 0);
eq('biweekly 早于起始', repStep('biweekly','2026-08-10','2026-08-01'), -1);
eq('weekly 仍正确',     repStep('weekly','2026-08-10','2026-08-31'), 3);
eq('monthly 仍正确',    repStep('monthly','2026-08-10','2026-11-10'), 3);
eq('未知类型',          repStep('yearly','2026-08-10','2027-08-10'), -1);

/* ---- occursOn 每两周（无限制） ---- */
const b={due:'2026-08-10',repeat:'biweekly'};
eq('bw 首次',    occursOn(b,'2026-08-10'), true);
eq('bw 第7天不出现', occursOn(b,'2026-08-17'), false);
eq('bw 第14天出现',  occursOn(b,'2026-08-24'), true);
eq('bw 第21天不出现',occursOn(b,'2026-08-31'), false);
eq('bw 半年后对齐',  occursOn(b,'2027-02-08'), true);

/* ---- 每两周 + 次数限制（共4次，当前第1次） ---- */
const bc={due:'2026-08-10',repeat:'biweekly',repEnd:'count',repTotal:4,repIdx:1};
eq('bw+count 第1次', occursOn(bc,'2026-08-10'), true);
eq('bw+count 第4次', occursOn(bc,'2026-09-21'), true);
eq('bw+count 第5次越界', occursOn(bc,'2026-10-05'), false);
eq('bw+count 剩余',  repRemain(bc), 4);
eq('bw+count 文案',  repLimitText(bc), '第 1/4 次');
eq('bw+count 末次',  repDateAt(bc,4), '2026-09-21');

/* ---- 每两周 + 截止日限制 ---- */
const bu={due:'2026-08-10',repeat:'biweekly',repEnd:'until',repUntil:'2026-09-30',repIdx:1};
eq('bw+until 范围内', occursOn(bu,'2026-09-21'), true);
eq('bw+until 超出',   occursOn(bu,'2026-10-05'), false);
eq('bw+until 文案',   repLimitText(bu), '至 9月30日');

/* ---- 完成后推进（模拟 toggleTask 决策） ---- */
function nextOf(t){
  const raw=repAdd(t.repeat,t.due,1), idx=(t.repIdx||1)+1;
  if(t.repEnd==='count'&&idx>(t.repTotal||1))return 'STOP';
  if(t.repEnd==='until'&&t.repUntil&&raw>t.repUntil)return 'STOP';
  return raw+'#'+idx;
}
eq('bw 完成第1次→第2次', nextOf(bc), '2026-08-24#2');
eq('bw 完成第4次→收官',  nextOf({...bc,repIdx:4,due:'2026-09-21'}), 'STOP');
eq('bw until 未到→继续', nextOf({...bu,due:'2026-09-07',repIdx:3}), '2026-09-21#4');
eq('bw until 已到→收官', nextOf({...bu,due:'2026-09-21',repIdx:4}), 'STOP');

/* ---- 旧数据回归（确保没改坏） ---- */
eq('旧 daily 无限制', occursOn({due:'2026-08-10',repeat:'daily'},'2027-08-10'), true);
eq('旧 weekly 对齐',  occursOn({due:'2026-08-10',repeat:'weekly'},'2026-08-17'), true);
eq('旧 monthly 对齐', occursOn({due:'2026-08-10',repeat:'monthly'},'2026-12-10'), true);
eq('none 不扩散',     occursOn({due:'2026-08-10',repeat:'none'},'2026-08-11'), false);

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);

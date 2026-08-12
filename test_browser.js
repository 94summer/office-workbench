/* 注入交互测试到产物 HTML —— 临时文件，不进最终产物 */
const fs=require('fs');
const dir='C:/Users/admin/WorkBuddy/个人工作台2';
const html=fs.readFileSync(dir+'/办公工作台.html','utf8');

const inject=`<script>
window.addEventListener('load',function(){setTimeout(function(){
  var R=[];
  function t(n,c){R.push((c?'PASS ':'FAIL ')+n);}
  try{
    /* 1. 下拉里有「每两周」 */
    openTask(null);
    var rep=document.getElementById('fTRepeat');
    var opts=[].map.call(rep.options,function(o){return o.value+':'+o.text;});
    t('下拉含每两周 ['+opts.join(' ')+']', opts.indexOf('biweekly:每两周')>=0);
    t('选项共5个', rep.options.length===5);

    /* 2. 选每两周 → 单位文案是「两周」 */
    rep.value='biweekly'; rep.dispatchEvent(new Event('change'));
    var e=document.getElementById('fTRepEnd');
    e.value='never'; e.dispatchEvent(new Event('change'));
    var hint=document.getElementById('fRepHint').textContent;
    t('never文案含每两周一次: '+hint.slice(0,40), hint.indexOf('每两周一次')>=0);

    /* 3. count 模式末次日期 = 首次 + 14*(n-1) 天 */
    e.value='count'; e.dispatchEvent(new Event('change'));
    var tot=document.getElementById('fTRepTotal');
    tot.value='4'; tot.dispatchEvent(new Event('input'));
    var due=document.getElementById('fTDue').value;
    var expect=repAdd('biweekly',due,3);
    var em=parseD(expect).getMonth()+1+'月'+parseD(expect).getDate()+'日';
    var h2=document.getElementById('fRepHint').textContent;
    t('末次日期=首次+42天 ('+em+') : '+h2.slice(0,60), h2.indexOf(em)>=0);

    /* 4. until 模式次数预测（30天内每两周 → 3次：D, D+14, D+28） */
    e.value='until'; e.dispatchEvent(new Event('change'));
    var u=document.getElementById('fTRepUntil');
    u.value=addDays(due,30); u.dispatchEvent(new Event('input'));
    var h3=document.getElementById('fRepHint').textContent;
    t('30天内出现3次: '+h3.slice(0,70), /还会出现\\s*3\\s*次/.test(h3.replace(/\\s+/g,' ')));

    /* 5. 保存一条每两周任务 */
    document.getElementById('fTTitle').value='双周测试任务';
    e.value='count'; e.dispatchEvent(new Event('change'));
    tot.value='3'; tot.dispatchEvent(new Event('input'));
    document.getElementById('tSave').click();
    var nt=DB.tasks[DB.tasks.length-1];
    t('保存字段正确', nt.repeat==='biweekly'&&nt.repEnd==='count'&&nt.repTotal===3&&nt.repIdx===1);

    /* 6. 日历展开：只在 0/14/28 天出现，7/21 天不出现 */
    var d0=nt.due;
    function has(dt){return tasksOn(dt).some(function(x){return x.t.id===nt.id;});}
    t('日历 D+0 出现',  has(d0));
    t('日历 D+7 不出现', !has(addDays(d0,7)));
    t('日历 D+14 出现', has(addDays(d0,14)));
    t('日历 D+21 不出现',!has(addDays(d0,21)));
    t('日历 D+28 出现(第3次)', has(addDays(d0,28)));
    t('日历 D+42 不出现(超次数)', !has(addDays(d0,42)));

    /* 7. 标签显示「每两周 · 第 1/3 次」 */
    go('todo');
    var body=document.body.innerHTML;
    t('列表标签含 每两周', body.indexOf('每两周')>=0);

    /* 8. 连续完成 → 3 次后收官 */
    var seen=[];
    for(var i=0;i<5;i++){
      var cur=DB.tasks.filter(function(x){return x.title==='双周测试任务'&&!x.done;})[0];
      if(!cur)break;
      seen.push(cur.repIdx+'@'+cur.due);
      toggleTask(cur.id);
    }
    t('共3次后停止 ['+seen.join(' ')+']', seen.length===3);
    var gap=seen.length===3?(parseD(seen[1].split('@')[1])-parseD(seen[0].split('@')[1]))/864e5:-1;
    t('相邻两次间隔14天(实际'+gap+')', gap===14);

    /* 9. 导出行含「每两周」 */
    var rows=taskRows();
    var hit=rows.filter(function(r){return r[4]==='每两周';}).length;
    t('导出重复列含每两周('+hit+'条)', hit>0);

    /* 10. 示例数据里的双周任务 */
    t('示例含双周迭代评审会', DB.tasks.some(function(x){return x.title==='双周迭代评审会'&&x.repeat==='biweekly';}));
  }catch(err){R.push('FAIL 异常: '+err.message+' @'+(err.stack||'').split('\\n')[1]);}
  var box=document.createElement('div'); box.id='__RESULT__';
  box.textContent='<<<'+R.join(' ||| ')+'>>>';
  document.body.appendChild(box);
},400);});
<\/script>`;

fs.writeFileSync(dir+'/__test.html',html.replace('</body>',inject+'\n</body>'),'utf8');
console.log('测试页已生成');

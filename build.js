const fs=require('fs');
const dir='C:/Users/admin/WorkBuddy/个人工作台2';
const read=f=>fs.readFileSync(dir+'/src/'+f,'utf8');
// 去掉 JS 文件首尾的 <script> / </script> 标签
function stripJs(s){s=s.trim();if(s.startsWith('<script>'))s=s.slice(8);if(s.endsWith('</script>'))s=s.slice(0,-9);return s.trim();}
const head=read('01_head.html');
const body=read('02_body.html');
const js=[ '03_core.js','04_render_a.js','05_render_b.js','06_app.js','10_tracker.js','09_market.js','07_file.js','08_sync.js' ].map(f=>stripJs(read(f))).join('\n\n');
const html=head+'\n'+body+'\n<script>\n'+js+'\n</script>\n</body>\n</html>\n';
fs.writeFileSync(dir+'/办公工作台.html',html,'utf8');
fs.writeFileSync(dir+'/__check.js',js,'utf8');
console.log('OK  total bytes='+Buffer.byteLength(html));

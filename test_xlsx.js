const fs=require('fs');
const src=fs.readFileSync('C:/Users/admin/WorkBuddy/个人工作台2/src/06_app.js','utf8');

// 抽取真实函数源码
function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0)throw 'missing '+name;
  // 简单括号匹配
  let depth=0,j=src.indexOf('{',i),k=j;
  for(;k<src.length;k++){if(src[k]==='{')depth++;else if(src[k]==='}'){depth--;if(depth===0){k++;break;}}}
  return src.slice(i,k);
}
const code=[grab('crc32'),grab('concatU'),grab('colLetter'),grab('xmlEsc'),grab('sheetXml'),grab('zipStore')].join('\n');

// CRC_TB 声明抽出来
const crcDecl=src.match(/let CRC_TB=null;/)[0];

const vm=require('vm');
const ctx={TextEncoder,TextDecoder,Uint8Array,DataView,console,Math,String,Number,JSON,Array,Object};
vm.createContext(ctx);
vm.runInContext(crcDecl+'\nconst td=new TextDecoder();\n'+code+'\n'+`
function makeXlsx(){
  const enc=new TextEncoder();
  const rowsA=[['标题','轻重缓急','截止日期'],['续约方案','紧急重要','2026-08-10'],['写周报','重要','2026-08-12']];
  const ct='<?xml version="1.0"?><Types/>';
  const rels='<?xml version="1.0"?><Relationships/>';
  const wb='<?xml version="1.0"?><workbook><sheets><sheet name="待办" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbRels='<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>';
  const files=[
    {name:'[Content_Types].xml',data:enc.encode(ct)},
    {name:'_rels/.rels',data:enc.encode(rels)},
    {name:'xl/workbook.xml',data:enc.encode(wb)},
    {name:'xl/_rels/workbook.xml.rels',data:enc.encode(wbRels)},
    {name:'xl/worksheets/sheet1.xml',data:enc.encode(sheetXml(rowsA))}
  ];
  return zipStore(files);
}
globalThis.__out=makeXlsx();
globalThis.crc32=crc32;
globalThis.__verify=function(zip){
  const buf=zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength);
  const dv=new DataView(buf);
  let eo=-1;for(let i=buf.byteLength-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw 'EOCD not found';
  const cnt=dv.getUint16(eo+10,true),cdOff=dv.getUint32(eo+16,true);
  let p=cdOff,ok=0,names=[];
  for(let n=0;n<cnt;n++){
    if(dv.getUint32(p,true)!==0x02014b50)throw 'bad central';
    const cSize=dv.getUint32(p+20,true),fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true);
    const fname=td.decode(buf.slice(p+46,p+46+fnLen));names.push(fname);
    const crcStored=dv.getUint32(p+16,true);
    const lo=dv.getUint32(p+42,true),lh=new DataView(buf,lo);
    const lfn=lh.getUint16(26,true),lext=lh.getUint16(28,true),ds=lo+30+lfn+lext;
    const data=buf.slice(ds,ds+cSize);
    if(crc32(new Uint8Array(data))!==crcStored)throw 'CRC mismatch in '+fname;
    ok++;p+=46+fnLen+exLen+cmLen;
  }
  return {cnt,ok,names};
};
`,ctx);

const zip=ctx.__out;
fs.writeFileSync('C:/Users/admin/WorkBuddy/个人工作台2/__sample.xlsx',Buffer.from(zip));
console.log('zip bytes:',zip.length);
const rep=ctx.__verify(zip);
console.log('entries:',rep.cnt,'| all CRC ok:',rep.ok===rep.cnt);
console.log('names:',rep.names.join(' | '));
console.log('has sheet1:',rep.names.indexOf('xl/worksheets/sheet1.xml')>=0);

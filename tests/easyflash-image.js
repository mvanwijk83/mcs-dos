// Independent host-side decoding of the cartridge filesystem, for checking
// actual persisted bytes rather than trusting shell output alone.
const fs=require('fs'),assert=require('assert/strict');
function readImage(file){
 const crt=fs.readFileSync(file),sides=[Buffer.alloc(65536,255),Buffer.alloc(65536,255)];
 assert.equal(crt.subarray(0,16).toString(),'C64 CARTRIDGE   ');
 assert.equal(crt.readUInt16BE(22),32);
 for(let p=crt.readUInt32BE(16);p<crt.length;){
  assert.equal(crt.subarray(p,p+4).toString(),'CHIP');
  const size=crt.readUInt32BE(p+4),bank=crt.readUInt16BE(p+10),address=crt.readUInt16BE(p+12);
  assert.equal(size,8208);assert.equal(crt.readUInt16BE(p+14),8192);
  if(bank>=56&&bank<=63){assert([0x8000,0xa000].includes(address));crt.copy(sides[address===0xa000?1:0],(bank-56)*8192,p+16,p+size);}
  p+=size;assert(p<=crt.length);
 }
 const valid=[];
 for(const b of sides){
  if(b.subarray(0,4).toString('hex')!=='4d465302'||b[15]!==0xa5)continue;
  const end=b.readUInt16LE(6),count=b[8];assert(end>=1024&&end<=65024);assert(count<=40);
  let a=0,c=0;for(let i=32;i<end;i++){a=(a+b[i])&255;c=(c+a)&255;}
  assert.equal(b.readUInt16LE(10),a|(c<<8),'committed snapshot checksum');
  const files=new Map();
  for(let i=0;i<count;i++){
   const at=32+i*24,name=b.subarray(at,at+17).toString('latin1').split('\0')[0];
   const start=b.readUInt16LE(at+18),len=b.readUInt16LE(at+20);
   assert(name.length>0&&name.length<=16);assert(!files.has(name));assert(start>=1024&&start+len<=end);
   files.set(name,{data:b.subarray(start,start+len),type:b[at+17],readonly:b[at+22]});
  }
  valid.push({generation:b.readUInt16LE(4),files,end});
 }
 assert(valid.length,'at least one committed snapshot');
 if(valid.length===2&&((valid[1].generation-valid[0].generation+65536)&65535)<32768)return valid[1];
 return valid[0];
}
function verifyDistribution(file){
 const {files}=readImage(file);
 const names=['COMMANDS.HLP','CGA.CPI','AUTOEXEC.SAMPLE','MANUAL.TXT','CHANGELOG.TXT','LICENSE.TXT'];
 assert.equal(files.size,names.length);
 for(const name of names){assert.deepEqual(files.get(name).data,fs.readFileSync('build/'+name),name);assert.equal(files.get(name).readonly,0);}
 console.log('PASS cartridge resource bytes and filesystem structure');
}
module.exports={readImage,verifyDistribution};
if(require.main===module)verifyDistribution(process.argv[2]||'build/easyflash/MCS-DOS.crt');

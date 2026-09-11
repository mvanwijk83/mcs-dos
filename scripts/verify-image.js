// Structural checks on the delivered D64 and its compiled program.
const fs=require('fs'), assert=require('assert/strict');
const release=process.argv.includes('--release');
const image=fs.readFileSync('build/MCS-DOS.d64');
assert.equal(image.length,174848);
function offset(t,s) {
  assert(t>=1&&t<=35);
  const sectors=t<=17?21:t<=24?19:t<=30?18:17;
  assert(s>=0&&s<sectors);
  let b=0;
  for(let i=1;i<t;i++) b+=i<=17?21:i<=24?19:i<=30?18:17;
  return (b+s)*256;
}
function chain(t,s) {
  const result=[],seen=new Set();
  while(t) {
    const o=offset(t,s); assert(!seen.has(o),'cyclic chain'); seen.add(o);
    const nt=image[o],ns=image[o+1];
    assert(nt || ns>=1,'invalid final byte count');
    result.push(image.subarray(o+2,o+(nt?256:ns+1)));
    t=nt;s=ns;
  }
  return {data:Buffer.concat(result),blocks:seen.size};
}
const entries=new Map();
let t=18,s=1;
while(t) {
  const o=offset(t,s);
  for(let i=0;i<8;i++) {
    const e=o+i*32;
    if(!image[e+2]) continue;
    const name=image.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'');
    const file=chain(image[e+3],image[e+4]);
    assert.equal(file.blocks,image.readUInt16LE(e+30));
    entries.set(name,{...file,type:image[e+2]});
  }
  t=image[o];s=image[o+1];
}
const names=['MCS-DOS','HELLO.BAT','MANUAL.TXT','LICENSE.TXT','CGA.CPI','AMIGA.CPI','ATARIST.CPI','PET.CPI','ZXSPECTRUM.CPI','COMMANDS.HLP'];
if(!release) names.push('AUTOEXEC.BAT');
assert.deepEqual([...entries.keys()],names,release?'Release must exclude personal AUTOEXEC.BAT':'Development image contents');
if(!release) {
  const source=fs.readFileSync('dev/AUTOEXEC.BAT.txt','utf8').replace(/\r?\n/g,'\r');
  const expected=Buffer.from([...source].map(c=>{const n=c.charCodeAt(0);return n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n;}));
  assert.equal(entries.get('AUTOEXEC.BAT').type,0x81);
  assert.deepEqual(entries.get('AUTOEXEC.BAT').data,expected,'Exact personal startup commands');
}
for(const name of ['MANUAL.TXT','LICENSE.TXT','CGA.CPI','AMIGA.CPI','ATARIST.CPI','PET.CPI','ZXSPECTRUM.CPI','COMMANDS.HLP']) {
  assert.equal(entries.get(name).type,0x81);
  assert.deepEqual(entries.get(name).data,fs.readFileSync('build/'+name));
}
assert.equal(entries.get('MCS-DOS').type,0x82);
assert.equal(entries.get('HELLO.BAT').type,0x81);
assert.deepEqual(entries.get('MCS-DOS').data,fs.readFileSync('build/MCS-DOS.prg'));
assert.deepEqual(entries.get('HELLO.BAT').data,fs.readFileSync('build/HELLO.BAT'));
assert.equal(entries.get('MCS-DOS').data.readUInt16LE(0),0x0801);
console.log('PASS: '+(release?'release (no AUTOEXEC)':'development (personal AUTOEXEC)')+' D64 size, directory types, sector chains, file sizes, PRG and SEQ contents');

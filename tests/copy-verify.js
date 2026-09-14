const fs=require('fs'),assert=require('assert/strict');const image=fs.readFileSync('build/test-copy-target.d64');
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
for(const name of ['CGA','AMIGA','ATARIST','PET','ZXSPECTRUM']) {assert.equal(entries.get(name+'.CPI').type,0x81);assert.deepEqual(entries.get(name+'.CPI').data,fs.readFileSync('build/'+name+'.CPI'));}console.log('PASS five copied CPI files: SEQ types and exact bytes');

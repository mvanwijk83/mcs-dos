const fs=require('fs'),assert=require('assert/strict');
function disk(path) {
  const image=fs.readFileSync(path),entries=new Map();
  function offset(t,s) {
    assert(t>=1&&t<=35);
    const sectors=t<=17?21:t<=24?19:t<=30?18:17;
    assert(s>=0&&s<sectors);
    let b=0; for(let i=1;i<t;i++) b+=i<=17?21:i<=24?19:i<=30?18:17;
    return (b+s)*256;
  }
  function chain(t,s) {
    const parts=[],seen=new Set(),links=[];
    while(t) {
      const o=offset(t,s); assert(!seen.has(o)); seen.add(o); links.push([t,s]);
      const nt=image[o],ns=image[o+1]; assert(nt||ns>=1);
      parts.push(image.subarray(o+2,o+(nt?256:ns+1))); t=nt;s=ns;
    }
    return {data:Buffer.concat(parts),links};
  }
  let t=18,s=1;
  while(t) {
    const o=offset(t,s);
    for(let i=0;i<8;i++) {
      const e=o+i*32; if(!image[e+2]) continue;
      const name=image.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'');
      const file=chain(image[e+3],image[e+4]);
      file.type=image[e+2];file.length=image[e+23];
      if(file.type===0x84) {
        const side=chain(image[e+21],image[e+22]);
        assert.equal(file.links.length+side.links.length,image.readUInt16LE(e+30));
        const indexed=[];
        for(const [j,[st,ss]] of side.links.entries()) {
          const so=offset(st,ss); assert.equal(image[so+2],j);assert.equal(image[so+3],file.length);
          for(let k=0;k<side.links.length;k++) assert.deepEqual([...image.subarray(so+4+k*2,so+6+k*2)],side.links[k]);
          for(let k=16;k<256&&image[so+k];k+=2) indexed.push([image[so+k],image[so+k+1]]);
        }
        assert.deepEqual(indexed,file.links,'side sectors index the data chain');
      }
      entries.set(name,file);
    }
    t=image[o];s=image[o+1];
  }
  return entries;
}
if(require.main===module) {
  const source=disk('build/test-tweaks.d64'),target=disk('build/test-rel-target.d64');
  const original=source.get('RECORDS');
  assert.equal(original.length,100);assert.equal(original.data.length,700);
  const expected=Buffer.from(Array.from({length:700},(_,i)=>((Math.floor(i/100)+1)*37+i%100+1)&255));
  assert.deepEqual(original.data,expected,'fixture includes binary zero, CR and high-bit bytes');
  for(const copy of [source.get('SAME'),target.get('ACROSS')]) {
    assert.equal(copy.type,0x84);assert.equal(copy.length,original.length);
    assert.deepEqual(copy.data,original.data);
  }
  console.log('PASS binary REL data, record lengths, allocation and side-sector indexes');
}
module.exports={disk};

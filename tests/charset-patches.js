require('./setup');
const fs=require('fs'),assert=require('assert/strict');
const underscore=[0,0,0,0,0,0,0x7e,0];
for(const file of ['disk-content/CGA.CPI','disk-content/PET.CPI','disk-content/VGA.CPI',
                   'extras/PET.CPI','extras/AMIGA.CPI','extras/ATARIST.CPI','extras/ZXSPECTRUM.CPI']){
    const b=fs.readFileSync(file);
    assert.deepEqual([...b.subarray(0,5)],[77,67,80,73,1],file);
    assert.equal(b.length,8+b[5]*9,file);
    const records=new Map();let sum=0,previous=-1;
    for(let i=0;i<b[5];i++){
        const at=6+i*9,code=b[at];assert(code>previous,file);previous=code;
        records.set(code,[...b.subarray(at+1,at+9)]);
        sum=b.subarray(at,at+9).reduce((a,c)=>a+c,sum);
    }
    assert.equal(b.readUInt16LE(b.length-2),sum&65535,file);
    assert.deepEqual(records.get(31),underscore,file);
}
console.log('PASS every shipped CPI underscore bitmap, ordered records, size and checksum');

// Check the assembled artifact, independently of the builder's linker checks.
const fs=require('fs'),assert=require('assert/strict');
const base='build/easyflash/',layout=JSON.parse(fs.readFileSync(base+'layout.json'));
function packets(file){
 const b=fs.readFileSync(file),result=new Map();
 for(let p=b.readUInt32BE(16);p<b.length;p+=b.readUInt32BE(p+4)){
  assert.equal(b.toString('ascii',p,p+4),'CHIP');
  result.set(b.readUInt16BE(p+10)+':'+b.readUInt16BE(p+12),b.subarray(p+16,p+16+b.readUInt16BE(p+14)));
 }
 return result;
}
const image=packets(base+'MCS-DOS.crt'),linked=packets(base+'shell-crt.crt');
assert(fs.readFileSync(base+'shell-prg.asm').equals(fs.readFileSync(base+'shell-crt.asm')));
assert.deepEqual(layout.commandBanks.map(b=>b.name),['edit','fileutil','filemgmt','disk','boot']);
for(const b of layout.commandBanks){
 assert(b.used>0&&b.used<=8192);assert.equal(b.used+b.free,8192);
 const key=b.bank+':40960';assert(image.has(key)&&linked.has(key),key);
 assert.deepEqual(image.get(key).subarray(0,b.used),linked.get(key).subarray(0,b.used),b.name);
}
const prg=fs.readFileSync(base+'shell.prg');
assert.equal(prg.length,layout.payload+2);
assert.equal(layout.executableBytes,prg.length+layout.commandBanks.reduce((n,b)=>n+b.used,0));
assert.deepEqual(image.get('10:32768').subarray(0,layout.helpBytes),fs.readFileSync(base+'help.bin'));
assert.equal(layout.filesystemVersion,3);
assert.equal(layout.residentBytes,layout.bssEnd-0x801);
assert.equal(layout.freeRam,layout.freeRanges.reduce((n,[a,b])=>n+b-a,0));
assert(layout.freeRam>10000,'banked prototype must recover meaningful RAM');
assert(layout.bssEnd<=0xa000);assert.deepEqual(layout.romWindow,{start:0xa000,end:0xc000});
assert(layout.wedge>0&&layout.wedge<=0x1e0,'wedge must not overlap resume token');
assert.deepEqual(layout.sessionBanks,[48,55]);assert.equal(layout.sessionBytes,3349);
assert.deepEqual(layout.freeRanges[1],[0xc300,0xc700]);
for(let bank=48;bank<=55;bank++)for(const address of [0x8000,0xa000]) {
 const sector=image.get(bank+':'+address);assert(sector&&sector.every(b=>b===255),'empty session journal');
}
console.log('PASS linked command banks, resident payload, internal help and RAM accounting');

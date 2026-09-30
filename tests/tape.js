/* Exercise actual KERNAL pulse decoding, not a mocked LOAD entry point. */
const fs=require('fs'),assert=require('assert/strict');
function tape(files){
 const pulses=[];
 const short=48,medium=66,long=86;
 function byte(v){pulses.push(long,medium);let parity=1;for(let i=0;i<8;i++){const b=(v>>i)&1;parity^=b;pulses.push(...(b?[medium,short]:[short,medium]));}pulses.push(...(parity?[medium,short]:[short,medium]));}
 function block(data,leader,bad=false){
  for(let pass=0;pass<2;pass++){
   for(let i=0;i<(pass?80:leader);i++)pulses.push(short);
   for(let i=9;i;i--)byte(i+(pass?0:128));
   let sum=0;for(const v of data){byte(v);sum^=v;}byte(sum^(bad?1:0));pulses.push(long,short);
  }
  for(let i=0;i<80;i++)pulses.push(short);
 }
 for(const f of files){
  const h=Buffer.alloc(192,32);h[0]=f.type||1;h.writeUInt16LE(f.address||0x801,1);h.writeUInt16LE(((f.address||0x801)+f.data.length)&65535,3);h.fill(32,5,21);h.write(f.name,5,'latin1');
  block(h,0x6a00);
  if(f.type===4){
   const b=Buffer.concat([f.data,Buffer.from([0])]);
   for(let at=0;at<b.length;at+=191){const d=Buffer.alloc(192);d[0]=2;b.copy(d,1,at,Math.min(at+191,b.length));block(d,0x1a00,f.bad&&at>=191);}
  } else block(f.data,0x1a00,f.bad);
 }
 const h=Buffer.alloc(20);h.write('C64-TAPE-RAW');h[12]=1;h.writeUInt32LE(pulses.length,16);
 return Buffer.concat([h,Buffer.from(pulses)]);
}
module.exports=async({command,memory,screen,keys,enter,root,disk,crt,diskFile})=>{
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(text,limit=45){
  let s;
  for(let i=0;i<limit;i++){s=await screen();if(s.includes(text))return s;await command('x');await delay(500);}
  throw Error('Waiting for '+text+'\n'+s+'\n'+await command('r'));
 }
 async function attach(files){
  const file=root+'/build/easyflash/transfer.tap';fs.writeFileSync(file,tape(files));
  await command('detach 1');
  const result=await command(`attach "${file}" 1`);assert(!result.includes('ERROR'),result);
  await command('tapectrl 1');
 }
 await command('resourceset "VirtualDevice1" "0"');
 await command(`attach "${disk}" 8`);
 let s=await enter('tapecopy 8: bad extra');assert(s.includes('Syntax: TAPECOPY'),s);
 for(const cmd of ['tapecopy 8:game','tapecopy game invalid','tapecopy 8: game']) {
  s=await enter(cmd);assert(s.includes('Syntax: TAPECOPY'),s);
 }
 s=await enter('tapecopy /?');assert(s.includes('Loads and transfers'),s);
 await enter('set tapetest=retained');
 const data=Buffer.from(Array.from({length:1024},(_,i)=>(i*37)&255));
 if(process.argv.includes('--tape-t64')) {
  const source=process.argv[process.argv.indexOf('--tape-t64')+1];
  const b=fs.readFileSync(source),at=b.readUInt32LE(72),address=b.readUInt16LE(66),end=b.readUInt16LE(68);
  assert.equal(b[64],1);assert(end>address&&at+end-address<=b.length);
  const payload=b.subarray(at,at+end-address),name=b.subarray(80,96).toString('latin1').trimEnd();
  await command('resourceset "VirtualDevice1" "1"');
  await command(`attach "${source.replaceAll('\\','/')}" 1`);
  await command('tapectrl 1');await keys('tapecopy 8:\\x0d',1000);
  assert.equal((await memory(0xd011))[0]&16,0,'T64 leaves the pulse reader waiting with display blanked');
  s=await screen();assert(!s.includes('Found '),s);
  // STOP is polled through the keyboard matrix, not the GETIN input queue.
  await command('> 0091 7f');await command('x');await until('Tape transfer cancelled');
  console.log('PASS reproduced T64 pulse-reader wait and RUN/STOP recovery');
  await command('resourceset "VirtualDevice1" "0"');
  await attach([{name,address,data:payload}]);
  fs.copyFileSync(root+'/build/easyflash/transfer.tap',root+'/build/easyflash/blue-max-standard.tap');
  await keys('tapecopy 8:\\x0d',100);await until('Save to drive');
  await keys('y',100);await until('Filename');await keys('\\x0d',100);
  s=await until('Load next file',180);assert(s.includes('Saved'),s);await keys('n',100);
  assert.deepEqual(diskFile(disk,name),Buffer.concat([Buffer.from([address&255,address>>8]),payload]));
  console.log('PASS actual T64 payload converted to standard TAP and copied byte-for-byte');
  return;
 }
 if(process.argv.includes('--tape-search')) {
  await attach([{name:'SKIP',data:Buffer.alloc(200,90)},
   {name:'SKIPSEQ',type:4,data:Buffer.from('skip this')},
   {name:'MY GAME',data},{name:'NEXT',data:Buffer.alloc(20,42)}]);
  await keys('tapecopy "my ga" 8:\\x0d',150);
  s=await until('Save to drive',120);
  assert(s.includes('Found skip')&&s.includes('Found skipseq')&&s.includes('Found my game'),s);
  assert.equal((s.match(/Save to drive/g)||[]).length,1,s);
  await keys('y',100);await until('Filename');await keys('renamed\\x0d',100);
  s=await until('Load next file');assert(s.includes('Saved'),s);
  assert.deepEqual(diskFile(disk,'RENAMED'),Buffer.concat([Buffer.from([1,8]),data]));
  assert.throws(()=>diskFile(disk,'SKIP'),/Missing disk file/);
  await keys('y',100);await until('Found next');await until('Save to drive');
  await keys('y',100);await until('Filename');await keys('\\x0d',100);
  await until('Load next file');await keys('n',100);
  assert.deepEqual(diskFile(disk,'NEXT'),Buffer.concat([Buffer.from([1,8]),Buffer.alloc(20,42)]));
  await attach([{name:'OTHER',data:Buffer.alloc(20)}, {name:'END',type:5,data:Buffer.alloc(0)}]);
  await keys('tapecopy missing\\x0d',100);
  s=await until('End of tape');assert(!s.includes('Save to drive'),s);
  console.log('PASS tape filename search, skipped PRG/SEQ, prefix match, rename, next and absent name');
  return;
 }
 await attach([{name:'TAPEONE',data}]);
 const colors=[(await memory(0x286))[0],(await memory(0xd021))[0]&15,(await memory(0xd020))[0]&15];
 await keys('tapecopy\\x0d',250);
 s=await until('Save to drive');console.log('HEADER',s);
 assert.deepEqual([(await memory(0x286))[0],(await memory(0xd021))[0]&15,(await memory(0xd020))[0]&15],colors,'copier preserves shell colors');
 await keys('y',150);await until('Filename');await keys('\\x0d',150);
 s=await until('Load next file');console.log('SAVED',s);assert(s.includes('Saved'),s);
 await keys('n',300);
 s=await enter('set');assert(s.includes('retained'),s);
 s=await enter('dir');assert(s.toLowerCase().includes('tapeone'),s);
 await enter('copy 0:tapeone 8:tapeone');
 assert.deepEqual(diskFile(disk,'TAPEONE'),Buffer.concat([Buffer.from([1,8]),data]));
 console.log('PASS tape program, cartridge destination, session restoration');
 if(process.argv.includes('--tape-smoke'))return;
 const large=Buffer.from(Array.from({length:process.argv.includes('--tape-short')?1024:40000},(_,i)=>(i*17+11)&255));
 const seq=Buffer.from(Array.from({length:573},(_,i)=>1+(i%254)));
 await attach([{name:'SKIP',data:Buffer.alloc(200,0x5a)},
  {name:'TAPEONE',type:3,address:0x02a0,data:large},{name:'DATASEQ',type:4,data:seq}]);
 await keys('tapecopy A:\\x0d',150);await until('Save to drive A');
 await keys('n',100);await until('Found tapeone');
 await keys('y',100);await until('Filename');await keys('\\x0d',100);
 await until('File already exists');await keys('bigcopy\\x0d',100);
 s=await until('Load next file',240);assert(s.includes('Saved'),s);
 assert.deepEqual(diskFile(disk,'BIGCOPY'),Buffer.concat([Buffer.from([0xa0,2]),large]));
 await keys('y',100);await until('Found dataseq');await keys('y',100);
 await until('Filename');await keys('\\x0d',100);
 s=await until('Load next file');assert(s.includes('Saved'),s);
 await keys('n',200);
 assert.deepEqual(diskFile(disk,'DATASEQ'),seq);
 s=await enter('dir 8:dataseq');assert(/DATASEQ\s+SEQ/.test(s),s);
 console.log('PASS skip, '+large.length+' byte PRG, collision rename, next file, disk SEQ');
 await attach([{name:'CARTSEQ',type:4,data:seq}]);
 await keys('tapecopy 0:\\x0d',100);await until('Save to drive');
 await keys('y',100);await until('Filename');await keys('\\x0d',100);
 s=await until('Load next file');assert(s.includes('Saved'),s);await keys('n',100);
 await enter('copy 0:cartseq 8:cartseq');
 assert.deepEqual(diskFile(disk,'CARTSEQ'),seq);
 s=await enter('dir 0:cartseq');assert(/CARTSEQ\s+SEQ/.test(s),s);
 console.log('PASS cartridge SEQ bytes');
 // A bad second SEQ block must remove already-written output, on both media.
 for(const dest of [0,8]) {
  await attach([{name:'BADSEQ',type:4,data:seq,bad:true}]);
  await keys('tapecopy '+dest+':\\x0d',100);await until('Save to drive');
  await keys('y',100);await until('Filename');await keys('\\x0d',100);
  s=await until('Tape read error');assert(s.includes('0:>'),s);
  s=await enter('dir '+dest+':badseq');assert(!/BADSEQ\s+SEQ/.test(s),s);
  if(dest)assert.throws(()=>diskFile(disk,'BADSEQ'),/Missing disk file/);
 }
 await attach([{name:'BADPRG',data,bad:true}]);
 await keys('tapecopy 8:\\x0d',100);await until('Save to drive');
 await keys('y',100);await until('Filename');await keys('\\x0d',100);
 await until('Tape read error');assert.throws(()=>diskFile(disk,'BADPRG'),/Missing disk file/);
 await attach([{name:'CANCEL',data}]);
 await keys('tapecopy\\x0d',100);await until('Save to drive');
 await keys('y',100);await until('Filename');await keys('\\x03',100);
 await until('Tape transfer cancelled');
 await attach([{name:'TOOBIG',data:Buffer.alloc(45057,0x5a)}]);
 await keys('tapecopy\\x0d',100);await until('Tape program too large');
 await attach([{name:'UNKNOWN',type:6,data}]);
 await keys('tapecopy\\x0d',100);await until('Unsupported tape file');
 await attach([{name:'END',type:5,data}]);
 await keys('tapecopy\\x0d',100);await until('End of tape');
 console.log('PASS checksum failures, partial SEQ cleanup on cartridge/disk, cancellation and size limit');
};
module.exports.tape=tape;

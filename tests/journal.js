const fs=require('fs'),assert=require('assert/strict');
const {readImage,crc}=require('./easyflash-image');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// VICE omits all-erased CHIP packets on writeback. Preserve all other banks.
function replaceSectors(file,sides){
 const crt=fs.readFileSync(file),parts=[crt.subarray(0,64)];
 for(let p=64;p<crt.length;p+=crt.readUInt32BE(p+4)){
  const bank=crt.readUInt16BE(p+10);if(bank<56||bank>63)parts.push(crt.subarray(p,p+crt.readUInt32BE(p+4)));
 }
 for(let bank=56;bank<64;bank++)for(let side=0;side<2;side++){
  const h=Buffer.alloc(16);h.write('CHIP');h.writeUInt32BE(8208,4);h.writeUInt16BE(2,8);
  h.writeUInt16BE(bank,10);h.writeUInt16BE(side?0xa000:0x8000,12);h.writeUInt16BE(8192,14);
  parts.push(h,sides[side].subarray((bank-56)*8192,(bank-55)*8192));
 }
 fs.writeFileSync(file,Buffer.concat(parts));
}
function fillMetadata(state,stop){
 const b=state.sides[state.side],r=state.records.findLast(r=>r.kind!==3&&state.files.has(r.name));
 const h=Buffer.from(b.subarray(r.at,r.at+32));h.writeUInt16LE(32,24);h[29]=2;h[30]=255;
 h.writeUInt16LE(crc(Buffer.concat([h.subarray(0,26),h.subarray(28,31)])),26);
 let at=state.end;while(at+32<=stop){h.copy(b,at);at+=32;}return at;
}
module.exports=async function({command,memory,screen,keys,enter,check,disk,crt,compactOnly}){
 const resource=await command('resourceset "CartridgeReset" "0"');assert(!resource.includes('ERROR'),resource);
 async function boot(){
  await command('reset 0');await command('x');await delay(2000);let s=await screen();
  for(let i=0;i<50&&!s.endsWith('0:>');i++){await command('x');await delay(500);s=await screen();}
  assert(s.endsWith('0:>'),s);return s;
 }
 async function attach(){await command(`attach "${crt}" $20`);return boot();}
 async function inspect(){await command('detach $20');const state=readImage(crt);await attach();return state;}
 async function fixture(state,stop){await command('detach $20');fillMetadata(state,stop);replaceSectors(crt,state.sides);await attach();}
 const initial=readImage(crt),sample=initial.files.get('AUTOEXEC.SAMPLE').data;
 if(compactOnly){
  await check('help chkdsk','Compacts the cartridge file system');
  await check('chkdsk /c','already compact');let before=await inspect();
  assert.deepEqual(before.sides,initial.sides,'no flash changes for packed journal');
  await enter('echo first >test.txt');await enter('echo second >test.txt');
  await enter('ren test.txt renamed.txt');await enter('attrib +l renamed.txt');
  before=await inspect();await check('chkdsk 0: /c','journal compacted');let after=await inspect();
  assert.equal(after.generation,(before.generation+1)&65535);assert.notEqual(after.side,before.side);
  assert(after.end<before.end);assert.equal(after.files.size,before.files.size);
  for(const [name,file] of before.files){assert.deepEqual(after.files.get(name).data,file.data);assert.equal(after.files.get(name).readonly,file.readonly);}
  await check('chkdsk /c 0:','already compact');assert.deepEqual((await inspect()).sides,after.sides);
  await check('chkdsk 8: /c','Drive is not system cartridge');
  await check('chkdsk /v /c','Invalid parameter');
  await enter('echo obsolete >extra.txt');await enter('del extra.txt /p');before=await inspect();
  const point=(await command('break exec df80')).match(/(?:BREAK|WATCH):\s*(\d+)/i);assert(point);
  await command('keybuf chkdsk /c\\x0d');await command('x');await delay(2000);
  assert(/df80/i.test(await command('r')));await command('delete '+point[1]);await boot();
  after=await inspect();assert.equal(after.generation,before.generation);
  for(const [name,file] of before.files)assert.deepEqual(after.files.get(name).data,file.data);
  await check('chkdsk /c','journal compacted');
  console.log('PASS manual compaction, no-op flash preservation, locked files, switch rejection and interrupted-compaction recovery');return;
 }
 await enter('ren autoexec.sample sample.bat');let state=await inspect();
 assert.equal(state.side,initial.side);assert.equal(state.end-initial.end,32);
 assert.deepEqual(state.sides[state.side].subarray(0,initial.end),initial.sides[initial.side].subarray(0,initial.end));
 assert.equal(state.files.get('SAMPLE.BAT').offset,initial.files.get('AUTOEXEC.SAMPLE').offset);
 await enter('copy sample.bat backup.bat');let copied=await inspect();
 assert.equal(copied.end-state.end,32+sample.length);assert.deepEqual(copied.files.get('BACKUP.BAT').data,sample);
 await enter('attrib +l backup.bat');let attr=await inspect();assert.equal(attr.end-copied.end,32);
 await enter('attrib -l backup.bat');await enter('del manual.txt /p');
 await enter('echo ordinary user file >commands.hlp');await check('help cls','Clears');
 await enter('echo executable name is ordinary >mcs-dos.exe');await check('type mcs-dos.exe','ordinary');
 await check('help cls >help.txt','Redirection not supported');
 let beforeRename=await inspect();
 await keys('ren backup.bat mcs-dos.exe\\x0d');await keys('y',1500);
 let afterRename=await inspect();assert.equal(afterRename.end-beforeRename.end,32);
 assert(!afterRename.files.has('BACKUP.BAT'));assert.deepEqual(afterRename.files.get('MCS-DOS.EXE').data,sample);
 console.log('PASS 32-byte REN/ATTRIB, file-only COPY, writable bundled files and independent HELP');

 state=await inspect();await fixture(state,65504);
 // Stop after the spare sector has been erased, before its first programmed byte.
 let point=(await command('break exec df80')).match(/(?:BREAK|WATCH):\s*(\d+)/i);assert(point);
 await command('keybuf ren sample.bat renamed.bat\\x0d');await command('x');await delay(2000);
 assert(/df80/i.test(await command('r')),'interrupted during compaction');
 await command('delete '+point[1]);await boot();await check('type sample.bat','set');
 await enter('ren sample.bat renamed.bat',4000);let compacted=await inspect();
 assert.equal(compacted.generation,(state.generation+1)&65535);assert.notEqual(compacted.side,state.side);
 assert(!compacted.files.has('SAMPLE.BAT'));assert.deepEqual(compacted.files.get('RENAMED.BAT').data,sample);
 for(const [name,file] of state.files)if(name!=='SAMPLE.BAT')assert.deepEqual(compacted.files.get(name).data,file.data,name);
 console.log('PASS interrupted compaction recovery and committed metadata compaction');

 await fixture(compacted,40000);await command(`attach "${disk}" 8`);
 await enter('copy 8:large 0:large',7000);state=await inspect();
 assert.equal(state.generation,(compacted.generation+1)&65535);
 assert.deepEqual(state.files.get('LARGE').data,Buffer.alloc(50000,65));
 for(const [name,file] of compacted.files)assert.deepEqual(state.files.get(name).data,file.data,name);
 console.log('PASS mid-write compaction preserves streamed data and existing files');

 // Abort a replacement after some payload bytes were written; the old file wins.
 point=(await command('break exec df80')).match(/(?:BREAK|WATCH):\s*(\d+)/i);assert(point);
 await command('ignore '+point[1]+' $20');
 await command('keybuf copy 8:blob 0:large /p\\x0d');await command('x');await delay(2000);
 assert(/df80/i.test(await command('r')));await command('delete '+point[1]);await boot();
 let recovered=await inspect();assert.deepEqual(recovered.files.get('LARGE').data,Buffer.alloc(50000,65));assert(recovered.dirty);
 await enter('echo after interruption >after.txt',5000);recovered=await inspect();
 assert.equal(recovered.files.get('AFTER.TXT').data.toString(),'AFTER INTERRUPTION\r');
 assert.deepEqual(recovered.files.get('LARGE').data,Buffer.alloc(50000,65));
 console.log('PASS interrupted replacement retains old file and subsequent writes reclaim torn tail');

 // HELP remains usable without any valid writable filesystem sector.
 await command('detach $20');recovered.sides[0][15]=0;recovered.sides[1][15]=0;replaceSectors(crt,recovered.sides);
 const output=await attach();assert(output.includes('filesystem unavailable'),output);
 await check('help cls','Clears');console.log('PASS HELP survives unavailable writable filesystem');
};

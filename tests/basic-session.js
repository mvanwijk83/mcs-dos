// Real BASIC execution, independently decoded flash, and injected save faults.
const fs=require('fs'),assert=require('assert/strict');
const {execFileSync}=require('child_process'),{tool}=require('./setup');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function journal(file,replace) {
 const crt=fs.readFileSync(file),bytes=Buffer.alloc(131072,255),seen=new Set(),extra=[];
 for(let p=64;p<crt.length;p+=crt.readUInt32BE(p+4)) {
  const bank=crt.readUInt16BE(p+10),side=crt.readUInt16BE(p+12)===0xa000?1:0;
  if(bank<48||bank>55)continue;
  seen.add(bank+':'+side);
  const at=side*65536+(bank-48)*8192;
  if(replace)replace.copy(crt,p+16,at,at+8192);
  else crt.copy(bytes,at,p+16,p+16+8192);
 }
 // VICE omits erased CHIP packets on writeback; materialize them for fixtures.
 if(replace) {
  for(let bank=48;bank<=55;bank++)for(let side=0;side<2;side++)if(!seen.has(bank+':'+side)) {
   const h=Buffer.alloc(16);h.write('CHIP');h.writeUInt32BE(8208,4);h.writeUInt16BE(2,8);
   h.writeUInt16BE(bank,10);h.writeUInt16BE(side?0xa000:0x8000,12);h.writeUInt16BE(8192,14);
   const at=side*65536+(bank-48)*8192;extra.push(h,replace.subarray(at,at+8192));
  }
  fs.writeFileSync(file,Buffer.concat([crt,...extra]));
 }
 return bytes;
}
function record(bytes,slot) {
 const b=bytes.subarray(slot*4096,(slot+1)*4096);
 assert.equal(b.subarray(0,4).toString('hex'),'4d535301');
 assert.equal(b[15],0xa5);assert.equal(b.readUInt16LE(6),3349);
 let crc=65535;
 for(const v of b.subarray(16,16+3349)) {
  crc^=v<<8;for(let i=0;i<8;i++)crc=((crc<<1)^((crc&32768)?0x1021:0))&65535;
 }
 assert.equal(b.readUInt16LE(8),crc,'session payload CRC');return b;
}
module.exports=async function({command,memory,screen,keys,enter,check,defaultFont,disk,crt,root}) {
 const resetSetting=await command('resourceset "CartridgeReset" "0"');assert(!resetSetting.includes('ERROR'),resetSetting);
 const map=fs.readFileSync('build/easyflash/shell.map','utf8');
 function address(name) {const m=map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : '+name+',','m'));assert(m,name);return parseInt(m[1],16);}
 async function variable(name,n=1){const a=address(name);return Buffer.from(await memory(a,a+n-1));}
 async function settled(s,predicate) {
  for(let i=0;i<20&&!predicate(s);i++){await command('x');await delay(500);s=await screen();}
  if(!predicate(s))console.log('Unfinished handoff',await command('r'));
  assert(predicate(s),s);return s;
 }
 async function basic() {return settled(await keys('basic\\x0d',3500),s=>s.includes("type 'shell' to return to mcs-dos")&&s.endsWith('ready.'));}
 async function detach(){await command('detach $20');return journal(crt);}
 async function attach(){await command(`attach "${crt}" $20`);await command('> de02 04');await command('> 01 37');}
 async function resume(expected='A:>',text='shell') {
  return settled(await keys(text+'\\x0d',3500),s=>s.endsWith(expected));
 }
 // External startup resources will be removed before restoration.
 const bat=root+'/build/easyflash/session-autoexec.bat';
 fs.writeFileSync(bat,Buffer.from('SET BOOT=EXTERNAL\rSET CHARSET=CGA\rSET COLOR=2,6,7\rSET PROMPT=$P$C$G$S\r'));
 execFileSync(tool('vice','c1541'),['-attach',disk,'-delete','autoexec.bat','-write',bat,'autoexec.bat,s'],{stdio:'pipe',windowsHide:true});
 await command(`attach "${disk}" 8`);
 await enter('echo bootdrv=8 >config.sys',4000);await enter('reboot',3500);
 await defaultFont(fs.readFileSync('build/CGA.CPI'));
 for(const cmd of ['set boot=changed','set test=preserved','set driveids=dos','set charset=missing','set color=1,0,0','set prompt=nextboot','echo off'])await enter(cmd);
 const fields=[['environment',512,16],['history',650,528],['rawhistory',90,1178],['prompttext',33,1268]];
 await basic();
 assert.equal((await memory(0xd018))[0]&0xfe,0x14,'uppercase ROM font');
 assert.deepEqual(await memory(0x37,0x38),[0,0xa0],'full BASIC RAM');
 assert.deepEqual(await memory(0xd020,0xd021),[0xf7,0xf6],'BASIC preserves border/background');
 assert.equal((await memory(0x286))[0],2,'BASIC preserves foreground');
 await command(`screenshot "${root}/build/easyflash/session-basic.png" 2`);
 let bytes=await detach(),saved=record(bytes,0);await attach();
 assert.deepEqual([...saved.subarray(16,21)],[2,6,7,8,0]);
 const first=Buffer.from(bytes);
 let s=await keys('print 2+3\\x0d');assert(s.includes(' 5'),s);
 await keys('10 print "program works"\\x0d');await keys('20 end\\x0d');
 s=await keys('run\\x0d');assert(s.includes('\nprogram works\n'),s);
 s=await keys('shellx=9:print shellx\\x0d');assert(s.includes(' 9'),s);
 await keys('20 shell\\x0d');s=await keys('run\\x0d');
 assert(s.includes('?syntax  error in 20')&&s.endsWith('ready.'),s);
 await keys('poke 53280,1:poke 53281,0\\x0d');await command('detach 8');
 await resume('A:>','  shell  ');
 for(const [name,n,offset] of fields)assert.deepEqual(await variable(name,n),saved.subarray(16+offset,16+offset+n),name);
 assert.equal((await variable('histcount'))[0],saved[21]);assert.equal((await variable('histnext'))[0],saved[22]);
 assert.deepEqual(await memory(0xd020,0xd021),[0xf7,0xf6]);
 await defaultFont(fs.readFileSync('build/CGA.CPI'));
 await check('set','BOOT=changed');await check('echo','ECHO is off.');
 await command(`screenshot "${root}/build/easyflash/session-restored.png" 2`);
 console.log('PASS BASIC programming, exact history/environment, colors, prompt, drive and disk-free charset restoration');

 // No writes on restoration; fill all slots to exercise real sector rotation.
 bytes=await detach();assert.deepEqual(bytes,first,'return must not rewrite/erase snapshot');
 for(let i=1;i<32;i++){saved.copy(bytes,i*4096);bytes.writeUInt16LE(i+1,i*4096+4);}
 journal(crt,bytes);await attach();
 const bank=(await memory(0x7f5))[0];await command('> de00 '+bank.toString(16));await command('> de02 07');await command('> 01 36');
 await basic();const rotated=await detach();const newest=record(rotated,0);
 assert.equal(newest.readUInt16LE(4),33);
 assert(rotated.subarray(4096,65536).every(b=>b===255),'only reused sector erased');
 assert.deepEqual(rotated.subarray(65536),bytes.subarray(65536),'other journal sector intact');
 const files=require('./easyflash-image').readImage(crt).files;
 for(const name of ['CGA.CPI','MANUAL.TXT'])assert.deepEqual(files.get(name).data,fs.readFileSync('build/'+name));
 await attach();await resume();console.log('PASS append-only journal rotation without filesystem damage');

 // Report an error after begin has written an incomplete header.
 async function failedSave(answer) {
  const asm=fs.readFileSync('build/easyflash/bridge.asm','utf8');
  const at=parseInt(asm.match(/^([0-9a-f]+) : 20 00 80 JSR/m)[1],16)+3;
  const point=(await command('break exec '+at.toString(16))).match(/(?:BREAK|WATCH):\s*(\d+)/i);assert(point);
  await command('keybuf basic\\x0d');await command('x');await delay(1500);
  assert.equal((await memory(0x800))[0],14,'stopped after session begin');
  await command('> 0804 19');await command('delete '+point[1]);await command('x');await delay(600);
  const prompt=await screen();
  assert(prompt.replace(/\s/g,'').includes('Warning:writeerrorsavingshellstate.ProceedtoBASIC(Y/N)?'),prompt);
  const result=await keys(answer,1500);
  assert.equal((await memory(0xc1e1))[0],0,'failed save invalidates return token');return result;
 }
 s=await failedSave('n');assert(s.endsWith('A:>'),s);await check('set','TEST=preserved');
 s=await failedSave('y');assert(s.includes("type 'shell' to return to mcs-dos"),s);
 s=await resume('0:>');assert(s.includes('Using defaults.'),s);
 assert.equal((await variable('envused',2)).readUInt16LE(),0);await defaultFont();
 console.log('PASS failed-save N/Y paths and rejection of older valid snapshots');

 // An intact descriptor cannot make corrupted flash acceptable.
 await enter('set test=crc');await basic();
 const token=await memory(0xc1e2,0xc1e6);bytes=await detach();record(bytes,token[0]);
 bytes[token[0]*4096+16+16]^=1;journal(crt,bytes);await attach();
 s=await resume('0:>');assert(s.includes('Using defaults.'),s);
 assert.equal((await variable('envused',2)).readUInt16LE(),0);
 console.log('PASS corrupted payload rejected before restoration');

 await command(`attach "${disk}" 8`);await command('reset 1');await command('x');await delay(3500);
 await check('set','BOOT=external');await defaultFont(fs.readFileSync('build/CGA.CPI'));
 console.log('PASS normal reset ignores saved sessions and runs CONFIG/AUTOEXEC');
};

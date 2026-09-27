const {tool} = require('./setup');
// Owns a disposable cartridge and disk; never modifies the distribution image.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const root=path.resolve('.').replaceAll('\\','/'),prg=root+'/build/easyflash/shell.prg';
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child,socket;const snapshots=[];
let monitorPort;
async function command(text){
 if(text==='x'||text.startsWith('reset ')){socket.write(text+'\n');await delay(100);return '';}
 return new Promise((resolve,reject)=>{
  let out='',timer;
  const data=d=>{out+=d;clearTimeout(timer);timer=setTimeout(()=>{socket.off('data',data);resolve(out)},100)};
  socket.on('data',data);
  timer=setTimeout(()=>{socket.off('data',data);reject(Error('Monitor timeout: '+text))},5000);
  socket.write(text+'\n');
 });
}
async function memory(a,b=a){const out=await command(`m ${a.toString(16)} ${b.toString(16)}`),bytes=[];for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}assert.equal(bytes.length,b-a+1,out);return bytes;}
async function screen(){const base=(await memory(0x288))[0]*256;await command('bank ram');const bytes=await memory(base,base+999);await command('bank cpu');let s='';for(let i=0;i<1000;i+=40)s+=bytes.slice(i,i+40).map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v);}).join('').trimEnd()+'\n';return s.trimEnd();}
async function keys(s,ms=550){await command('keybuf '+s);await command('x');await delay(ms);const out=await screen();snapshots.push({keys:s,out});return out;}
async function enter(s,ms){
 let out=await keys(s+'\\x0d',ms);
 if(!/^edit\b/.test(s)) {
  for(let i=0;i<60&&!/(?:^|\n)(?:[0-9A-W]+:>|ready\.)$/.test(out);i++){
   await command('x');await delay(500);out=await screen();
  }
  assert(/(?:^|\n)(?:[0-9A-W]+:>|ready\.)$/.test(out),'Command did not finish: '+s+'\n'+out);
 }
 snapshots.push({completed:s,out});return out;
}
function diskFile(file,name){
 const b=fs.readFileSync(file);
 function offset(t,s){let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return(n+s)*256;}
 let t=18,s=1;
 while(t){const o=offset(t,s);for(let i=0;i<256;i+=32){const e=o+i;
  if(!(b[e+2]&7)||b.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'')!==name)continue;
  let tr=b[e+3],se=b[e+4];const data=[],seen=new Set();
  while(tr){const p=offset(tr,se);assert(!seen.has(p));seen.add(p);data.push(b.subarray(p+2,p+(b[p]?256:b[p+1]+1)));tr=b[p];se=b[p+1];}
  return Buffer.concat(data);
 }t=b[o];s=b[o+1];}throw Error('Missing disk file '+name);
}
(async()=>{
 require('./easyflash-image').verifyDistribution('build/easyflash/MCS-DOS.crt');
 const crt=root+'/build/easyflash/test.crt'; fs.copyFileSync('build/easyflash/MCS-DOS.crt',crt);
 const disk=root+'/build/easyflash/test-v2.d64';
 fs.writeFileSync('build/easyflash/external.bat',Buffer.from('SET BOOT=EXTERNAL\rSET CHARSET=CGA\r'));
 const blob=Buffer.from(Array.from({length:1024},(_,i)=>(i*37)&255));fs.writeFileSync('build/easyflash/blob',blob);
 fs.writeFileSync('build/easyflash/large',Buffer.alloc(50000,65));
 const big=Buffer.alloc(53002,0x5a);Buffer.from([1,8,0x4c,1,8]).copy(big);
 fs.writeFileSync('build/easyflash/big.prg',big);
 execFileSync(tool('vice','c1541'),['-format','test,mc','d64',disk,'-attach',disk,
 '-write','build/easyflash/external.bat','autoexec.bat,s','-write','build/CGA.CPI','cga.cpi,s',
 '-write','build/easyflash/blob','blob,s','-write','build/DEMO.prg','demo,p','-write','build/easyflash/large','large,s',
 '-write','build/easyflash/big.prg','big,p'],{stdio:'pipe',windowsHide:true});
 const server=net.createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); monitorPort=server.address().port; await new Promise(r=>server.close(r));
 child=spawn(tool('vice','x64sc'),['-logfile','build/easyflash/vice-debug.log','-default',process.argv.includes('--ntsc')?'-ntsc':'-pal','-sounddev','dummy','-warp','-cartcrt',crt,'-easyflashcrtwrite','-remotemonitoraddress','127.0.0.1:'+monitorPort,'-remotemonitor'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 child.on('exit',code=>console.log('VICE EXIT',code));
 child.stderr.on('data',d=>fs.appendFileSync('build/easyflash/vice-v2.log',d));
 for(let i=0;i<60;i++){
  try{socket=net.connect(monitorPort,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}
  catch{socket.destroy();socket=null;await delay(100);}
 }
 assert(socket,'VICE monitor did not start');socket.on('error',()=>{});await command('x');
 await delay(3000); let s=await screen();
 for(let i=0;i<20&&!s.includes('0:>');i++){await command('x');await delay(500);s=await screen();}
 console.log('BOOT',s); assert(s.includes('0:>'),s);
 assert.deepEqual(await memory(0x283,0x284),[0,0xa0],'normal BASIC RAM limit after cartridge boot');
 await defaultFont();
 if(process.argv.includes('--run-return')) {
  await require('./run-return')({command,memory,screen,keys,enter,check,defaultFont,disk,crt,root});return;
 }
 if(process.argv.includes('--journal')||process.argv.includes('--compact')) {
  await require('./journal')({command,memory,screen,keys,enter,check,defaultFont,disk,crt,root,compactOnly:process.argv.includes('--compact')});return;
 }
 if(process.argv.includes('--session')) {
  await require('./basic-session')({command,memory,screen,keys,enter,check,defaultFont,disk,crt,root});return;
 }
 if(process.argv.includes('--display')) {
  await check('dir','CGA.CPI');
  await defaultFont();
  await enter('splash');await defaultFont();
  await enter('reboot');await defaultFont();
  await check('dir','CGA.CPI');
  await command(`screenshot "${root}/build/easyflash/display-${process.argv.includes('--ntsc')?'ntsc':'pal'}.png" 2`);
  if(process.argv.includes('--display-fonts')) {
   const patch=fs.readFileSync('build/CGA.CPI');
   await enter('echo set charset=cga >autoexec.bat',4000);
   await enter('reboot');await defaultFont(patch);
   await enter('echo set charset=missing >autoexec.bat',4000);
   await enter('reboot');await defaultFont();
   await command(`attach "${disk}" 8`);
   await enter('echo bootdrv=8 >config.sys',4000);
   await enter('reboot');await defaultFont(patch);
   console.log('PASS full cartridge/external CPI fonts and missing-file fallback');
  }
  console.log('PASS default charset after boot, DIR, SPLASH and REBOOT');return;
 }
 if(process.argv.includes('--banked')) {
  await command('bank ram');
  await command('f a000 bfff ea');
  await command('f c300 c6ff cd');
  const bssEnd=JSON.parse(fs.readFileSync('build/easyflash/layout.json')).bssEnd;
  if(bssEnd<=0x8000)await command('f 8000 9fff ab');
  await command('bank cpu');
  await bankChecks();
  await check('mem','bytes cartridge ROM window');
  const free=JSON.parse(fs.readFileSync('build/easyflash/layout.json')).freeRam;
  assert((await screen()).includes(free.toLocaleString('en-US')+' bytes free'));
 }
 if(process.argv.includes('--find-redirection')) {
  await enter('echo one >input.txt',2000);
  await enter('echo two >>input.txt',2000);
  await enter('echo one more >>input.txt',2000);
  await enter('find "one" input.txt >out.txt',2000);
  await enter('cls');s=await check('type out.txt','one more');assert(!s.includes('two'),s);
  await enter('find /c "two" input.txt >>out.txt',2000);
  await enter('cls');s=await check('type out.txt','INPUT.TXT: 1');assert(s.includes('one more'),s);
  await check('help find >out.txt','Redirection not supported');
  await check('find /? >out.txt','Redirection not supported');
  await enter('cls');s=await check('type out.txt','one more');assert(s.includes('INPUT.TXT: 1'),s);
  await check('find "one" input.txt >input.txt','Cannot redirect FIND onto itself');
  await check('find "one" input.txt >>input.txt','Cannot redirect FIND onto itself');
  await enter('cls');await check('type input.txt','two');
  await check('find "one" missing >out.txt','File not found');
  await enter('cls');await check('type out.txt','one more');
  console.log('PASS FIND overwrite/append, preserved input/output files, and rejected HELP redirection');return;
 }
 if(process.argv.includes('--delete')) {
  await command('attach "'+disk+'" 8');
  for(const dev of [0,8]) {
   await enter(dev+':');
   for(const name of ['za.txt','zb.txt','zc.txt'])await enter('echo test >'+name,1800);
   await enter('cls');
   s=await keys('del z?.txt\\x0d',3000);assert(s.includes('Delete ZA.TXT (Y/N)?'),s);
   s=await keys('y',2000);assert(s.includes('Delete ZB.TXT (Y/N)?'),s);
   s=await keys('n');assert(s.includes('Delete ZC.TXT (Y/N)?'),s);
   s=await keys('y',2000);assert(s.trimEnd().endsWith(dev+':>'),s);
   await enter('cls');s=await check('dir z* /b','ZB.TXT');
   assert(!s.includes('ZA.TXT')&&!s.includes('ZC.TXT'),s);
   await enter('del z* /p');
   await enter('cls');s=await enter('dir z* /b');assert(!s.includes('ZB.TXT'),s);
  }
  console.log('PASS wildcard DEL individual Yes/No choices and /P on cartridge and disk');return;
 }
 if(process.argv.includes('--diskinit')) {
  await check('help diskinit','Resets disk drive state and forces a');
  await check('diskinit','Unsupported operation on cartridge');
  await check('diskinit 0:','Unsupported operation on cartridge');
  await command('attach "'+disk+'" 8');
  await enter('cls');
  s=await enter('diskinit 8:');assert.equal(s.trim().replace(/\n+/g,'\n'),'0:>diskinit 8:\n0:>',s);
  await check('dir 8: /b','BLOB');
  await enter('8:');await enter('cls');
  s=await enter('diskinit');assert.equal(s.trim().replace(/\n+/g,'\n'),'8:>diskinit\n8:>',s);
  await check('dir /b','BLOB');
  await check('diskinit 0:','Unsupported operation on cartridge');
  console.log('PASS DISKINIT help, cartridge rejection, explicit/current disk and subsequent directory reads');return;
 }
 if(process.argv.includes('--commands')) {
  const layout=JSON.parse(fs.readFileSync('build/easyflash/layout.json'));
  s=await check('chkdsk',' 64,000 bytes total disk space');
  assert(s.includes(layout.fileBytes.toLocaleString('en-US')+' bytes allocated in 5 files'),s);
  assert(s.includes(layout.available.toLocaleString('en-US')+' bytes available on disk'),s);
  assert(!s.includes('memory')&&!s.includes('blocks')&&!s.includes('reserve'),s);
  await enter('echo one >lines.txt',2000);
  await enter('echo two >>lines.txt',2000);
  await enter('echo three >>lines.txt',2000);
  await enter('cls');s=await check('type lines.txt /h:1','one');assert(!s.includes('two'),s);
  await enter('cls');s=await check('type lines.txt /t:1','three');assert(!s.includes('one'),s);
  await enter('cls');await check('type lines.txt /hex','000000');
  await enter('type lines.txt /t:1 >tail.txt',2000);
  await enter('cls');s=await check('type tail.txt','three');assert(!s.includes('one'),s);
  await check('attrib +r lines.txt','Invalid parameter');
  await enter('attrib +l lines.txt');s=await check('attrib lines.txt','L    LINES.TXT');
  await enter('attrib -l lines.txt');
  await check('move lines.txt tail.txt /p','1 file(s) moved.');
  await enter('cls');await check('type tail.txt /t:2','two');
  await command('attach "'+disk+'" 8');
  s=await check('chkdsk 8:','total blocks on disk');assert(!s.includes('memory'),s);
  console.log('PASS CHKDSK totals, TYPE options/redirection, ATTRIB L and MOVE /P');return;
 }
 if(process.argv.includes('--feedback')) {
  s=await check('dir','CGA.CPI');assert(!s.includes('MCS-DOS.EXE')&&!s.includes('COMMANDS.HLP'),s);
  await check('mem','bytes free');await check('help mem','memory');
  s=await check('chkdsk','64,000 bytes total disk space');
  const layout=JSON.parse(fs.readFileSync('build/easyflash/layout.json'));
  assert(s.includes(layout.available.toLocaleString('en-US')+' bytes available'),s);
  assert(s.includes(layout.fileBytes.toLocaleString('en-US')+' bytes allocated in 5 files'),s);
  await enter('echo abc >mcs-dos.exe',1500);await check('type mcs-dos.exe','abc');
  await enter('ren mcs-dos.exe stats.txt');await check('type stats.txt','abc');
  if(process.argv.includes('--banked'))await bankChecks();
  console.log('PASS removed virtual executable/name restriction and journal accounting');return;
 }
 if(process.argv.includes('--banked-smoke')) {
  await check('help cls','Clears');
  await check('dir','CGA.CPI');
  await check('chkdsk','64,000 bytes total disk space');
  await enter('set test=temporary');
  await enter('reboot');
  assert(!(await enter('set')).includes('TEST=temporary'));
  await bankChecks();
  await command(`attach "${disk}" 8`);
  await runAndReturn('run 8:demo');
  console.log('PASS banked REBOOT and disk PRG launch');return;
 }
 if(process.argv.includes('--launch-only')) {
  await command(`attach "${disk}" 8`);await enter('copy 8:demo 0:demo',3000);
  await runAndReturn('run 0:demo');
  console.log('PASS cartridge PRG launch');return;
 }
 if(process.argv.includes('--recovery-only')) {
  await enter('echo hello >test.txt',3000);
  await recoverWrite(crt);return;
 }
 if(process.argv.includes('--large-launch')) {
  for(const name of ['cga.cpi','autoexec.sample','manual.txt','changelog.txt','license.txt'])
   await enter('del '+name+' /p',3000);
  await command(`attach "${disk}" 8`);
  await enter('copy 8:big 0:big',5000);
  await keys('run 0:big /a 2049\\x0d',2000);
  await command('bank ram');
  assert.deepEqual(Buffer.from(await memory(0x801,0x803)),Buffer.from([0x4c,1,8]));
  assert((await memory(0xd000,0xd0ff)).every(b=>b===0x5a),'PRG bytes under I/O');
  assert.equal((await memory(0x801+53000-1))[0],0x5a,'last PRG byte');
  console.log('PASS large cartridge PRG crosses banks and loads RAM under I/O');return;
 }
 s=await check('dir','CGA.CPI',2000);assert(s.includes('MCS-DOS 2.0')&&s.includes('MC'),s);
 s=await check('mem','bytes free');assert(!s.includes('REU'),s);
 await check('help cls','Clears',1500);
 await check('type autoexec.sample','set',1500);
 await enter('splash');
 await enter('edit edited.txt'); await keys('edited on cartridge\\x03y',4000);
 await check('type edited.txt','edited on cartridge');
 await enter('echo hello >test.txt',5000);
 await check('type test.txt','hello',1500);
 await enter('echo second >>test.txt',4000);
 await check('type test.txt','second');
 await enter('copy test.txt copy.txt',4000); await enter('ren copy.txt renamed.txt',4000);
 await check('type renamed.txt','hello');
 await enter('copy test.txt+renamed.txt joined.txt',4000); await check('type joined.txt','second');
 await enter('attrib +l renamed.txt',4000); await check('attrib renamed.txt','L');
 await enter('echo forbidden >renamed.txt',4000); await check('type renamed.txt','hello');
 await enter('attrib -l renamed.txt',4000); await enter('del renamed.txt /p',4000);
 await check('type renamed.txt','File not found');
 await command(`attach "${disk}" 8`);
 await enter('copy 8:blob 0:blob',4000); await enter('copy 0:blob 8:roundtrip',2500);
 await command('detach 8');
 assert.deepEqual(diskFile(disk,'ROUNDTRIP'),blob);console.log('PASS binary roundtrip');
 await command(`attach "${disk}" 8`);
 await enter('copy 8:large 0:large',4000); await check('type large','File not found');
 await check('format 0:','Unsupported');
 if(process.argv.includes('--banked')) {
  await check('chkdsk 8:','bytes total');
  await check('find "hello" test.txt','hello');
  await enter('reboot');
  await bankChecks();
 }
 await enter('echo set boot=flash >autoexec.bat',4000);
 await enter('echo set charset=cga >>autoexec.bat',4000);
 await enter('echo bootdrv=9,0 >config.sys',4000);
 await command('reset 0'); await command('x'); await delay(3500); await check('set','BOOT=flash');
 await command('bank ram');assert.deepEqual(Buffer.from(await memory(0xe800,0xe807)),fs.readFileSync('build/CGA.CPI').subarray(7,15));
 await command('bank cpu');console.log('PASS cartridge startup charset');
 await enter('echo bootdrv=7 >config.sys',4000);
 await command('reset 0');await command('x');await delay(3000);
 s=await screen();assert(s.includes('Invalid CONFIG.SYS directive'),s);
 await check('set','BOOT=flash');console.log('PASS invalid configuration keeps default');
 await enter('echo bootdrv= 8, 0 >config.sys',4000);
 await command('reset 0'); await command('x'); await delay(3500); await check('set','BOOT=external');
 await command('bank ram');
 assert.deepEqual(Buffer.from(await memory(0xe800,0xe807)),fs.readFileSync('build/CGA.CPI').subarray(7,15));
 await command('bank cpu');console.log('PASS external startup charset');
 await enter('0:'); await enter('echo ldautoex=0 >config.sys',4000);
 await command('reset 0'); await command('x'); await delay(3500); s=await enter('set'); assert(!s.includes('BOOT='),s);
 await enter('copy 8:demo 0:demo',4000); await runAndReturn('run 0:demo');
 console.log('PASS cartridge PRG launch');
 await command('reset 0'); await command('x'); await delay(3000);
 if(process.argv.includes('--banked')) {
  await runAndReturn('run 8:demo');
  console.log('PASS disk PRG launch from banked RUN');
  await command('reset 0');await command('x');await delay(3000);
 }
 await check('type test.txt','hello',1500);
 await recoverWrite(crt);
 const saved=require('./easyflash-image').readImage(crt).files;
 assert.deepEqual(saved.get('BLOB').data,blob);
 assert.equal(saved.get('TEST.TXT').data.toString(),'HELLO\rSECOND\r');
 assert.equal(saved.get('EDITED.TXT').data.toString(),'EDITED ON CARTRIDGE\r');
 for(const name of ['CGA.CPI','AUTOEXEC.SAMPLE','MANUAL.TXT','CHANGELOG.TXT','LICENSE.TXT'])
  assert.deepEqual(saved.get(name).data,fs.readFileSync('build/'+name),name+' remains intact');
 console.log('PASS persisted file bytes and bundled resources');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 fs.writeFileSync('build/easyflash/test-v2.json',JSON.stringify(snapshots,null,2));
 socket?.destroy();if(child&&child.exitCode===null)child.kill();
});
async function runAndReturn(cmd){
 let s=await keys(cmd+'\\x0d',3500);
 for(let i=0;i<40&&!s.endsWith('0:>');i++){await command('x');await delay(500);s=await screen();}
 assert(s.endsWith('0:>'),s);
}
async function recoverWrite(crt){
 // Keep the remote connection alive so a breakpoint stays in the remote
 // monitor instead of opening VICE's native interactive monitor window.
 const point=(await command('break exec df80')).match(/(?:BREAK|WATCH):\s*(\d+)/i);
 assert(point,'flash breakpoint installed');
 await command('keybuf echo interrupted >test.txt\\x0d');await command('x');await delay(2000);
 const regs=await command('r');assert(/df80/i.test(regs),'interrupted at flash writer: '+regs);
 await command('delete '+point[1]);await command('reset 0');await command('x');await delay(3000);
 await check('type test.txt','hello');console.log('PASS interrupted write recovery');
 // Monitor numbers default to hexadecimal: cartridge device 32 is $20.
 const detached=await command('detach $20');assert(!/error|invalid|unknown/i.test(detached),detached);
 const persisted=require('./easyflash-image').readImage(crt);
 assert(persisted.files.has('TEST.TXT'),'changes reached the host CRT file');
 const attached=await command(`attach "${crt}" $20`);assert(!/error|invalid|unknown/i.test(attached),attached);
 await command('reset 1');await command('x');await delay(3000);
 await check('type test.txt','hello');
 console.log('PASS CRT writeback and power-cycle restoration');
}
async function check(cmd,expected,ms=900){await enter('cls');const s=await enter(cmd,ms);if(!s.includes(expected)){const map=fs.readFileSync(prg.replace(/\.prg$/,'.map'),'utf8');for(const name of ['count','p1','files','argc','args']){const m=map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : '+name+',','m'));if(m)console.log(name,await memory(parseInt(m[1],16),parseInt(m[1],16)+19));}}assert(s.includes(expected),cmd+'\n'+s);console.log('PASS '+cmd);return s;}

async function bankChecks(){
 assert.equal((await memory(0x7f5))[0],5,'input waits in edit bank with IRQs working');
 assert.equal((await memory(1))[0]&7,6,'ROML hidden, ROMH and KERNAL visible');
 const crt=fs.readFileSync('build/easyflash/MCS-DOS.crt');let expected;
 for(let p=64;p<crt.length;p+=crt.readUInt32BE(p+4))
  if(crt.readUInt16BE(p+10)===5&&crt.readUInt16BE(p+12)===0xa000)expected=crt.subarray(p+16,p+32);
 assert(expected);assert.deepEqual(Buffer.from(await memory(0xa000,0xa00f)),expected,'CPU reads actual command ROM');
 if(JSON.parse(fs.readFileSync('build/easyflash/layout.json')).bssEnd<=0x8000)
  assert((await memory(0x8000,0x9fff)).every(b=>b===0xab),'ROML window is usable RAM while a command bank is visible');
 await command('bank ram');
 assert((await memory(0xa000,0xbfff)).every(b=>b===0xea),'commands never copied to RAM beneath ROM');
 assert((await memory(0xc300,0xc6ff)).every(b=>b===0xcd),'upper free RAM remains untouched');
 await command('bank cpu');console.log('PASS ROM execution, restored bank, and free RAM guards');
}

async function defaultFont(patch){
 const rom=fs.readFileSync(process.env.VICE_CHARGEN || path.join(process.env.VICE_HOME||'','C64','chargen-901225-01.bin'));
 const expected=Buffer.from(rom.subarray(2048,4096));
 for(let row=0;row<8;row++){
  expected[96*8+row]=rom[77*8+row];
  expected[224*8+row]=rom[77*8+row]^255;
 }
 if(patch)for(let i=0;i<patch[5];i++){
  const at=6+i*9,code=patch[at];
  for(let row=0;row<8;row++){
   expected[code*8+row]=patch[at+1+row];
   expected[(code+128)*8+row]=patch[at+1+row]^255;
  }
 }
 await command('bank ram');const actual=Buffer.from(await memory(0xe800,0xefff));await command('bank cpu');
 const different=actual.findIndex((byte,i)=>byte!==expected[i]);
 if(different>=0)await command(`screenshot "${root}/build/easyflash/charset-failure.png" 2`);
 assert.equal(different,-1,'default charset differs from character ROM at byte '+different+
  ': actual '+actual[different]+', expected '+expected[different]);
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'relocated screen/font');
 assert.equal((await memory(0xdd00))[0]&3,0,'VIC bank 3');
 console.log('PASS complete '+(patch?'CPI':'default')+' charset and VIC mapping');
}

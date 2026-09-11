// Owns its VICE process and disposable disks. Compare actual SEQ bytes after close.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const command=require('./vice-command')(()=>socket);
async function screen(){
 const pointer=await command('m 0288 0288');
 const base=parseInt(pointer.match(/>C:0288\s+([\da-f]{2})/i)[1],16)*256;
 await command('bank ram');
 const out=await command(`m ${base.toString(16)} ${(base+999).toString(16)}`),bytes=[];
 await command('bank cpu');
 for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}
 return bytes.map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v>=65&&v<=90?v:v);}).join('');
}
async function enter(s,ms=1300){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}
const disk=path.resolve('build/test-redirection.d64'),target=path.resolve('build/test-redirection-target.d64');
const c1541=path.resolve('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe');
function drive(...args){return execFileSync(c1541,args,{stdio:'pipe'});}
function read(name,which=disk){
 const image=fs.readFileSync(which);
 function offset(t,s){let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return (n+s)*256;}
 let t=18,s=1;
 while(t){const base=offset(t,s);for(let i=0;i<8;i++){
  const p=base+i*32,entry=image.subarray(p+5,p+21),end=entry.indexOf(160);
  if(entry.subarray(0,end<0?16:end).toString()!==name.toUpperCase())continue;
  assert.equal(image[p+2],0x81,'Closed SEQ: '+name);
  let ft=image[p+3],fs=image[p+4];const chunks=[],seen=new Set();
  while(ft){const b=offset(ft,fs);assert(!seen.has(b),'sector cycle');seen.add(b);const next=image[b];chunks.push(image.subarray(b+2,next?b+256:b+1+image[b+1]));ft=next;fs=image[b+1];}
  return Buffer.concat(chunks);
 }t=image[base];s=image[base+1];}
 throw Error('Missing '+name);
}
const raw=Buffer.from(Array.from({length:1025},(_,i)=>i%256));
async function run(){
 fs.copyFileSync('build/MCS-DOS.d64',disk);
 drive('-format','redirect,rd','d64',target);
 fs.writeFileSync('build/redirect-raw',raw);drive('-attach',disk,'-write','build/redirect-raw','raw,s');
 fs.writeFileSync('build/redirect-batch','@ECHO OFF\rECHO BATCH>BT\rECHO APPEND>>BT\r');
 drive('-attach',disk,'-write','build/redirect-batch','test.bat,s');
 drive('-format','full,rd','d64','build/test-redirection-full.d64');
 fs.writeFileSync('build/redirect-fill',Buffer.alloc(663*254,65));
 drive('-attach','build/test-redirection-full.d64','-write','build/redirect-fill','fill,s');
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(path.resolve('tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe'),['-default','-sounddev','dummy','-warp','-drive9type','1541','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor','-8',disk,'-9',target],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 child.stderr.pipe(fs.createWriteStream('build/redirection.log'));
 for(let i=0;i<200;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket,'VICE did not start');socket.on('error',()=>{});
 for(let i=0;i<40;i++){await command('x');await delay(300);if((await screen()).includes('ready.'))break;}
 assert((await screen()).includes('ready.'),'BASIC startup did not complete');
 await command('load "'+path.resolve('build/MCS-DOS.prg').replaceAll('\\','/')+'" 0');await command('> ba 08');let startup=await enter('run',3000);
 for(let i=0;i<40 && !startup.includes('A:>');i++){await command('x');await delay(300);startup=await screen();}assert(startup.includes('A:>'),startup);
 await enter('prompt $n$c$g');
 async function check(cmd,expected){await enter('cls',100);let s=await enter(cmd,2000);for(let i=0;i<100&&!s.trimEnd().endsWith('8:>');i++){await command('x');await delay(250);s=await screen();}if(expected)assert(s.includes(expected),cmd+'\n'+s);else assert(!/error|fault|not ready|not found/i.test(s),cmd+'\n'+s);assert(!s.includes('Press any key'),s);assert(s.trimEnd().endsWith('8:>'),cmd+'\n'+s);console.log('OK '+cmd);}
 await check('echo first>out');await check('echo second>>out');
 await check('echo old longer text>replace');await check('echo x>replace');
 await check('echo new>>new');await check('echo.>emptyline');
 await check('echo "a>b">"quoted name"');
 await check('type raw>rawcopy');await check('type raw>9:cross');
 await check('type raw>>rawcopy');await check('echo letter>B:letter');
 await check('echo '+'x'.repeat(55)+'>longline');
 await check('dir/b>files');await check('dir>listing');await check('chkdsk>stats');await check('mem>memory');await check('help>commands');
 await check('type raw>raw','Cannot redirect TYPE onto itself');
 await check('type raw>>8:raw','Cannot redirect TYPE onto itself');
 await check('echo bad>rawcopy>lpt1','Multiple redirections');
 await check('echo bad>lpt1','Printer redirection not supported');
 await check('echo bad>4:','Invalid drive specification');
 await check('ver>bad','Redirection not supported');
 await check('echo bad>','Invalid destination');
 await check('echo bad>one two','Invalid destination');
 await check('echo bad>mcs-dos','Destination must be a SEQ file');
 await check('type missing>replace','File not found');
 await check('dir/z>errors','Invalid switch');
 await check('echo bad>30:absent','Drive not ready');
 await check('echo recovered>recovered');
 await check('run test.bat');
 await enter('cls',100);await command('keybuf type raw>partial\\x0d\\x03');await command('x');await delay(2000);
 await check('echo after-cancel>cancel-ok');
 await check('print raw 6:','Invalid printer');
 await check('print raw lpt3','Invalid printer');
 await check('echo screen-restored','screen-restored');
 await command('detach 9');
 await command('attach "'+path.resolve('build/test-redirection-full.d64').replaceAll('\\','/')+'" 9');
 await check('type raw>9:overflow','error');
 await check('echo after-full>full-ok');
 // Establish the drive's native representation of an unwritten SEQ file.
 await enter('exit');await enter('open 5,8,5,"0:empty,s,w":close 5');
 await command('detach 8');await command('detach 9');
 verify();
}
function petscii(s){return Buffer.from(s).map(c=>c>=65&&c<=90?c+128:c>=97&&c<=122?c-32:c);}
function verify(){
 assert.equal(read('out').toString(),'FIRST\rSECOND\r');
 assert.equal(read('replace').toString(),'X\r');assert.equal(read('new').toString(),'NEW\r');
 assert.equal(read('emptyline').toString(),'\r');assert.equal(read('quoted name').toString(),'"A>B"\r');
 assert.deepEqual(read('rawcopy'),Buffer.concat([raw,raw]));assert.deepEqual(read('raw'),raw);assert.deepEqual(read('cross',target),raw);
 assert.equal(read('letter',target).toString(),'LETTER\r');assert.equal(read('longline').toString(),'X'.repeat(55)+'\r');
 assert.deepEqual(read('errors'),read('empty'));assert.equal(read('recovered').toString(),'RECOVERED\r');
 assert.equal(read('bt').toString(),'BATCH\rAPPEND\r');
 const partial=read('partial');assert(partial.length<raw.length);assert.deepEqual(partial,raw.subarray(0,partial.length));
 assert.equal(read('cancel-ok').toString(),'AFTER-CANCEL\r');assert.equal(read('full-ok').toString(),'AFTER-FULL\r');
 assert(read('files').includes(petscii('RAW\r')));
 assert(read('listing').includes(petscii('File(s)')));
 assert(read('stats').includes(petscii('(254 usable)\r')));
 assert(read('memory').includes(petscii('bytes free\r')));
 assert(read('commands').includes(petscii('TYPE')));
 console.log('PASS overwrite, append/create, quoting, raw TYPE (same/cross drive), six commands, rejected destinations/chaining, errors and recovery');
}
(process.argv.includes('--verify-only')?Promise.resolve().then(verify):run()).catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.destroy();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}});

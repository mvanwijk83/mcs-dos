const {tool} = require('./setup');
// Owned VICE instance: concatenation, locking, native validation and SPLASH.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const standard=process.argv.includes('--ntsc')?'ntsc':'pal';
const root=path.resolve('.').replaceAll('\\','/');
const disk=root+'/build/test-help-prompt.d64';
const c1541=tool('vice', 'c1541');
async function command(text){
 if(text==='x'){socket.write('x\n');await delay(80);return '';}
 return new Promise((resolve,reject)=>{
  let out='',timer;
  const data=d=>{out+=d;clearTimeout(timer);timer=setTimeout(()=>{socket.off('data',data);resolve(out)},80)};
  socket.on('data',data);
  timer=setTimeout(()=>{socket.off('data',data);reject(Error('Monitor timeout: '+text))},3000);
  socket.write(text+'\n');
 });
}
async function memory(a,b=a,ram=false){
 if(ram)await command('bank ram');
 const out=await command(`m ${a.toString(16)} ${b.toString(16)}`),bytes=[];
 if(ram)await command('bank cpu');
 for(const line of out.split('\n')){
  const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);
  if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));
 }
 assert.equal(bytes.length,b-a+1,out);return bytes;
}
async function screen(){
 const base=(await memory(0x288))[0]*256,bytes=await memory(base,base+999,true),rows=[];
 for(let i=0;i<1000;i+=40)rows.push(bytes.slice(i,i+40).map(v=>{
  v&=127;return v>=1&&v<=26?String.fromCharCode(v+96):v>=65&&v<=90?String.fromCharCode(v):String.fromCharCode(v);
 }).join('').trimEnd());
 return rows;
}
async function keys(s,ms=450){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
async function enter(s,ms){return keys(s+'\\x0d',ms)}


async function run(){
 const fixture=fs.readFileSync('build/MCS-DOS.d64');
 // Mark otherwise-unused track 35 sector 16 allocated: V0 must free it.
 const bam=357*256+35*4;
 assert(fixture[bam+3]&1);fixture[bam]--;fixture[bam+3]&=254;
 fs.writeFileSync('build/test-new-commands.d64',fixture);
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(tool('vice', 'x64sc'),
 ['-default','-sounddev','dummy','-warp','-8',root+'/build/test-new-commands.d64','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket);socket.on('error',()=>{});await command('x');await delay(2000);
 await command('load "'+root+'/build/MCS-DOS.prg" 0');await command('> ba 08');
 await enter('run',3500);
 async function check(cmd,text,ms=1000){console.log('Checking '+cmd);await enter('cls');let out=(await enter(cmd,ms)).join('\n');for(let i=0;i<15&&!out.includes(text);i++){await command('x');await delay(1000);out=(await screen()).join('\n');}assert(out.includes(text),cmd+'\n'+out);}
 await check('echo one > one','8:>');await check('echo two > two','8:>');
 await check('concat one two joined','Bad command or file name');
 await check('copy one+two joined','1 file(s) copied.');await check('type joined','one\ntwo');
 await check('copy one+two joined','file exists');
 await check('copy one plain','1 file(s) copied.');await check('type plain','one');
 await check('copy one++two invalid','Invalid file name');
 await check('copy one+ invalid','Invalid file name');
 await check('copy +one invalid','Invalid file name');
 await check('copy 8:one+9:two x','Files must be on the same disk');
 await check('copy abcdefghijklmnop+abcdefghijklmnop abcdefghijklmnop','File list too long');
 await check('attrib +r one','8:>');await check('attrib one','  R    ONE');
 await check('del one /p','File is locked');await check('type one','one');
 await check('del o* /p','File is locked');await check('type one','one');
 await check('del one','File is locked');
 await check('mem /s','Invalid parameter');await check('chkdsk /s','Invalid parameter');
 await check('attrib','TWO');
 await check('attrib -r one','8:>');await check('attrib one','       ONE');
 await check('del one /p','8:>');await check('type one','File not found');
 await check('chkdsk /v','Disk validation complete.',25000);
 await command('detach 8');
 assert(fs.readFileSync('build/test-new-commands.d64')[bam+3]&1,'V0 repairs orphan allocation');
 const damaged=fs.readFileSync('build/test-new-commands.d64');
 // First live entry points outside a 1541 disk: native validation must fail.
 damaged[358*256+3]=40;
 fs.writeFileSync('build/test-new-commands-bad.d64',damaged);
 await command('attach "'+root+'/build/test-new-commands-bad.d64" 8');
 await check('chkdsk /v','Disk validation failed',25000);
 await check('mem /v','Invalid parameter');await check('attrib /x','Invalid parameter');
 await check('splash x','Invalid parameter');
 const bank=await memory(0x288),bg=await memory(0xd021);
 await check('splash','MCS-DOS version',350);
 assert.deepEqual(await memory(0x288),bank);assert.deepEqual(await memory(0xd021),bg);
 await check('echo ready','ready');
 console.log('PASS COPY concatenation contents/errors, ATTRIB lock/unlock/delete protection, CHKDSK validation, SPLASH state and immediate prompt');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.destroy();if(child&&child.exitCode===null)child.kill();});

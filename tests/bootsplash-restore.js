const {tool}=require('./setup');
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const petscii=require('../scripts/petscii');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const command=require('./vice-command')(()=>socket);
async function screen(){
 const pointer=await command('m 0288 0288');
 const base=parseInt(pointer.match(/>C:0288\s+([\da-f]{2})/i)[1],16)*256;
 await command('bank ram');const out=await command(`m ${base.toString(16)} ${(base+999).toString(16)}`),bytes=[];await command('bank cpu');
 for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}
 return bytes.map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v>=65&&v<=90?v:v);}).join('');
}
async function run(){
 const disk=path.resolve('build/test-bootsplash-restore.d64');fs.copyFileSync('build/MCS-DOS.d64',disk);
 fs.writeFileSync('build/restore-autoexec',petscii('@ECHO OFF\rECHO AUTOEXEC-RAN\r'));
 execFileSync(tool('vice','c1541'),['-attach',disk,'-write','build/restore-autoexec','autoexec.bat,s'],{stdio:'pipe'});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(tool('vice','x64sc'),['-default','-sounddev','dummy','-8',disk,'-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 child.stderr.pipe(fs.createWriteStream('build/bootsplash-restore.log'));
 for(let i=0;i<200;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}catch(e){socket?.destroy();socket=null;await delay(100);}}
 assert(socket,'VICE did not start');socket.on('error',()=>{});
 for(let i=0;i<40;i++){await command('x');await delay(300);try{if((await screen()).includes('ready.'))break;}catch{}}
 await command('load "'+path.resolve('build/MCS-DOS.prg').replaceAll('\\','/')+'" 0');await command('> ba 08');
 await command('keybuf run\\x0d');await command('x');await delay(500);
 const vector=await command('m 0318 0319'),vm=vector.match(/>C:0318\s+([\da-f]{2})\s+([\da-f]{2})/i);assert(vm,vector);
 const handler=parseInt(vm[1],16)|(parseInt(vm[2],16)<<8);assert.notEqual(handler,0xfe47,vector);
 const code=await command(`m ${handler.toString(16)} ${(handler+8).toString(16)}`),cm=code.match(/>C:[\da-f]{4}\s+48\s+a9\s+01\s+8d\s+([\da-f]{2})\s+([\da-f]{2})\s+68\s+40/i);assert(cm,code);
 const flag=parseInt(cm[1],16)|(parseInt(cm[2],16)<<8);await command(`> ${flag.toString(16)} 01`);await command('x');await delay(1000);
 let out=await screen();for(let i=0;i<20&&!out.trimEnd().endsWith('8:>');i++){await command('x');await delay(200);out=await screen();}
 assert(out.trimEnd().endsWith('8:>'),out);assert(!out.includes('AUTOEXEC-RAN'),out);
 console.log('PASS RESTORE during boot splash skips AUTOEXEC.BAT and reaches the prompt early');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.destroy();if(child&&child.exitCode===null)child.kill();});

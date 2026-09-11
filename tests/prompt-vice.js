// Owns its VICE process and disposable disk; never uses a user disk.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
async function command(text){
 if(text==='x'){socket.write('x\n');await delay(80);return '';}
 return new Promise((resolve,reject)=>{
  let out='',timer; const data=d=>{out+=d;clearTimeout(timer);timer=setTimeout(done,80);};
  const done=()=>{socket.off('data',data);resolve(out);};
  socket.on('data',data);timer=setTimeout(()=>{socket.off('data',data);reject(Error(text));},3000);
  socket.write(text+'\n');
 });
}
async function screen(){
 let page=await command('m 0288 0288');
 if(!page.includes('>C:'))page=await command('m 0288 0288');
 const match=page.match(/>C:0288\s+([\da-f]{2})/i);assert(match,page);
 const base=parseInt(match[1],16)*256;
 await command('bank ram');
 const out=await command('m '+base.toString(16)+' '+(base+999).toString(16)),bytes=[];
 await command('bank cpu');
 for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}
 return bytes.map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v===27?91:v===29?93:v);}).join('');
}
async function enter(s,ms=1300){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}

async function run(){
 const disk=path.resolve('build/test-prompt.d64');
 fs.copyFileSync('build/MCS-DOS.d64',disk);
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(path.resolve('tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe'),['-default','-sounddev','dummy','-warp','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor','-8',disk],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<200;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket);socket.on('error',()=>{});
 for(let i=0;i<40;i++){await command('x');await delay(250);if((await screen()).includes('ready.'))break;}
 await command('load "'+path.resolve('build/MCS-DOS.prg').replaceAll('\\','/')+'" 0');await command('> ba 08');
 const startup=await enter('run',5000);assert(startup.includes('A:>'),startup);
 async function fresh(s){await enter('cls',100);return enter(s);}

 await enter('prompt [$d/$n/$p]$g');
 assert((await fresh('cls')).trimEnd().endsWith('[A/8/8]>'));
 await enter('set driveids=dos');assert((await screen()).trimEnd().endsWith('[A/8/A]>'));
 await enter('30:');assert((await screen()).trimEnd().endsWith('[W/30/W]>'));await enter('8:');
 await enter('prompt literal > $x $$ $');assert((await fresh('cls')).trimEnd().endsWith('literal > $x $ $'));
 await enter('prompt $V$R$d$c$g');assert((await fresh('cls')).trimEnd().endsWith('1.0'+ ' '.repeat(37)+'A:>'));
 await enter('prompt '+ 'z'.repeat(39));await enter('echo working');assert((await screen()).includes('working'));
 await enter('prompt');assert((await fresh('cls')).trimEnd().endsWith('A:>'));
 await enter('prompt $B$H');await fresh('cls');
 await command('bank ram');
 const graphics=await command('m e000 e3e7');assert(/5d 60/i.test(graphics),graphics);
 await command('bank cpu');
 await enter('prompt');
 console.log('PASS VICE custom/default prompts, dynamic drive settings, literal > and unknown codes, line break, version, long-prompt input and PETSCII screen graphics');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.destroy();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}});

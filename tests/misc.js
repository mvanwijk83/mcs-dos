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
 const out=await command('m 0400 07e7'),bytes=[];
 for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}
 return bytes.map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v>=65&&v<=90?v:v);}).join('');
}
async function enter(s,ms=1300){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}

async function run(){
 const disk=path.resolve('build/test-misc.d64');
 fs.copyFileSync('build/MCS-DOS.d64',disk);
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(path.resolve('tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe'),['-default','-sounddev','dummy','-warp','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor','-8',disk],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<200;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket);socket.on('error',()=>{});
 await command('x');await delay(1500);await command('load "'+path.resolve('build/MCS-DOS.prg').replaceAll('\\','/')+'" 0');await command('> ba 08');assert((await enter('run',3000)).includes('8:>'));
 async function fresh(s){await enter('cls',100);return enter(s);}
 async function reg(a){const r=await command('m '+a+' '+a);return parseInt(r.match(/>C:[0-9a-f]+\s+([0-9a-f]{2})/i)[1],16)&15;}
 await enter('set driveids=dos');assert((await screen()).includes('A:>'));
 assert((await enter('b:')).includes('B:>'));assert((await enter('w:')).includes('W:>'));assert((await enter('8:')).includes('A:>'));assert((await enter('a:')).includes('A:>'));
 await enter('color/fore:5/back:2/border:7');assert.equal(await reg('0286'),5);assert.equal(await reg('d021'),2);assert.equal(await reg('d020'),7);
 for(const cmd of ['color /fore:16','color /back:','color /fore 1','color /fore:3 /back:no','color /preset:1 /fore:2']){await fresh(cmd);assert.equal(await reg('0286'),5);assert.equal(await reg('d021'),2);assert.equal(await reg('d020'),7);}
 await enter('color /preset:5');assert.equal(await reg('0286'),14);assert.equal(await reg('d021'),6);
 for(const alias of ['del','delete','erase']){
  await enter('echo test>one');await enter('echo test>two');
  assert((await fresh(alias+' a:*')).includes('Delete all matching files'));
  await enter('n');assert((await fresh('dir/b')).includes('ONE'));
  await fresh(alias+' *');await enter('y',2500);
  const listing=await fresh('dir/b');assert(!listing.includes('ONE')&&!listing.includes('TWO')&&!listing.includes('MCS-DOS'),listing);
 }
 console.log('PASS A/B/W aliases, colon COLOR values and atomic validation, all three wildcard delete aliases and cancellation');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.destroy();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}});

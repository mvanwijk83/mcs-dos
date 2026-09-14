const {tool} = require('./setup');
// Owned VICE instance: FIND disk cursors and switch integration.
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
  v&=127;if(v===27||v===29)return String.fromCharCode(v+64);return v>=1&&v<=26?String.fromCharCode(v+96):v>=65&&v<=90?String.fromCharCode(v):String.fromCharCode(v);
 }).join('').trimEnd());
 return rows;
}
async function keys(s,ms=450){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
async function enter(s,ms){return keys(s+'\\x0d',ms)}


async function run(){
 fs.copyFileSync('build/MCS-DOS.d64','build/test-find.d64');
 fs.writeFileSync('build/find-fixture',Buffer.from('DOS\rdos\rno match\rDOS final').map(n=>n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n));
 execFileSync(c1541,['-attach','build/test-find.d64','-write','build/find-fixture','findtest,s'],{stdio:'pipe'});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(tool('vice', 'x64sc'),
 ['-default','-sounddev','dummy','-warp','-8',root+'/build/test-find.d64','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket);socket.on('error',()=>{});await command('x');await delay(2000);
 await command('load "'+root+'/build/MCS-DOS.prg" 0');await command('> ba 08');
 await enter('run',3500);
 async function check(cmd,text,ms=1000){console.log('Checking '+cmd);await enter('cls');let out=(await enter(cmd,ms)).join('\n');for(let i=0;i<15&&!out.includes(text);i++){await command('x');await delay(1000);out=(await screen()).join('\n');}assert(out.includes(text),cmd+'\n'+out);}

 await check('find "DOS" findtest','DOS final',5000);
 await check('find /c "DOS" findtest','---- FINDTEST: 2',5000);
 await check('find /i/c "DOS" findtest','---- FINDTEST: 3',5000);
 await check('find /v/n "DOS" findtest','[3]no match',5000);
 console.log('PASS VICE FIND two disk cursors, case, counts, inversion and numbering');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.destroy();if(child&&child.exitCode===null)child.kill();});


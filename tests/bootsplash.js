// Owned VICE instance: help pagination and startup-only PROMPT environment.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const standard=process.argv.includes('--ntsc')?'ntsc':'pal';
const root=path.resolve('.').replaceAll('\\','/');
const disk=root+'/build/test-help-prompt.d64';
const c1541=root+'/tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe';
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
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(root+'/tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe',
  ['-default','-'+standard,'-sounddev','dummy','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],
  {windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){
  try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}
  catch(e){socket.destroy();socket=null;await delay(100);}
 }
 assert(socket);socket.on('error',()=>{});
 await command('x');await delay(2500);
 for(let i=0;i<30;i++){
  if((await screen()).includes('ready.'))break;
  await command('x');await delay(300);
 }
 await command(`load "${root}/build/MCS-DOS.prg" 0`);await command('> ba 00');
 let rows=await enter('run',600);
 const version=fs.readFileSync('src/mcsdos.c','utf8').match(/#define VERSION "([^"]+)"/)[1];
 const product='MCS-DOS version '+version;
 const copyright='Copyright (C) 2026 MCS';
 assert.equal(rows[12].trim(),product,rows.join('\n'));
 assert.equal(rows[13].trim(),copyright,rows.join('\n'));
 const bytes=await memory(0x400,0x7e7),colors=await memory(0xd800,0xdbe7);
 const logo=fs.readFileSync('assets/LOGO.TXT').toString('latin1').trimEnd().split('\r');
 for(let y=0;y<25;y++)for(let x=0;x<40;x++){
  let expected=32;
  if(y>=2&&y<9&&x>=4&&x<36)expected=(logo[y-2].charCodeAt(x-4)||32)===162?98:32;
  const label=y===12?product:y===13?copyright:null;
  if(label&&x>=Math.floor((40-label.length)/2)&&x<Math.floor((40-label.length)/2)+label.length)continue;
  assert.equal(bytes[y*40+x],expected,`cell ${x},${y}`);
  if(y>=2&&y<9&&x>=4&&x<36)assert.equal(colors[y*40+x]&15,6);
 }
 for(const [y,label] of [[12,product],[13,copyright]]){
  const left=Math.floor((40-label.length)/2);
  assert.equal(rows[y], ' '.repeat(left)+label);
  for(let x=left;x<left+label.length;x++)assert.equal(colors[y*40+x]&15,1);
 }
 assert.equal((await memory(0xd021))[0]&15,0);
 await command(`screenshot "${root}/build/bootsplash-${standard}.png" 2`);
 await command('x');await delay(2600);
 assert.equal((await screen())[12].trim(),product,'splash remains before four seconds');
 await command('x');await delay(1800);
 assert((await screen()).join('\n').includes(':>'),'startup completes');
 rows=await enter('reboot',600);
 assert(rows.join('\n').includes(':>'),'REBOOT skips the splash delay');
 assert(!rows.join('\n').includes(product));
 console.log('PASS '+standard+': exact logo cells, padding, colors, VERSION text, delay and REBOOT bypass');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.destroy();if(child&&child.exitCode===null)child.kill();});

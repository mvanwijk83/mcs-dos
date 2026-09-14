const {tool} = require('./setup');
// One owned emulator, one persistent monitor connection, deterministic cleanup.
const fs=require('fs'),net=require('net'),path=require('path');
const {spawn}=require('child_process');
const assert=require('assert/strict');
const standard=process.argv.includes('--ntsc')?'ntsc':'pal';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const command=require('./vice-command')(()=>socket);
async function memory(a,b=a){
 if(a>=0xe000)await command('bank ram');
 const out=await command(`m ${a.toString(16)} ${b.toString(16)}`), bytes=[];
 for(const line of out.split('\n')){
  const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);
  if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));
 }
 if(a>=0xe000)await command('bank cpu');
 assert.equal(bytes.length,b-a+1,out);return bytes;
}
async function screen(){
 const base=(await memory(0x288))[0]*256;
 const bytes=await memory(base,base+999),rows=[];
 for(let i=0;i<1000;i+=40)rows.push(bytes.slice(i,i+40).map(v=>{
  v&=127;return v>=1&&v<=26?String.fromCharCode(v+96):v>=65&&v<=90?String.fromCharCode(v):String.fromCharCode(v);
 }).join('').trimEnd());
 return rows;
}
async function keys(s,ms=300){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
async function run(){
 const server=net.createServer();
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 const port=server.address().port;
 await new Promise(r=>server.close(r));
 const disk=path.resolve('build/test-editor-session.d64');
 fs.copyFileSync('build/MCS-DOS.d64',disk);
 child=spawn(tool('vice', 'x64sc'),
  ['-default','-'+standard,'-sounddev','dummy','-warp','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor','-8',disk],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 console.log('Owned VICE PID: '+child.pid);
 child.stderr.pipe(fs.createWriteStream('build/editor-session.log'));
 for(let i=0;i<300;i++){
  try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});break;}
  catch(e){socket.destroy();socket=null;await delay(100);}
 }
 if(!socket)throw Error('VICE monitor did not start');
 socket.on('error',()=>{});
 await command('x');await delay(1500);
 let basic=await screen();
 for(let i=0;i<60&&!basic.includes('ready.');i++){
  await command('x');await delay(250);basic=await screen();
 }
 assert(basic.includes('ready.'),'BASIC startup did not finish: '+basic.join('\n'));
 const loaded=await command('load "'+path.resolve('build/MCS-DOS.prg').replaceAll('\\','/')+'" 0');
 assert.deepEqual(Buffer.from(await memory(0x801,0x80c)),fs.readFileSync('build/MCS-DOS.prg').subarray(2,14),loaded);
 await command('> ba 08');await command('keybuf run\\x0d');await command('x');await delay(2500);
 let startup=await screen();
 for(let i=0;i<10&&!startup.some(s=>s==='A:>' || s==='8:>');i++){
  await command('x');await delay(500);startup=await screen();
 }
 assert(startup.some(s=>s==='A:>' || s==='8:>'),startup.join('\n'));
 const shell=await memory(0xd020,0xd021),vector=await memory(0x314,0x315),mask=await memory(0xd01a);
 const foreground=(await memory(0x286))[0]&15;
 function status(row,name,coords='01:01'){
  assert.equal(row,(' '+coords+'  '+name).padEnd(26)+'RUN/STOP:quit');
 }
 status((await keys('edit\\x0d'))[24],'Untitled');
 const base=(await memory(0x288))[0]*256;
 assert.equal((await memory(base+999))[0],160,'one reverse-space of right padding');
 assert.deepEqual(await memory(0xd020,0xd021),shell);
 assert.deepEqual(await memory(0x314,0x315),vector);assert.deepEqual(await memory(0xd01a),mask);
 assert((await memory(0xdbc0,0xdbe7)).every(v=>(v&15)===foreground),'status retains shell foreground');
 const points=[];
 for(const range of [[base+960,base+960],[base+963,base+963],[base+966,base+999],[0xdbc0,0xdbe7]].map(pair=>pair.map(n=>n.toString(16)).join(' '))){
  const result=await command('break store '+range);
  points.push(result.match(/(?:BREAK|WATCH):\s*(\d+)/i)[1]);
 }
 await keys('abcdefghijklmnopqrstuvwxyz');
 await keys('\\x13'+'\\x11'.repeat(23));
 await keys('last row');await keys('\\x1d'.repeat(31));
 status((await screen())[24],'Untitled','24:40');
 for(const p of points)await command('delete '+p);
 await command('screenshot "'+path.resolve('build/editor-status.png').replaceAll('\\','/')+'" 2');
 await keys('\\x03');assert.equal((await screen())[24],'Save changes (Y/N)?');
 await keys('n');
 status((await keys('edit abcdefghijklmnop\\x0d',1600))[24],'ABCDEFGHIJKLMNOP');
 await keys('saved document\\x03y',2500);
 let out=await keys('edit abcdefghijklmnop\\x0d',1600);
 assert.equal(out[0],'saved document');status(out[24],'ABCDEFGHIJKLMNOP');
 await keys('x'); // Make a change before exercising overwrite refusal.
 await keys('\\x03y',1500);assert.equal((await screen())[24],'Overwrite existing file (Y/N)?');
 await keys('n');
 await keys('edit\\x0d');await keys('hello\\x03y');
 out=await keys('bad,name\\x0d');assert(out.some(s=>s.includes('Invalid file name')));
 await keys('edit\\x0d');await keys('\\x03y');await keys('\\x03');
 assert.deepEqual(await memory(0xd020,0xd021),shell);
 assert.deepEqual(await memory(0x314,0x315),vector);assert.deepEqual(await memory(0xd01a),mask);
 out=await keys('edit /modern\\x0d');assert(out.some(s=>s.includes('Invalid switch')));
 out=await keys('help edit\\x0d');assert(!out.some(s=>s.includes('/MODERN')));
 console.log('PASS right-aligned status, Untitled and 16-character filename, fixed-cell watchpoints, shell colours/IRQ unchanged, save/reload and cancellation/error paths');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 socket?.destroy();
 if(child && child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}
 const closed=!child||child.exitCode!==null||child.signalCode!==null;
 console.log('Owned VICE closed: '+closed);
 if(!closed){console.error('Failed to close owned VICE PID '+child.pid);process.exitCode=1;}
});

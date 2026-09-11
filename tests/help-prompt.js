// Owned VICE instance: help pagination and startup-only PROMPT environment.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const standard=process.argv.includes('--ntsc')?'ntsc':'pal';
const root=path.resolve('.').replaceAll('\\','/');
const disk=root+'/build/test-help-prompt.d64';
const c1541=root+'/tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe';
const command=require('./vice-command')(()=>socket);
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

const base=root+'/build/test-help-prompt-base.d64';
const help=JSON.parse(fs.readFileSync('src/command-help.json','utf8'));
const petscii=s=>Buffer.from([...s.replace(/\r?\n/g,'\r')].map(c=>{
 const n=c.charCodeAt(0);return n===124?221:n===92?160:n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n;
}));
const pager='Press any key to continue . . .';
async function boot(autoexec=null,resource=null){
 await command('detach 8');fs.copyFileSync(base,disk);
 const args=['-attach',disk];
 if(autoexec!==null){fs.writeFileSync('build/help-prompt-autoexec',petscii(autoexec));args.push('-write','build/help-prompt-autoexec','autoexec.bat,s');}
 if(resource){fs.writeFileSync('build/help-prompt-resource',resource);args.push('-delete','commands.hlp','-write','build/help-prompt-resource','commands.hlp,s');}
 if(args.length>2)execFileSync(c1541,args,{stdio:'pipe'});
 await command(`attach "${disk}" 8`);
 await command(`load "${root}/build/MCS-DOS.prg" 0`);await command('> ba 08');
 return enter('run',3500);
}
function ready(rows){return rows.includes(pager) || /^(A:>|env-A:>|live>)$/.test(rows.filter(Boolean).at(-1));}
async function settled(rows){
 for(let i=0;i<80 && !ready(rows);i++){await command('x');await delay(250);rows=await screen();}
 assert(ready(rows),rows.join('\n'));return rows;
}
async function fresh(s){await enter('cls');return settled(await enter(s));}
async function screenshot(name){
 await command('x');await delay(120);await screen();
 await command(`screenshot "${root}/build/${name}.png" 2`);
}
function ends(rows,text){assert.equal(rows.filter(Boolean).at(-1),text,rows.join('\n'));}
async function run(){
 fs.copyFileSync('build/MCS-DOS.d64',base);
 // Fixtures always start clean, even when run after a personal dev build.
 const image=fs.readFileSync(base);let hasAuto=false;
 for(let i=0;i<image.length-16;i++)if(image.subarray(i,i+12).equals(Buffer.from('AUTOEXEC.BAT\xa0','latin1'))){hasAuto=true;break;}
 if(hasAuto)execFileSync(c1541,['-attach',base,'-delete','autoexec.bat'],{stdio:'pipe'});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(root+'/tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe',
  ['-default','-'+standard,'-sounddev','dummy','-warp','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],
  {windowsHide:true,stdio:'ignore'});
 for(let i=0;i<200;i++){
  try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}
  catch(e){socket.destroy();socket=null;await delay(100);}
 }
 assert(socket);socket.on('error',()=>{});
 await command('x');await delay(1500);
 for(let i=0;i<30;i++){if((await screen()).includes('ready.'))break;await command('x');await delay(300);}
 const auto='@echo off\nset driveids=dos\nset charset=cga\nset prompt=env-$p$c$g\nprompt batch$g\necho on\necho boot-complete\n';
 let rows=await boot(auto);ends(rows,'env-A:>');assert(rows.includes('batch>echo boot-complete'),rows.join('\n'));
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'charset initialization retained');
 ends(await enter('set prompt=later$g'),'env-A:>');
 assert((await fresh('set')).includes('PROMPT=later$g'));
 ends(await enter('prompt live$g'),'live>');ends(await enter('set prompt='),'live>');
 ends(await enter('reboot',4000),'env-A:>');await enter('exit');
 const long='x'.repeat(58)+'$p$c$g';assert.equal(long.length,64);
 rows=await boot('@echo off\nset driveids=dos\nset prompt='+long+'\n');
 assert(rows.join('').includes('x'.repeat(58)+'A:>'),rows.join('\n'));await enter('exit');
 ends(await boot('@echo off\nset prompt=discard\nset prompt=\nprompt direct$g\n'),'direct>');await enter('exit');
 ends(await boot(),'A:>');
 console.log('PASS PROMPT applied after AUTOEXEC, batch precedence, interactive SET storage only, command updates, REBOOT, 64-byte value, removed and absent values');

 rows=await fresh('help prompt');assert(rows.includes(pager),rows.join('\n'));
 assert(rows.includes('Changes the MCS-DOS command prompt.'),'help heading remains visible on first page');
 await screenshot('help-prompt-page1');
 rows=await settled(await keys('\\x20',1500));assert(!rows.includes(pager));assert(rows.includes('the prompt to the default setting.'),rows.join('\n'));ends(rows,'A:>');
 await screenshot('help-prompt-page2');
 rows=await fresh('prompt /?');assert(rows.includes(pager));rows=await settled(await keys('\\x03',1000));ends(rows,'A:>');assert(!rows.join('').includes('Insert MCS-DOS disk'));
 rows=await fresh('help ver');assert(rows.some(r=>r.includes('copyright information.')));ends(rows,'A:>');
 rows=await fresh('help prompt>hp');
 assert(!rows.includes(pager));ends(rows,'A:>');
 await command('detach 8');assert.deepEqual(read('hp'),petscii(help.PROMPT+'\n'),'redirected PROMPT help is exact');
 await command(`attach "${disk}" 8`);await enter('exit');
 console.log('PASS real PROMPT help first/last pages, /? form, RUN/STOP cancellation, subsequent help and exact unpaginated redirection');

 const commands=[...fs.readFileSync('src/mcsdos.c','utf8').match(/static const char \* const commands\[\]=\{([\s\S]*?)\};/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 const topic=commands.indexOf('PROMPT');assert(topic>=0);
 const original=fs.readFileSync('build/COMMANDS.HLP');let offset=5;
 for(let i=0;i<topic;i++)offset=original.indexOf(0,offset)+1;
 const after=original.indexOf(0,offset)+1;
 // Replace PROMPT regardless of subsequently added topics. Cross read boundaries,
 // has blank lines, and needs two pauses due to automatic 40-column wrapping.
 const body='begin\n\n'+'W'.repeat(40*44)+'\nend';
 await boot(null,Buffer.concat([original.subarray(0,offset),petscii(body),Buffer.from([0]),original.subarray(after)]));
 rows=await fresh('help prompt');assert(rows.includes('begin'),rows.join('\n'));let pages=0;
 while(rows.includes(pager)){assert(++pages<=3);rows=await settled(await keys('\\x20',1000));}
 assert.equal(pages,2);assert(rows.includes('end'));ends(rows,'A:>');
 rows=await fresh('help prompt');assert(rows.includes(pager));await keys('\\x03',1000);
 ends(await fresh('help cls'),'A:>');await enter('exit');
 console.log('PASS wrapped/blank rows across read boundaries, multiple pages, page-counter reset and cleanup');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 socket?.destroy();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}
});

// Owns VICE and disposable images only. Run after build.ps1 -Release.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const root=path.resolve('.').replaceAll('\\','/'),bin=root+'/tools/vice/GTK3VICE-3.10-win64/bin/';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const command=require('./vice-command')(()=>socket);
async function memory(a,b){
 const out=await command(`m ${a.toString(16)} ${b.toString(16)}`),bytes=[];
 for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}
 assert.equal(bytes.length,b-a+1,out);return bytes;
}
async function screen(){
 const base=(await memory(0x288,0x288))[0]*256;
 await command('bank ram');const bytes=await memory(base,base+999);await command('bank cpu');
 return Array.from({length:25},(_,i)=>bytes.slice(i*40,i*40+40).map(v=>{v&=127;return v>=1&&v<=26?String.fromCharCode(v+96):v>=65&&v<=90?String.fromCharCode(v):String.fromCharCode(v);}).join('').trimEnd()).join('\n');
}
async function enter(s,ms=500){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}
async function check(cmd,text,ms=500){
 await enter('cls');let out=await enter(cmd,ms);
 const matches=()=>text==='8:>'?out.trimEnd().endsWith(text):out.includes(text);
 for(let i=0;i<80&&!matches();i++){await command('x');await delay(1000);out=await screen();}
 assert(matches(),cmd+'\n'+out);console.log('PASS '+cmd+' => '+text);return out;
}
function image(file,type){execFileSync(bin+'c1541.exe',['-format','compat,ct',type,file],{stdio:'pipe'});}
function files(file){
 const b=fs.readFileSync(file),d81=b.length===819200,entries=new Map();
 function offset(t,s){let n=0;for(let i=1;i<t;i++){const k=(i-1)%35+1;n+=d81?40:k<=17?21:k<=24?19:k<=30?18:17;}return(n+s)*256;}
 let t=d81?40:18,s=d81?3:1;
 while(t){const o=offset(t,s);for(let i=0;i<256;i+=32){const e=o+i;if(!(b[e+2]&7))continue;
  const name=b.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'');let tr=b[e+3],se=b[e+4];const data=[],tracks=[],seen=new Set();
  while(tr){const p=offset(tr,se);assert(!seen.has(p));seen.add(p);tracks.push(tr);data.push(b.subarray(p+2,p+(b[p]?256:b[p+1]+1)));tr=b[p];se=b[p+1];}
  entries.set(name,{data:Buffer.concat(data),tracks,type:b[e+2],length:b[e+23]});
 }t=b[o];s=b[o+1];}return entries;
}
async function start(type,source,target,other=type){
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(bin+'x64sc.exe',['-default','-sounddev','dummy','-speed','1000','-warp','-drive8type',String(type),'-drive9type',String(other),'-8',source,'-9',target,'-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>fs.appendFileSync('build/compat-vice-'+type+'.log',d));
 child.stderr.on('data',d=>fs.appendFileSync('build/compat-vice-'+type+'.log',d));
 for(let i=0;i<300;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}catch(e){socket.destroy();socket=null;await delay(100);}}
 assert(socket,'VICE did not start');socket.on('error',()=>{});
 await command('x');await delay(1500);
 if(process.argv.includes('--rel')) {
  for(const line of ['new','10 open 15,8,15:print#15,"u0>m1"','20 open 2,8,2,"records,l,"+chr$(100)','30 for r=1 to 7','40 print#15,"p"+chr$(98)+chr$(r)+chr$(0)+chr$(1)','50 a$="":for i=1 to 100','60 a$=a$+chr$((r*37+i)and 255)','70 next i:print#2,a$;:next r','80 close 2:close 15']) await enter(line,100);
  await enter('run',5000);
 }
 await command('load "'+root+'/build/MCS-DOS.prg" 0');await command('> ba 08');await enter('run',4000);
}
function stop(){socket?.destroy();if(child&&child.exitCode===null)child.kill();}
async function run(){
 for(const type of (process.argv[2]?[Number(process.argv[2])]:[1541,1571,1581])){
  const ext=type===1541||process.argv.includes('--single')?'d64':type===1571?'d71':'d81',mode=process.argv.find(a=>a.startsWith('--'))||'basic',source=root+'/build/compat-'+mode+'-source.'+ext,target=root+'/build/compat-'+mode+'-target.'+ext;
  console.log('Preparing '+type+' '+mode);image(source,ext);image(target,ext);
  const marked=fs.readFileSync(source);marked.fill(0x5a,marked.length-32);fs.writeFileSync(source,marked);
  if(process.argv.includes('--badformat')){marked[357*256+3]=128;fs.writeFileSync(source,marked);}
  if(process.argv.includes('--large')) {
   const payload=root+'/build/compat-payload';fs.writeFileSync(payload,'last file\r');
   const args=['-attach',source];
   for(let i=295;i>=0;i--)args.push('-write',payload,'f'+String(i).padStart(3,'0')+',s');
   execFileSync(bin+'c1541.exe',args,{stdio:'pipe'});
  }
  if(process.argv.includes('--rel')&&type===1571) {
   fs.writeFileSync('build/compat-filler',Buffer.alloc(175000,0x55));
   execFileSync(bin+'c1541.exe',['-attach',source,'-write',root+'/build/compat-filler','filler,s'],{stdio:'pipe'});
  }
  try{
   const mismatch=process.argv.includes('--mismatch');
   let otherTarget=target;
   if(mismatch){otherTarget=root+'/build/compat-mismatch.d64';image(otherTarget,'d64');}
   const before=fs.readFileSync(otherTarget);
   console.log('Starting VICE '+type+' '+mode);await start(type,source,otherTarget,mismatch?1541:type);
   if(mismatch){
    await check('diskcopy 8: 9:','Incompatible drive type');await command('detach 9');
    assert.deepEqual(fs.readFileSync(otherTarget),before);console.log('PASS incompatible destination unchanged');continue;
   }
   if(process.argv.includes('--badformat')){
    await check('diskcopy 8: 9:','Unsupported disk format');await command('detach 9');
    assert.deepEqual(fs.readFileSync(target),before);console.log('PASS invalid source leaves destination unchanged');continue;
   }
   if(process.argv.includes('--large')){
    await command('f c800 c8ff a5');
    // Reverse directory order puts F000 at index 295, beyond both old limits.
    await check('type f000','LAST FILE');
    await enter('cls');await command('keybuf type f000');await command('x');await delay(500);
    let completed='';
    for(let i=0;i<5&&!completed.includes('"F000"');i++){
     await command('> 028d 02');await command('x');await delay(700);
     await command('> 028d 00');await command('x');await delay(150);completed=await screen();
    }
    assert(completed.includes('"F000"'),'completion at index 295\n'+completed);
    await enter('');
    await check('dir f00* /o','10 File(s)');
    await check('chkdsk /s','296 files');
    await check('copy f000* 9:','1 file(s) copied.',3000);
    await check('dir /b /o >9:listing','8:>',5000);
    assert((await memory(0xc800,0xc8ff)).every(b=>b===0xa5),'256-byte stack margin');
    await command('detach 9');
    const lines=files(target).get('LISTING').data.toString('latin1').trim().split(/\r+/);
    assert.equal(files(target).get('F000').data.toString(),'last file\r');
    assert.deepEqual(lines,Array.from({length:296},(_,i)=>'\xc6'+String(i).padStart(3,'0')));
    console.log('PASS all 296 sorted entries and lookup at index 295');continue;
   }
   if(process.argv.includes('--rel')){
    await check('copy records same','1 file(s) copied.',3000);
    await check('copy records 9:across','1 file(s) copied.',3000);
    await command('detach 8');await command('detach 9');
    const original=files(source).get('RECORDS');if(type===1571)assert(original.tracks.some(t=>t>35),'source must use side two');
    for(const [file,name] of [[source,'SAME'],[target,'ACROSS']]){
     const copy=files(file).get(name),data=copy.data;
     assert.equal(copy.type,0x84);assert.equal(copy.length,100);
     const expected=Buffer.from(Array.from({length:700},(_,i)=>((Math.floor(i/100)+1)*37+i%100+1)&255));
     assert.deepEqual(data,expected);
    }
    console.log('PASS binary REL records, same-drive and cross-drive');continue;
   }
   if(process.argv.includes('--format')){
    await check('format 8:','Proceed with format');
    await command('keybuf y');await command('x');await delay(500);
    await enter('native');let out=await enter('nf',10000);
    for(let i=0;i<30&&!out.includes('Format complete.');i++){await command('x');await delay(5000);out=await screen();}
    assert(out.includes('Format complete.'),out);
    await check('chkdsk /s',type===1541?'664':type===1571?'1328':'3160');
    console.log('PASS native-capacity format');continue;
   }
   if(!process.argv.includes('--copyonly')&&!process.argv.includes('--single')){
   await check('vol','Disk ID is CT');
   await check('echo sample > sample','8:>');
   await check('type sample','sample');
   await check('copy sample 9:sample','1 file(s) copied.');
   await check('type 9:sample','sample');
   await check('label renamed','Volume label changed.');
   await check('diskid xy','Disk ID changed.');
   await check('vol','Disk ID is XY');
   await check('attrib +r sample','8:>');
   await check('attrib sample','R    SAMPLE');
   await check('attrib -r sample','8:>');
   await check('chkdsk /v','Disk validation complete.',5000);
   }
   await check('diskcopy 8: 9:','Proceed with disk copy');
   let out=await enter('y',1000);
   for(let i=0;i<180&&!out.includes('Copy complete.');i++){await command('x');await delay(10000);out=await screen();console.log(out.split('\n').filter(s=>s.includes('track')||s.includes('copy')||s.includes('error')).slice(-2).join('\n'));if(out.includes('not completed'))break;}
   assert(out.includes('Copy complete.'),out);
   await command('detach 8');await command('detach 9');
   assert.deepEqual(fs.readFileSync(target),fs.readFileSync(source),'whole-disk bytes '+type);
   console.log('PASS '+type+' exact whole-disk copy');
  }finally{stop();await delay(400);}
 }
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1}).finally(stop);
module.exports={files};

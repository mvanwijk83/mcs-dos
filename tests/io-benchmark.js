// Compare baseline and optimized PRGs with identical disposable disks in VICE.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {delay}=require('../scripts/monitor');
const net=require('net');let socket;
async function command(text){
 if(!socket){socket=net.connect(6510,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});}
 return new Promise(resolve=>{let out='',timer;const done=()=>{socket.off('data',data);resolve(out);};const data=d=>{out+=d;clearTimeout(timer);timer=setTimeout(done,100);};socket.on('data',data);timer=setTimeout(done,700);socket.write(text+'\n');});
}
async function screen(){const raw=await command('m 0400 07e7');const bytes=[];for(const line of raw.split('\n')){const m=line.match(/>C:([0-9a-f]{4})  (.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[0-9a-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}const rows=[];for(let i=0;i<1000;i+=40)rows.push(bytes.slice(i,i+40).map(v=>{v&=127;return v>=1&&v<=26?String.fromCharCode(v+96):v>=65&&v<=90?String.fromCharCode(v):v===0?'@':String.fromCharCode(v);}).join('').trimEnd());return rows.join('\n').trimEnd();}
const c1541='tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe';
function extract(path,name){
 const b=fs.readFileSync(path);function offset(t,s){assert(t>=1&&t<=35);let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return(n+s)*256;}
 let t=18,se=1;while(t){const o=offset(t,se);for(let j=0;j<8;j++){const e=o+j*32;if(!b[e+2])continue;const n=b.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'');if(n.toUpperCase()!==name.toUpperCase())continue;let tr=b[e+3],sc=b[e+4];const chunks=[],seen=new Set();while(tr){const a=offset(tr,sc);assert(!seen.has(a));seen.add(a);chunks.push(b.subarray(a+2,a+(b[a]?256:b[a+1]+1)));tr=b[a];sc=b[a+1];}return Buffer.concat(chunks);}t=b[o];se=b[o+1];}throw Error('Missing '+name);
}
function disk(args){execFileSync(c1541,args,{stdio:'pipe'});}
function addr(lbl,name){return fs.readFileSync(lbl,'utf8').match(new RegExp('al ([0-9A-F]+) \\.'+name+'\\r?\\n'))[1];}
async function keys(s,ms=500){await command('keybuf '+s);await command('x');await delay(ms);}
async function measured(s,pc){
 const res=await command('break exec '+pc+' if A == $3e');
 const id=res.match(/BREAK:\s*(\d+)/i)?.[1];assert(id,res);
 await command('stopwatch reset');if(s)await command('keybuf '+s);await command('x');
 for(let i=0;i<600;i++){
  await delay(500);const r=await command('r');
  if(new RegExp('\\b'+pc.replace(/^00/,'')+'\\b','i').test(r)){
   const sw=await command('stopwatch');await command('delete '+id);
   await command('x');await delay(100);
   console.log(sw.trim());return Number(sw.match(/(?:Stopwatch:|counter:)\s*(\d+)/i)?.[1]||sw.match(/(\d+) cycles/)?.[1]);
  }
  if(i%20===19) console.log('Progress '+s+': '+(await screen()).split('\n').slice(-5).join(' | '));
  await command('x');
 }
 throw Error('Timeout '+s+'\n'+await screen());
}
(async()=>{
 await command('delete');await command('warp on');await command('resourceset "Drive9Type" "1541"');
 fs.writeFileSync('build/io-colors',Buffer.from([0,0,3]));
 fs.writeFileSync('build/io-editor',Buffer.from(('A'.repeat(39)+'\r').repeat(24)));
 fs.writeFileSync('build/io-large',Buffer.from(Array.from({length:8192},(_,i)=>i&255)));
 const quick=process.argv.includes('--quick');
 const results=quick?JSON.parse(fs.readFileSync('build/io-benchmark.json','utf8')):{};
 for(const variant of (quick?['MCS-DOS']:['baseline-io','MCS-DOS'])){
  await keys('exit\\x0d');await command('detach 8');await command('detach 9');
  const src='build/test-io-'+variant+'.d64',dst='build/test-io-target-'+variant+'.d64';
  fs.copyFileSync('build/baseline-io.d64',src);
  disk(['-attach',src,'-write','build/io-colors','mcs-dos.cfg,s','-write','build/io-editor','fulltext,s','-write','build/io-large','payload,s']);
  disk(['-format','target,tt','d64',dst]);
  await command('attach "C:/dev/MCS-DOS/'+src+'" 8');await command('attach "C:/dev/MCS-DOS/'+dst+'" 9');
  await command('load "C:/dev/MCS-DOS/build/'+variant+'.prg" 0');await command('> ba 08');
  const pc=addr('build/'+(variant==='MCS-DOS'?'mcsdos':variant)+'.lbl','_cputc');
  const row=results[variant]={...results[variant]};
  row.startup=await measured('run\\x0d',pc);
  await keys('edit fulltext\\x0d',2000);assert((await screen()).toLowerCase().includes('aaaaaaaa'));
  row.editorSave=await measured('\\x03yy',pc);assert((await screen()).trim()==='8:>');
  row.crossCopy=await measured('copy payload 9:payload\\x0d',pc);assert((await screen()).includes('1 file(s) copied.'));
  await command('detach 9');
  assert.deepEqual(extract(dst,'payload'),fs.readFileSync('build/io-large'));
  await command('attach "C:/dev/MCS-DOS/'+dst+'" 9');
  fs.writeFileSync('build/io-benchmark-partial.json',JSON.stringify(results,null,2));
  if(!quick) {
    row.diskcopy=await measured('diskcopy 8: 9:\\x0dy',pc);assert((await screen()).includes('Copy complete.'));
  }
  await command('detach 8');await command('detach 9');
  if(!quick) assert.deepEqual(fs.readFileSync(src),fs.readFileSync(dst));
  assert.deepEqual(extract(src,'fulltext'),fs.readFileSync('build/io-editor'));
  console.log('PASS byte-exact '+(quick?'editor, cross-copy':'editor, cross-copy, disk-copy')+': '+variant, row);
 }
 fs.writeFileSync('build/io-benchmark.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>socket?.destroy());


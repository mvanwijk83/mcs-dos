// Owned VICE instance; test both font contents and actual relocated display.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,socket;
const standard=process.argv.includes('--ntsc')?'ntsc':'pal';
const root=path.resolve('.').replaceAll('\\','/');
const disk=root+'/build/test-charset.d64';
const c1541=root+'/tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe';
const rom=fs.readFileSync('tools/vice/GTK3VICE-3.10-win64/C64/chargen-901225-01.bin');
const external=Buffer.from([65,96,66,32,160,13]);
function defaultfont(){
 const font=Buffer.from(rom.subarray(2048));
 for(let y=0;y<8;y++){font[96*8+y]=rom[77*8+y];font[224*8+y]=rom[77*8+y]^255;}
 return font;
}
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
function fixture(font,autoexec='@echo off\rset charset= cga \recho font-ready\r',fontname='cga'){
 fs.copyFileSync('build/MCS-DOS.d64',disk);
 const args=['-attach',disk,'-write','build/DEMO.prg','demo'];
 fs.writeFileSync('build/charset-external',external);
 args.push('-write','build/charset-external','external,s');
 if(font!==undefined){
  args.push('-delete','cga.cpi');
  if(['amiga','atarist'].includes(fontname))args.push('-delete',fontname+'.cpi');
  if(font!==null){fs.writeFileSync('build/charset-fixture',font);args.push('-write','build/charset-fixture',fontname+'.cpi,s')}
 }
 if(autoexec!==null){
  fs.writeFileSync('build/charset-autoexec',Buffer.from(autoexec).map(c=>c>=97&&c<=122?c-32:c));
  args.push('-write','build/charset-autoexec','autoexec.bat,s');
 }
 execFileSync(c1541,args,{stdio:'pipe'});
}
async function boot(font,autoexec,fontname){
 await command('detach 8');fixture(font,autoexec,fontname);
 await command(`attach "${disk}" 8`);
 const loaded=await command(`load "${root}/build/MCS-DOS.prg" 0`);
 assert.deepEqual(Buffer.from(await memory(0x801,0x80c,true)),fs.readFileSync('build/MCS-DOS.prg').subarray(2,14),loaded);
 await command('> ba 08');
 let rows=await enter('run',3000);
 for(let i=0;i<25&&!rows.some(s=>/^[AB]:>$/.test(s));i++){
  await command('x');await delay(500);rows=await screen();
 }
 if(!rows.some(s=>/^[AB]:>$/.test(s)))console.log('CPU',await command('r'),'ZP',await command('m 0000 009f'));
 assert(rows.some(s=>/^[AB]:>$/.test(s)),rows.join('\n'));return rows;
}
async function backslashscreen(name){
 await enter('prompt $h M m $h');await enter('cls');
 const bytes=Buffer.from(await memory(0xe000,0xe3e7,true));
 assert(bytes.includes(Buffer.from([96,32,77,32,13,32,96])),name+' backslash and both M cases');
 await command(`screenshot "${root}/build/backslash-${name.toLowerCase()}.png" 2`);
 await enter('prompt');
}
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

async function externaldisplay(){
 await enter('cls');await enter('type external',2000);
 assert(Buffer.from(await memory(0xe000,0xe3e7,true)).includes(Buffer.from([1,32,2,32,96])),'TYPE normalizes byte 96 only on screen');
 await enter('type external>roundtrip',2500);
 await enter('edit external',2000);
 assert.deepEqual(await memory(0xe000,0xe004,true),[1,32,2,32,96],'EDIT display');
 // Force a line redraw, then edit A while preserving bytes 96 and 160.
 await keys('\\x94\\x1d\\x14x');
 assert.deepEqual(await memory(0xe000,0xe004,true),[24,32,2,32,96],'EDIT redraw');
 await keys('\\x03y',500);await keys('y',2500);
 await enter('exit');await command('detach 8');
 for(const [name,expected] of [['roundtrip',external],['external',Buffer.from([88,96,66,32,160,13])]]){
  assert.deepEqual(read(name),expected,name+' retained bytes 96 and 160');
 }
 console.log('PASS external byte 96 screen normalization, Shift-SPACE backslash, EDIT redraw/save and byte-exact redirected TYPE');
}
async function namedsets(){
 // Renamed test payloads, not authentic Amiga/Atari font assets.
 const patch=fs.readFileSync('build/CGA.CPI');
 for(const name of ['cga','amiga500','atarist','amiga 500','a-12345678_z']){
  const rows=await boot(patch,'@echo off\rset charset=  '+name.toUpperCase()+'  \r9:\r',name);
  assert.equal((await memory(0xd018))[0]&0xfe,0x8a,name+'\n'+rows.join('\n'));
  assert.deepEqual(Buffer.from(await memory(0xe800,0xe807,true)),patch.subarray(7,15),name+' glyph loaded');
  await enter('exit');
 }
 let rows=await boot(null,'@echo off\rset charset=missing\r');
 assert(rows.some(s=>s.includes('Cannot load MISSING.CPI')),rows.join('\n'));
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a);
 await enter('set charset=amiga500');
 for(const value of ['1234567890123','amiga*','amiga?','9:amiga','amiga,s','amiga/name','amiga.cpi']){
  rows=await enter('set charset='+value);assert(rows.some(s=>s.includes('Invalid value')),value);
 }
 await enter('cls');rows=await enter('set');assert(rows.includes('CHARSET=amiga500'),rows.join('\n'));
 await enter('exit');
 await boot(patch,'@echo off\rset charset= c64 \r','c64');
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'C64 loads C64.CPI like any other name');
 await enter('exit');
 rows=await boot(null,'@echo off\rset charset=c64\r');
 assert(rows.some(s=>s.includes('Cannot load C64.CPI')),rows.join('\n'));
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'missing C64.CPI reports an error and falls back');
 await enter('exit');
 await boot(null,'@echo off\rset charset=   \r');
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'blank setting');
 await enter('exit');
 console.log('PASS arbitrary names, case/space normalization, 12-character limit, startup disk, named errors, invalid-name rejection, ordinary C64 filename and blank setting');
}
async function fontassets(){
 for(const [name,source,bank,backslash] of [
  ['AMIGA','amiga-ks10-topaz-08.yaff'],['ATARIST','atari-st-8x8.yaff'],
  ['PET','pet.yaff',128,156],
  ['ZXSPECTRUM','zx-spectrum.yaff']
 ]){
  const text=fs.readFileSync('assets/fonts/'+source,'utf8');
  const expected=Buffer.from(fs.readFileSync('tools/vice/GTK3VICE-3.10-win64/C64/chargen-901225-01.bin').subarray(2048));
  let replaced=0;
  for(let code=0;code<128;code++){
   const ascii=code===0?64:code<=26?code+96:code===27?91:code===29?93:code===96?92:
    (code>=32&&code<=63)||(code>=65&&code<=90)?code:null;
   if(ascii===null)continue;
   const index=bank===undefined?ascii:code===96?backslash:bank+code;
   const block=text.match(new RegExp('^0x0*'+index.toString(16)+':\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\r?\\n)','mi'));
   assert(block,name+' source character '+index);
   const rows=block[1].split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[.@]{8}$/.test(s));
   assert.equal(rows.length,8);
   rows.forEach((row,y)=>{
    const bits=parseInt(row.replaceAll('.','0').replaceAll('@','1'),2);
    expected[code*8+y]=bits;expected[(code+128)*8+y]=bits^255;
   });
   replaced++;
  }
  assert.equal(replaced,88);
  await boot(undefined,'@echo off\rset charset='+name+'\r');
  assert.equal((await memory(0xd018))[0]&0xfe,0x8a,name);
  assert.deepEqual(Buffer.from(await memory(0xe800,0xefff,true)),expected,name+' source glyphs, inverses and preserved ROM graphics');
  await backslashscreen(name);
  await enter('cls');await enter('echo '+name);
  await enter('echo ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await enter('echo abcdefghijklmnopqrstuvwxyz');
  await enter('echo 0123456789 !? [] @');
  await command(`screenshot "${root}/build/charset-${name.toLowerCase()}.png" 2`);
  await enter('exit');
  assert.equal((await memory(0xd018))[0]&0xfe,0x14);
  console.log('PASS '+name+': all 88 YAFF glyphs, reverse versions, preserved ROM graphics and exit restoration');
 }
}
async function run(){
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));
 child=spawn(root+'/tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe',
  ['-default','-'+standard,'-sounddev','dummy','-warp','-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],
  {windowsHide:true,stdio:['ignore','ignore','pipe']});
 child.stderr.pipe(fs.createWriteStream('build/charset-'+standard+'.log'));
 for(let i=0;i<300;i++){
  try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break}
  catch(e){socket.destroy();socket=null;await delay(100)}
 }
 assert(socket,'VICE monitor did not start');socket.on('error',()=>{});
 await command('x');await delay(1500);
 for(let i=0;i<30;i++){
  if((await screen()).some(s=>s==='ready.'))break;
  await command('x');await delay(300);
 }
 assert((await screen()).some(s=>s==='ready.'),'BASIC startup did not complete');
 if(process.argv.includes('--assets-only')){await fontassets();return}
 if(process.argv.includes('--names-only')){await namedsets();return}
 let rows=await boot();assert(rows.includes('font-ready'),rows.join('\n'));
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a);
 assert.equal((await memory(0xdd00))[0]&3,0);
 const patch=fs.readFileSync('build/CGA.CPI');
 const expected=Buffer.from(fs.readFileSync('tools/vice/GTK3VICE-3.10-win64/C64/chargen-901225-01.bin').subarray(2048));
 for(let i=0;i<patch[5];i++){
  const at=6+i*9,code=patch[at];
  for(let row=0;row<8;row++){
   expected[code*8+row]=patch[at+1+row];expected[(code+128)*8+row]=patch[at+1+row]^255;
  }
 }
 assert.deepEqual(Buffer.from(await memory(0xe800,0xefff,true)),expected,'whole font, preserved graphics and reverse glyphs');
 // Independently read CGA's source atlas character 92, not its generated CPI.
 const cga=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',
  "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $atlas=[Drawing.Bitmap]::new((Resolve-Path 'cga.png').Path); $rows=@(); for($y=0;$y -lt 8;$y++){ $bits=0; for($x=0;$x -lt 8;$x++){ if($atlas.GetPixel(224+$x,16+$y).R -eq 0){$bits=$bits -bor (128 -shr $x)} }; $rows+= $bits }; $atlas.Dispose(); ConvertTo-Json -Compress -InputObject $rows"
 ],{encoding:'utf8'}));
 assert.deepEqual(await memory(0xeb00,0xeb07,true),cga,'CGA source backslash');
 await backslashscreen('CGA');
 assert.equal((await memory(0xe3f8,0xe3f8,true))[0],144);
 assert.equal((await memory(0xe415,0xe415,true))[0],255);
 await enter('set charset=c64');assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'SET is startup-only');
 await enter('cls');
 for(let i=0;i<18;i++)await enter('echo line'+String(i).padStart(2,'0'));
 rows=await screen();assert(rows.includes('line17')&&rows.includes('line12'),rows.join('\n'));
 assert(!rows.includes('line00'));
 rows=await enter('edit');assert.equal(rows[24],('  1: 1  Untitled').padEnd(26)+'RUN/STOP:quit');
 rows=await keys('abc\\x11');assert(rows[24].startsWith('  2: 4'),rows[24]);
 assert((await memory(0xe3c0,0xe3e7,true)).every(v=>v&128));
 await keys('\\x03n');
 await enter('cls');await enter('echo Abc 0123 !? [] @');
 await command(`screenshot "${root}/build/charset-${standard}.png" 2`);
 await enter('reboot',4000);assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'AUTOEXEC reapplied');
 await enter('exit');assert.equal((await memory(0x288))[0],4);
 assert.equal((await memory(0xd018))[0]&0xfe,0x14);assert.equal((await memory(0xdd00))[0]&3,3);
 console.log('PASS font bytes, preserved graphics/reverse, relocated screen, caret, scrolling, EDIT, startup-only SET, REBOOT and EXIT');
 const bad=Buffer.from(patch);bad[bad.length-1]^=1;
 const header=Buffer.from(patch);header[4]=2;
 const graphics=Buffer.from(patch);graphics[6]=28;
 for(const [label,font] of [['missing',null],['truncated',patch.subarray(0,30)],['checksum',bad],['version',header],['graphics slot',graphics],['trailing',Buffer.concat([patch,Buffer.from([0])])]]){
  rows=await boot(font);assert(rows.some(s=>s.includes('Cannot load CGA.CPI')),label+': '+rows.join('\n'));
  assert.equal((await memory(0xd018))[0]&0xfe,0x8a,label);
  assert.deepEqual(Buffer.from(await memory(0xe800,0xefff,true)),defaultfont(),label+' leaves default font intact');
  await enter('exit');
 }
 await boot(undefined,null);assert.equal((await memory(0xd018))[0]&0xfe,0x8a);
 assert.deepEqual(Buffer.from(await memory(0xe800,0xefff,true)),defaultfont(),'default ROM plus backslash and inverse');
 await backslashscreen('default');
 await enter('set charset=cga');assert.equal((await memory(0xd018))[0]&0xfe,0x8a);
 await enter('exit');
 console.log('PASS missing/corrupt fonts fall back; no AUTOEXEC keeps default');
 // Older 87-record fonts omit slot 96 and inherit the ROM fallback.
 const legacy=Buffer.concat([patch.subarray(0,patch.length-11),Buffer.alloc(2)]);
 legacy[5]--;let sum=0;for(const b of legacy.subarray(6,-2))sum+=b;
 legacy.writeUInt16LE(sum&65535,legacy.length-2);
 await boot(legacy);
 assert.deepEqual(await memory(0xeb00,0xeb07,true),[...rom.subarray(77*8,78*8)],'old CPI fallback');
 assert.deepEqual(await memory(0xef00,0xef07,true),[...rom.subarray(77*8,78*8)].map(b=>b^255),'old CPI inverse');
 await externaldisplay();
 await boot(undefined,'@echo off\rset charset=cga\r9:\r');
 assert.equal((await memory(0xd018))[0]&0xfe,0x8a,'font comes from startup device');
 rows=await enter('run 8:demo',4000);
 assert.equal((await memory(0x288))[0],4);assert.equal((await memory(0xd018))[0]&0xfe,0x14);
 assert(rows.join('\n').includes('hello from basic!'),rows.join('\n'));
 await command(`load "${root}/build/MCS-DOS.prg" 0`);await command('> ba 00');
 rows=await enter('run');assert(rows.includes(':>'));assert.equal((await memory(0xd018))[0]&0xfe,0x8a);
 await enter('exit');console.log('PASS startup-drive selection, PRG launch restoration and no-device startup');
 await namedsets();
 await fontassets();
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 socket?.destroy();if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)])}
});


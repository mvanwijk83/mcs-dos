// Uses only a disposable D64 and the local VICE monitor.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
async function keys(s,ms=350){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
async function enter(s,ms=1600){return keys(s+'\\x0d',ms);}
async function complete(){await command('> 028d 02');await command('x');await delay(700);await command('> 028d 00');await command('x');await delay(150);}
function offset(t,s){let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return (n+s)*256;}
(async()=>{
await enter('exit');await command('detach 8');
fs.copyFileSync('build/MCS-DOS.d64','build/test-petscii.d64');
for(const [name,text] of [['g1x','EXACT GRAPHIC'],['g1a','WRONG ORDINARY'],['g2x','DESTINATION']]){
 fs.writeFileSync('build/petscii-data',text+'\r');
 execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',['-attach','build/test-petscii.d64','-write','build/petscii-data',name+',s'],{stdio:'pipe'});
}
const disk=fs.readFileSync('build/test-petscii.d64');let t=18,s=1;
while(t){const base=offset(t,s);for(let i=0;i<8;i++){const p=base+i*32+5;if(disk.subarray(p,p+3).equals(Buffer.from('G1X')))disk[p+2]=0xc1;if(disk.subarray(p,p+3).equals(Buffer.from('G2X')))disk[p+2]=0xc2;}t=disk[base];s=disk[base+1];}
fs.writeFileSync('build/test-petscii.d64',disk);
await command('attach "C:/dev/MCS-DOS/build/test-petscii.d64" 8');
await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 08');await enter('run',3000);
await enter('cls');await keys('type g1');await complete();
let out=await enter('');assert(out.includes('exact graphic'),out);assert(!out.includes('wrong ordinary'),out);
// Refresh the cache, then recall the completed TYPE through history.
await enter('dir',3000);await keys('\\x91\\x91');out=await enter('');assert(out.includes('exact graphic'),out);
// Draft restoration preserves provenance too.
await keys('type g1');await complete();await keys('\\x91\\x11');out=await enter('');assert(out.includes('exact graphic'),out);
// Editing the completed graphic relinquishes provenance and selects G1A.
await enter('cls');await keys('type g1');await complete();await keys('\\x9d\\x14a');out=await enter('');assert(out.includes('wrong ordinary'),out);
// Appending an ordinary destination must preserve the completed source.
await keys('copy g1');await complete();out=await enter('\\x20copied',4000);assert(out.includes('1 file(s) copied.'),out);
await enter('cls');out=await enter('type copied');assert(out.includes('exact graphic'),out);
// Two independently completed operands, with an explicit drive prefix.
await keys('copy 8:g1');await complete();await keys('\\x208:g2');await complete();
out=await enter('');assert(out.includes('Overwrite existing file'),out);await keys('y',2500);
await enter('cls');await keys('type g2');await complete();out=await enter('');assert(out.includes('exact graphic'),out);
console.log('PASS exact PETSCII completion, cache refresh/history, draft, edited-name fallback, appended destination, and two completed drive-qualified operands');
})().catch(e=>{console.error(e);process.exitCode=1});

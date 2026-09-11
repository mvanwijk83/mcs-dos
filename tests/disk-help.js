// Start at BASIC with help-*.d64 detached; uses only disposable disks and VICE.
// --recovery resumes failure cases at a shell booted from drive 8 with fixtures.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
const root='C:/dev/MCS-DOS/';
const help=JSON.parse(fs.readFileSync('src/command-help.json','utf8'));
const names=Object.keys(help),file=fs.readFileSync('build/COMMANDS.HLP');
const petscii=s=>Buffer.from([...s].map(c=>{let n=c.charCodeAt(0);return n===124?0xdd:n===92?0xa0:n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n;}));
async function settled(){for(let i=0;i<80;i++){await command('x');await delay(200);const s=await screen();if(/(?:^|\n)(?:[0-9]+|[A-Z]):>$/.test(s))return s;}throw Error('Shell did not return: '+await screen());}
async function enter(s){await command('keybuf '+s+'\\x0d');return settled();}
async function fresh(s){await enter('cls');return enter(s);}
const insertPrompt='Insert MCS-DOS disk and press any key when ready';
async function insertion(cmd,count=1){
 await command('keybuf '+cmd);
 for(let i=0;i<80;i++){
  await command('x');await delay(200);const s=await screen();
  const compact=s.replace(/\s/g,'');
  if(compact.split(insertPrompt.replace(/\s/g,'')).length-1>=count)return s;
 }
 throw Error('No insertion prompt: '+await screen());
}
async function mount(name,dev=8){const result=await command('attach "'+root+'build/help-'+name+'.d64" '+dev);assert(!result.includes('Failed'),result);}
async function boot(device){await command('load "'+root+'build/MCS-DOS.prg" 0');await command('> ba '+device.toString(16).padStart(2,'0'));return enter('run');}
function disk(name,replacement){const p='build/help-'+name+'.d64';fs.copyFileSync('build/MCS-DOS.d64',p);if(replacement!==undefined){const args=['-attach',p,'-delete','commands.hlp'];if(replacement!==null){fs.writeFileSync('build/help-resource',replacement);args.push('-write','build/help-resource','commands.hlp,s');}execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',args,{stdio:'pipe'});}}
function files(p){const image=fs.readFileSync(p),result=new Map();function offset(t,s){let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return(n+s)*256;}let t=18,s=1;while(t){let o=offset(t,s);for(let i=0;i<8;i++){const e=o+32*i;if(!image[e+2])continue;const name=image.subarray(e+5,e+21).toString('latin1').replace(/\xa0+$/,'');let tr=image[e+3],se=image[e+4],parts=[];while(tr){const a=offset(tr,se);parts.push(image.subarray(a+2,a+(image[a]?256:image[a+1]+1)));tr=image[a];se=image[a+1];}result.set(name,Buffer.concat(parts));}t=image[o];s=image[o+1];}return result;}
(async()=>{
let s;
if(!process.argv.includes('--recovery')){
disk('good');disk('missing',null);let bad=Buffer.from(file);bad[3]=2;disk('version',bad);bad=Buffer.from(file);bad[4]--;disk('count',bad);disk('short',file.subarray(0,8));
await mount('good');await mount('missing',9);await boot(8);
assert((await fresh('help')).includes('For more information'));
for(let i=0;i<names.length;i++){
 const s=await enter('help '+names[i].toLowerCase()+' >h'+String(i).padStart(2,'0'));
 assert(!s.includes('Help unavailable'),s);
}
await command('detach 8');let output=files('build/help-good.d64');
for(let i=0;i<names.length;i++){
 const expected=petscii(help[names[i]].replace(/\n/g,'\r')+'\r'),actual=output.get('H'+String(i).padStart(2,'0'));
 assert(actual,names[i]);if(names[i]==='COLOR')assert.deepEqual(actual.subarray(0,expected.length),expected);else assert.deepEqual(actual,expected,names[i]);
}
assert.deepEqual(output.get('COMMANDS.HLP'),file);
console.log('PASS exact redirected text for all '+names.length+' help topics');
await mount('good');
for(const [cmd,fragment] of [['cls/?','Clears the screen.'],['echo /?','Displays messages'],['set /?','Displays, sets, or removes'],['help rename','Renames a file'],['version /?','copyright information']])assert((await fresh(cmd)).includes(fragment),cmd);
s=await fresh('color /?');assert(s.includes('Colors:'),s);assert(s.includes('0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15'),s);
await enter('9:');assert((await fresh('help cls')).includes('Clears the screen.'));
await enter('8:');
assert((await fresh('help cls >commands.hlp')).includes('Invalid destination'));
assert((await fresh('echo /? >>commands.hlp')).includes('Invalid destination'));
assert((await fresh('help cls')).includes('Clears the screen.'));
console.log('PASS /? forms, aliases, COLOR palette, startup-drive selection, source protection');
}
// VICE cannot attach the same writable image on two drives simultaneously.
await command('detach 9');
for(const fixture of ['missing','version','count','short']){
 await mount(fixture);await enter('cls');await insertion('help reboot\\x0d');
 await command('keybuf \\x03');await settled();
 assert((await fresh('help')).includes('For more information'));
 assert((await fresh('echo still-working')).includes('still-working'));
}
await mount('missing');s=await fresh('help cls >errors');assert(s.replace(/\s/g,'').includes('InsertMCS-DOSdiskbeforeredirectinghelp'),s);
await command('detach 8');const errorOutput=files('build/help-missing.d64').get('ERRORS');
// The drive may represent an unwritten SEQ file with a single CR.
assert(errorOutput.length<=1 && errorOutput.every(c=>c===13),errorOutput);
await mount('good');assert((await fresh('help cls')).includes('Clears the screen.'));
await mount('missing');await enter('cls');await insertion('help reboot\\x0d');
await insertion('x',2); // Retrying with the wrong disk asks again.
await mount('good');await command('keybuf x');s=await settled();
assert(s.includes('Reboots the environment.'),s); // Late topic restarts its scan.
console.log('PASS missing/version/count/truncated files, prompt cancellation, repeated retry, disk insertion, same-drive output protection');
await command('keybuf exit\\x0d');await command('x');await delay(400);await boot(0);
assert((await fresh('help cls')).includes('No disk selected'));
assert((await fresh('help')).includes('For more information'));
await enter('8:');assert((await fresh('help cls')).includes('Clears the screen.'));
// Exercise interruption during a slow sequential scan, then subsequent I/O.
await command('warp off');await command('keybuf help reboot\\x0d');await command('x');await delay(100);
await command('keybuf \\x03');await command('warp on');s=await settled();
assert(!s.includes('Reboots the environment.'),s);
assert(!s.includes('Help unavailable'),s);
assert((await fresh('help cls')).includes('Clears the screen.'));
console.log('PASS no-device startup fallback, cancellation and subsequent help');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await command('warp on');});

// Uses a disposable image and VICE monitor at localhost:6510.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=350){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}
async function reg(a){return parseInt((await command('m '+a+' '+a)).match(/>C:[0-9a-f]+\s+([0-9a-f]{2})/i)[1],16)&15;}
(async()=>{
fs.copyFileSync('build/MCS-DOS.d64','build/test-reboot.d64');
fs.writeFileSync('build/reboot-autoexec',Buffer.from('@echo off\rset boot=yes\rcolor /preset:2\recho startup-success\r').map(n=>n>=97&&n<=122?n-32:n));
fs.writeFileSync('build/reboot-batch',Buffer.from('reboot\recho should-not-run\r').map(n=>n>=97&&n<=122?n-32:n));
execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',['-attach','build/test-reboot.d64','-write','build/reboot-autoexec','autoexec.bat,s','-write','build/reboot-batch','restart.bat,s'],{stdio:'pipe'});
await command('attach "C:/dev/MCS-DOS/build/test-reboot.d64" 8');
await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 08');
assert((await enter('run',3000)).includes('startup-success'));
for(const [n,fg,bg,bd] of [[1,3,0,0],[2,15,0,0],[3,1,0,0],[4,5,0,0],[5,14,6,14]]){
 await enter('color /preset:'+n);assert.equal(await reg('0286'),fg);assert.equal(await reg('d021'),bg);assert.equal(await reg('d020'),bd);
}
assert((await enter('color /preset:6')).includes('Invalid scheme (use 1 to 5)'));
await enter('cls');let s=await enter('help color');for(const name of ['1  PC Classic 1','2  PC Classic 2','3  High-contrast','4  Terminal green','5  BASIC blue'])assert(s.includes(name),s);
await enter('cls');s=await enter('help reboot');assert(s.includes('Reboots the environment.'),s);
await enter('set transient=value');await enter('set driveids=dos');await enter('9:');
s=await enter('reboot',3000);assert(s.includes('startup-success')&&s.includes('8:>'),s);assert.equal(await reg('0286'),15);
await enter('cls');s=await enter('set');assert(s.includes('BOOT=yes')&&!s.includes('TRANSIENT=')&&!s.includes('DRIVEIDS='),s);
s=await enter('run restart.bat',3000);assert(s.includes('startup-success')&&!s.includes('should-not-run'),s);
await enter('exit');await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 00');await enter('run');await enter('set transient=value');await enter('color /preset:5');await enter('8:');
s=await enter('reboot');assert(s.includes('0:>')&&!s.includes('startup-success'),s);assert.equal(await reg('0286'),3);assert.equal(await reg('d021'),0);
await enter('cls');s=await enter('set');assert(!s.includes('TRANSIENT='),s);
console.log('PASS five presets, COLOR/REBOOT help, reboot state reset, original startup drive, AUTOEXEC rerun, batch cancellation, and no-device reboot');
})().catch(e=>{console.error(e);process.exitCode=1});

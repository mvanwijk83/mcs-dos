// Run against VICE's disposable environment test disk at localhost:6510.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=500){await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();}
(async()=>{
await enter('exit');await command('detach 8');
fs.writeFileSync('build/test-autoexec',Buffer.from('@echo off\rset driveids=dos\rset custom='+ 'z'.repeat(64)+'\rcolor /preset:5\recho startup-success\r').map(n=>n>=97&&n<=122?n-32:n));
execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',['-attach','build/test-environment.d64','-delete','autoexec.bat','-write','build/test-autoexec','autoexec.bat,s'],{stdio:'pipe'});
await command('attach "C:/dev/MCS-DOS/build/test-environment.d64" 8');
await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 08');
let s=await enter('run',3000);assert(s.includes('startup-success'),s);assert(s.includes('A:>'),s);assert(!s.includes('Select a display'));
await enter('cls');s=await enter('set');assert(s.includes('CUSTOM='),s);assert.equal((s.match(/z/g)||[]).length,64,s);
await enter('exit');await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 00');s=await enter('run');assert(s.includes('0:>'),s);assert(!s.includes('startup-success'),s);
await enter('cls');s=await enter('set');assert(!s.includes('CUSTOM='),s);assert(!s.includes('DRIVEIDS='),s);
console.log('PASS AUTOEXEC applies preferences and 64-character values; no-device boot uses empty environment and defaults');
})().catch(e=>{console.error(e);process.exitCode=1});

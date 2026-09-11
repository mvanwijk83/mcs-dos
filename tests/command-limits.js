// Run at a fresh shell prompt with the disposable environment disk mounted.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
async function keys(s,ms=200){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
async function enter(s){for(let i=0;i<s.length;i+=50)await keys(s.slice(i,i+50));return keys('\\x0d',1000);}
(async()=>{
await enter('reboot');
const longest='set abcdefghijklmnop='+ 'x'.repeat(64);
assert.equal(longest.length,85);
await enter(longest+'y'); // Interactive input ignores characters beyond 85.
await keys('\\x91\\x0d'); // Recall and execute the full-length history entry.
await enter('cls');let s=await enter('set');
assert(s.includes('ABCDEFGHIJKLMNOP='),s);
assert.equal((s.match(/x/g)||[]).length,64,s);
assert(!s.includes('y'),s);
assert((await enter('set abcdefghijklmnop='+ 'z'.repeat(63))).includes('8:>'));
assert((await enter('set abcdefghijklmnop='+ 'z'.repeat(64))).includes('8:>'));
assert((await enter('set short='+ 'z'.repeat(65))).includes('Invalid value'));
for(let i=0;i<11;i++)await enter('echo history'+String(i).padStart(2,'0'));
await keys('draft');
for(let i=10;i>=1;i--){s=await keys('\\x91');assert(s.endsWith('8:>echo history'+String(i).padStart(2,'0')),s);}
s=await keys('\\x91');assert(s.endsWith('8:>echo history01'),s);
for(let i=0;i<10;i++)s=await keys('\\x11');
assert(s.endsWith('8:>draft'),s);await keys('\\x03');
await command('detach 8');
fs.copyFileSync('build/MCS-DOS.d64','build/test-environment.d64');
fs.writeFileSync('build/limits-batch',Buffer.from('@echo off\r'+longest+'\r'+longest+'y\recho should-not-run\r').map(n=>n>=97&&n<=122?n-32:n));
execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',['-attach','build/test-environment.d64','-write','build/limits-batch','limits.bat,s'],{stdio:'pipe'});
await command('attach "C:/dev/MCS-DOS/build/test-environment.d64" 8');
await enter('dir'); // Refresh the directory cache after changing the disk externally.
await enter('cls');s=await enter('run limits.bat');
assert(s.includes('Batch command too long'),s);assert(!s.includes('should-not-run'),s);
await enter('cls');s=await enter('set');assert.equal((s.match(/x/g)||[]).length,64,s);
console.log('PASS 85-character input and recall, ten-entry history wrap/draft, 64-character SET values, and batch overflow rejection');
})().catch(e=>{console.error(e);process.exitCode=1});

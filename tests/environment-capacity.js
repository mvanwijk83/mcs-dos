// Dedicated capacity check: start VICE at BASIC; no disks are needed.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function waitFor(check){for(let i=0;i<60;i++){await command('x');await delay(100);const s=await screen();if(check(s))return s;}throw Error(await screen());}
async function enter(s){for(let i=0;i<s.length;i+=50){await command('keybuf '+s.slice(i,i+50));await command('x');await delay(100);}await command('keybuf \\x0d');return waitFor(s=>/(?:^|\n)(?:0)?:>$/.test(s));}
async function fresh(s){await enter('cls');return enter(s);}
(async()=>{
if(!process.argv.includes('--shell')){
await waitFor(s=>s.includes('ready.'));
await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 00');await enter('run');
}
for(let i=0;i<13;i++)await enter('set n'+String(i).padStart(2,'0')+'='+ 'x'.repeat(32));
// Thirteen 37-byte entries plus a 31-byte entry fill exactly 512 bytes.
assert(!(await fresh('set edge='+ 'z'.repeat(25))).includes('Environment full'));
assert((await fresh('set edge='+ 'z'.repeat(26))).includes('Environment full'));
assert((await fresh('set extra=x')).includes('Environment full'));
let s=await fresh('set');assert(s.includes('EDGE='+ 'z'.repeat(25)),s);
assert(!(await fresh('set n00='+ 'y'.repeat(32))).includes('Environment full'));
await enter('set edge=');
assert(!(await fresh('set edge='+ 'z'.repeat(25))).includes('Environment full'));
await enter('set edge=');assert(!(await fresh('set extra=ok')).includes('Environment full'));
assert((await fresh('set')).includes('EXTRA=ok'));
assert((await fresh('set short='+ 'q'.repeat(33))).includes('Invalid value'));
console.log('PASS exact 512-byte capacity, atomic rejected growth, full-buffer replacement, deletion/reuse, and 32-character value limit');
})().catch(e=>{console.error(e);process.exitCode=1});

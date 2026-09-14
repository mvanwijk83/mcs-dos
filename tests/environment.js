const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s){for(let i=0;i<s.length;i+=60){await command('keybuf '+s.slice(i,i+60));await command('x');await delay(180);}await command('keybuf \\x0d');await command('x');await delay(1000);return screen();}
async function fresh(s){await enter('cls');return enter(s);}
(async()=>{
assert(!(await screen()).includes('Select a display'));
await enter('set driveids= dos ');assert((await screen()).includes('A:>'));
await enter('9:');assert((await screen()).includes('B:>'));await enter('a:');
assert((await enter('set driveids=bad')).includes('Invalid value'));assert((await screen()).includes('A:>'));
await enter('set driveids=');assert((await screen()).includes('8:>'));
await enter('set thing= spaced text ');assert((await fresh('set')).includes('THING= spaced text'));
await enter('set thing=');assert(!(await fresh('set')).includes('THING='));
await enter('set dircmd=/b /o');let s=await fresh('dir');assert(!s.includes('Directory of'),s);
s=await fresh('dir /w');assert(s.includes('Directory of'),s);
assert((await enter('set dircmd=/bad')).includes('Invalid value'));
await enter('set abcdefgh='+ 'x'.repeat(32));s=await fresh('set');assert(s.includes('ABCDEFGH='),s);assert.equal((s.match(/x/g)||[]).length,32,s);
assert((await enter('set short='+ 'x'.repeat(33))).includes('Invalid value'));
assert((await enter('set abcdefghi=x')).includes('Invalid value'));
assert((await enter('set charset="C64"')).includes('Invalid value'));
await enter('set charset= c64 ');
assert((await enter('color /preset:5')).includes('Bad command or file name'));
s=await fresh('help set');assert(s.includes('Displays, sets, or removes MCS-DOS'),s);
s=await fresh('set /?');assert(s.includes('Displays, sets, or removes MCS-DOS'),s);
for(let i=0;i<16;i++) await enter('set v'+i+'='+ 'y'.repeat(32));assert((await screen()).includes('Environment full'));
await enter('reboot');
for(let i=0;i<13;i++) await enter('set n'+String(i).padStart(2,'0')+'='+ 'y'.repeat(32));
// 13 * (3 + 1 + 32 + 1) + (4 + 1 + 25 + 1) = 512 bytes.
assert(!(await fresh('set edge='+ 'z'.repeat(25))).includes('Environment full'));
assert((await fresh('set edge='+ 'z'.repeat(26))).includes('Environment full'));
assert((await fresh('set extra=x')).includes('Environment full'));
await enter('set edge=');
assert(!(await fresh('set extra=x')).includes('Environment full'));
console.log('PASS environment validation, 64-character input and 32-character values, capacity, deletion, drive aliases, DIR defaults, colors and SET help');
})().catch(e=>{console.error(e);process.exitCode=1});


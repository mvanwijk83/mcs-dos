// Use VICE started with -drive9type 1541 and fixtures from tests/disk-help.js.
// --basic starts at BASIC; otherwise starts at the shell prompt.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function waitFor(test){for(let i=0;i<80;i++){await command('x');await delay(200);const s=await screen();if(test(s))return s;}throw Error(await screen());}
const prompt=s=>/(?:^|\n)[089]:>$/.test(s);
async function enter(s){await command('keybuf '+s+'\\x0d');return waitFor(prompt);}
async function mount(name,dev){const r=await command('attach "C:/dev/MCS-DOS/build/help-'+name+'.d64" '+dev);assert(!r.includes('Failed'),r);}
(async()=>{
if(process.argv.includes('--basic'))await waitFor(s=>s.includes('ready.'));
if(!process.argv.includes('--basic')){
 await enter('cls');await command('keybuf exit\\x0d');await command('x');await delay(400);
}
assert((await command('resourceget "Drive9Type"')).includes('Drive9Type=1541'));
await command('detach 9');await mount('good',8);await mount('version',9);
await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 08');await enter('run');
await enter('9:');await enter('cls');let s=await enter('help cls');assert(s.includes('Clears the screen.'),s);
// Output stays open on drive 9 while the help disk is swapped on drive 8.
await mount('missing',8);await enter('cls');await command('keybuf help cls >swaphelp\\x0d');
s=await waitFor(s=>s.replace(/\s/g,'').includes('InsertMCS-DOSdiskandpressanykeywhenready'));
await mount('good',8);await command('keybuf x');s=await waitFor(prompt);
assert(!s.includes('Clears the screen.'),'Help text should go to the output file');
await enter('cls');s=await enter('type swaphelp');assert(s.includes('Clears the screen.'),s);
assert(!s.includes('Insert MCS-DOS'),s);
console.log('PASS drive 9 remains active while help loads from startup drive 8; disk retry preserves output on drive 9 and keeps prompt on screen');
})().catch(e=>{console.error(e);process.exitCode=1});

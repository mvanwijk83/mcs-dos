// Requires VICE localhost:6510 at a shell prompt. Uses only disposable
// build/test-startup-input.d64. Checks Y + RETURN leaves one startup prompt.
const fs=require('fs'); const assert=require('assert/strict');const {command,screen,delay}=require('../scripts/monitor');
(async()=>{
 await command('keybuf exit\\x0d');await command('x');await delay(500);
 await command('detach 8');fs.copyFileSync('build/MCS-DOS.d64','build/test-startup-input.d64');
 await command('attach "C:/dev/MCS-DOS/build/test-startup-input.d64" 8');
 await command('load "C:/dev/MCS-DOS/build/MCS-DOS.prg" 0');await command('> ba 08');
 await command('keybuf run\\x0d');await command('x');await delay(2000);
 assert((await screen()).includes('Enter selection'));
 await command('keybuf 1y\\x0d');await command('x');await delay(2500);
 const s=await screen();console.log(s);
 const prompts=(s.match(/8:>/g)||[]).length;
 assert.equal(prompts,Number(process.argv[2]||1));
 console.log('PASS startup prompt count: '+prompts);
})().catch(e=>{console.error(e);process.exitCode=1});


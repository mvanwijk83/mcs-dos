// Run after io-benchmark --quick; all writes stay on its disposable target.
const assert=require('assert/strict');const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=1000){await command('keybuf '+s);await command('x');await delay(ms);return screen();}
(async()=>{
 await command('attach "C:/dev/MCS-DOS/build/test-io-MCS-DOS.d64" 8');
 await command('attach "C:/dev/MCS-DOS/build/test-io-target-MCS-DOS.d64" 9');
 let s=await enter('cls\\x0ddiskcopy 8: 9:\\x0dy\\x03',2000);
 for(let i=0;i<30&&!s.includes('Disk copy not completed.');i++){await command('x');await delay(1000);s=await screen();}
 assert(s.includes('Disk copy not completed.'),s);
 s=await enter('dir 8: /b\\x0d',1500);assert(s.includes('FULLTEXT'),s);
 s=await enter('dir 9: /b\\x0d',1500);assert(s.trimEnd().endsWith('8:>'),s);assert(!s.includes('Drive not ready'),s);
 console.log('PASS DISKCOPY cancellation and subsequent directory access on both drives');
})().catch(e=>{console.error(e);process.exitCode=1});

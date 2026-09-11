// Shell must be running. Mounts only the disposable fixture disks.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function copy(s) {
  await command('keybuf '+s+'\\x0dy');await command('x');await delay(1500);
  for(let i=0;i<40;i++) {
    const text=await screen();
    if(text.trimEnd().endsWith('8:>')) {
      assert(text.includes('1 file(s) copied.'),text);return;
    }
    await command('x');await delay(1000);
  }
  throw Error('Copy did not finish');
}
(async()=>{
  await command('attach "C:/dev/MCS-DOS/build/test-tweaks.d64" 8');
  await command('attach "C:/dev/MCS-DOS/build/test-rel-target.d64" 9');
  await copy('cls\\x0dcopy records same');
  await copy('cls\\x0dcopy records 9:across');
  await command('detach 8');await command('detach 9');
  require('child_process').execFileSync(process.execPath,['tests/rel-verify.js'],{stdio:'inherit'});
})().catch(e=>{console.error(e);process.exitCode=1});

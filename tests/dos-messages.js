// Run at a shell prompt in VICE, with a disposable disk in drive 8.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=1500) {
  await command('keybuf '+s+'\\x0d'); await command('x'); await delay(ms); return screen();
}
(async()=>{
  await enter('cls');
  assert.equal((await enter('0:')).split('Invalid drive specification').length-1,1);
  await enter('label 8: regression');
  await enter('cls');
  assert((await enter('label')).includes('Volume in drive 8: is REGRESSION\nDisk ID is'));
  assert((await screen()).includes('Volume label  (16 characters)?'));
  await enter('');
  await enter('cls');
  assert((await enter('chkdsk')).includes('Volume\nDisk ID is'));
  await enter('label regression');
  await enter('cls'); await enter('8:');
  await command('keybuf del'); await command('x'); await delay(300);
  await command('> 028d 02'); await command('x'); await delay(1800);
  let s=await screen(); assert.equal(s.split('8:>del').length-1,1);
  assert(s.includes('8:>del "'));
  await command('> 028d 00'); await command('keybuf \\x03'); await command('x'); await delay(300);
  await enter('format 8:');
  await command('keybuf y'); await command('x'); await delay(500);
  await enter('test disk');
  assert((await screen()).includes('New disk ID (2 letters or digits):'));
  await enter('a7',16000); await enter('cls');
  s=await enter('chkdsk');
  assert(s.includes('Volume TEST DISK\nDisk ID is A7\n\n169,984 bytes total disk space\n      0 bytes allocated in 0 files\n169,984 bytes available on disk\n\n    256 bytes in each block (254 usable)\n    664 total blocks on disk\n    664 available blocks on disk\n\n 65,536 total bytes memory\n'));
  assert(/\n[ \d,]{7} bytes free\n/.test(s));
  console.log('PASS drive error, LABEL defaults/clearing, uncached completion, FORMAT ID, exact CHKDSK rows');
})().catch(e=>{console.error(e);process.exitCode=1});

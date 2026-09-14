// Shell at prompt. Uses a separate disposable D64, restoring test-layout.d64.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {command,screen,delay}=require('../scripts/monitor');
const image='C:/dev/MCS-DOS/build/test-dir-boundaries.d64';
async function enter(s,ms=1800) {
  await command('keybuf '+s+'\\x0d');await command('x');await delay(ms);return screen();
}
function aligned(s) {
  const rows=s.split('\n').filter(r=>r.endsWith('bl)'));
  assert(rows.length>=2);
  for(const r of rows) { assert.equal(r.length,37,r);assert.equal(r.lastIndexOf('('),29,r); }
}
(async()=>{
  fs.writeFileSync('build/test-dir-large',Buffer.alloc(100000,65));
  fs.writeFileSync('build/test-dir-small',Buffer.from('x'));
  const args=['-format','layout,lt','d64',image,'-attach',image,'-write','build/test-dir-large','abcdefghijklmnop,s'];
  for(let i=0;i<100;i++) args.push('-write','build/test-dir-small',`f${String(i).padStart(3,'0')},s`);
  execFileSync('tools/vice/GTK3VICE-3.10-win64/bin/c1541.exe',args,{stdio:'pipe'});
  await command('attach "'+image+'" 8');
  await enter('cls');
  let s=await enter('dir abcdefghijklmnop');
  aligned(s);assert(s.includes('ABCDEFGHIJKLMNOP SEQ 100,864 (394 bl)'));
  assert(/^  1 File\(s\)/m.test(s));
  await enter('cls');s=await enter('dir missing');aligned(s);assert(/^  0 File\(s\)/m.test(s));
  await enter('cls');s=await enter('dir/w');
  for(let i=0;i<8&&s.includes('Press any key to continue');i++) {
    await command('keybuf \\x20');await command('x');await delay(300);s=await screen();
  }
  aligned(s);assert(/^101 File\(s\) +126,464 bytes \(494 bl\)$/m.test(s),s);
  assert(/^ +43,520 bytes free \(170 bl\)$/m.test(s),s);
  await enter('cls');s=await enter('chkdsk');assert(s.includes('bytes allocated'));assert(s.includes('(494 blocks)'));
  await command('attach "C:/dev/MCS-DOS/build/test-layout.d64" 8');
  console.log('PASS six-digit byte counts, 16-character name, 101 files, zero matches, aligned totals and CHKDSK allocation');
})().catch(e=>{console.error(e);process.exitCode=1});

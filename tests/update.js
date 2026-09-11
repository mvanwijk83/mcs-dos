// Run with VICE's localhost:6510 monitor and MCS-DOS at an interactive prompt.
// Only reads the mounted disk. REU resource tests are performed separately.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(keys,wait=350) {
  await command('keybuf '+keys+'\\x0d'); await command('x'); await delay(wait);
  return screen();
}
async function register(address) {
  const raw=await command('m '+address+' '+address);
  return parseInt(raw.match(/>C:[0-9a-f]+\s+([0-9a-f]{2})/i)[1],16);
}
(async()=>{
  await enter('cls');
  const help=await enter('help');
  assert(help.includes('DIR          DISKCOPY     DISKID'));
  assert(help.indexOf('RUN          TYPE         VER')<help.lastIndexOf('VOL'));
  console.log('PASS alphabetic HELP');
  await enter('cls');
  const dir=await enter('dir/o',1500);
  assert(/MCS-DOS\s+PRG\s+[0-9,]+ \(\s*\d+ blks\)/.test(dir));
  assert(/HELLO.BAT\s+SEQ\s+256 \(  1 blks\)/.test(dir));
  assert(dir.includes(' Volume in drive 8: is MCS-DOS'));
  assert(dir.includes(' Disk ID is MC'));
  assert(/^  \d File\(s\) +[\d,]+ bytes \( *\d+ blks\)$/m.test(dir));
  assert(!dir.includes('allocated'));
  assert(!dir.includes('Name             Typ'));
  assert(/^ +[\d,]+ bytes free \( *\d+ blks\)$/m.test(dir));
  for(const row of dir.split('\n').filter(s=>s.endsWith('blks)'))) {
    assert.equal(row.length,39);assert.equal(row.lastIndexOf('('),29);
  }
  assert(dir.includes('\n\n8:>'));
  console.log('PASS DIR/O, block/byte rows, totals, prompt whitespace');
  await enter('cls');
  const wide=await enter('dir/w/o',1500);
  assert(wide.includes('File(s)')); assert(!wide.includes('PRG'));
  console.log('PASS DIR/W/O');
  for(const [n,border,back] of [[1,0,0],[2,0,0],[3,0,0],[4,14,6]]) {
    await enter('color/scheme '+n);
    assert.equal((await register('d020'))&15,border);
    assert.equal((await register('d021'))&15,back);
  }
  await enter('color/fore:2/scheme 1');
  assert((await screen()).includes('/SCHEME cannot be combined'));
  assert.equal((await register('d020'))&15,14);
  assert.equal((await register('d021'))&15,6);
  await enter('color/fore:1/back:0/border:2');
  assert.equal((await register('d020'))&15,2);
  assert.equal((await register('d021'))&15,0);
  console.log('PASS presets, combined colors, mutually exclusive scheme');
  await enter('color/scheme 1');
  await enter('help'); await enter('help'); await enter('diskid');
  assert((await screen()).endsWith('New disk ID (2 letters or digits):'));
  assert.equal(await register('d001'),242); // screen row 24
  assert.equal((await register('d010'))&1,1); // ninth horizontal-position bit
  assert.equal(await register('d000'),48);  // x = 304, column 35
  await command('warp off');
  const phases=new Set();
  for(let i=0;i<10;i++) { phases.add((await register('d015'))&1); await delay(100); }
  assert.equal(phases.size,2);
  await command('warp on');
  await command('keybuf \\x03'); await command('x'); await delay(200);
  console.log('PASS bottom-row underscore position and blinking');
})().catch(e=>{console.error(e);process.exitCode=1});

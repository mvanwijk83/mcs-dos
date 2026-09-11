// VICE, shell prompt, disposable standard 1541 disk including DEMO in drive 8.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=500) {
  await command('keybuf '+s+'\\x0d'); await command('x'); await delay(ms); return screen();
}
async function reg(a) {
  const raw=await command('m '+a+' '+a);
  return parseInt(raw.match(/>C:[0-9a-f]+\s+([0-9a-f]{2})/i)[1],16);
}
(async()=>{
  await enter('label 8: abcdefghijklmnop',1500);
  await enter('cls');
  assert((await enter('dir',2000)).includes(' Volume in drive 8: is ABCDEFGHIJKLMNOP\n Disk ID is MC'));
  await enter('label 8: mcs-dos',1500);
  console.log('PASS 16-character volume label on one line, Disk ID on next');
  assert((await enter('edit')).includes(' 1: 1'));
  assert.equal(await reg('d000'),24);assert.equal(await reg('d001'),50);
  await command('keybuf abc\\x0dxy');await command('x');await delay(300);
  assert((await screen()).includes(' 2: 3'));
  assert.equal(await reg('d000'),40);assert.equal(await reg('d001'),58);
  await command('warp off');
  const phases=new Set();
  for(let i=0;i<10;i++) { phases.add((await reg('d015'))&1); await delay(100); }
  assert.equal(phases.size,2);
  await command('warp on');await command('keybuf \\x03n');await command('x');await delay(300);
  console.log('PASS EDIT line/column tracking, underscore position and blinking');
  const run=await enter('run demo',3000);
  assert(run.includes('hello from basic!'));assert(run.includes('ready.'));
  assert(!run.includes('8:>'));assert.equal((await reg('d018'))&2,0);
  assert.equal(await reg('0291'),0);
  assert((await enter('print 2+2')).includes(' 4'));
  console.log('PASS RUN clears shell display, restores default case and usable BASIC');
})().catch(e=>{console.error(e);process.exitCode=1});

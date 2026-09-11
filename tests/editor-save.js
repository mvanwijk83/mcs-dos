// Start at a shell prompt with disposable build/test-layout.d64 mounted.
const assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function keys(s,wait=350) {
  await command('keybuf '+s);await command('x');await delay(wait);return screen();
}
function document(s) { return s.split('\n').slice(0,24); }
function status(s) { return s.split('\n')[24]; }
(async()=>{
  await keys('edit\\x0d');
  await keys('first row'+ '\\x11'.repeat(23)+'last row');
  const before=document(await screen());
  assert.equal(before[0],'first row');assert(before[23].includes('last row'));
  let s=await keys('\\x03');
  assert.deepEqual(document(s),before);assert.equal(status(s),'Save changes (Y/N)?');
  s=await keys('y');
  assert.deepEqual(document(s),before);assert.equal(status(s),'File name:');
  s=await keys('UI-NOTES\\x0d',2500);
  assert.equal(s.trim(),'8:>','successful save leaves a clear shell screen');
  s=await keys('edit UI-NOTES\\x0d',1800);
  assert.deepEqual(document(s),before,'saved file reloads with its final row intact');
  s=await keys('\\x03y',1800);
  assert.deepEqual(document(s),before);assert.equal(status(s),'Overwrite existing file (Y/N)?');
  assert.equal((await keys('n')).trim(),'8:>');
  await keys('edit UI-NOTES\\x0d',1800);
  assert.equal((await keys('\\x03n')).trim(),'8:>','declining save clears the document');
  await keys('edit\\x0d');await keys('cancel me\\x03y');
  assert.equal((await keys('\\x03')).trim(),'8:>','RUN/STOP at filename cancels cleanly');
  await keys('edit\\x0d');await keys('invalid name\\x03y');
  s=await keys('bad,name\\x0d');
  assert(s.includes('Invalid file name'));assert(!s.includes('invalid name'));
  console.log('PASS status-line save, filename and overwrite prompts; document preservation; save/reload, cancellations and errors');
})().catch(e=>{console.error(e);process.exitCode=1});

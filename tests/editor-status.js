// Shell prompt, disposable drive 8. Watchpoints detect even identical writes
// to fixed status text/color cells, which a before/after screenshot would miss.
const fs=require('fs'),assert=require('assert/strict');
const {command,screen,delay}=require('../scripts/monitor');
async function keys(s,ms=250) {
  await command('keybuf '+s);await command('x');await delay(ms);return screen();
}
function status(s) { return s.split('\n')[24]; }
const points=[];
(async()=>{
  const labels=fs.readFileSync('build/mcsdos.lbl','utf8');
  const symbol=n=>parseInt(labels.match(new RegExp('al ([0-9A-F]+) \\.'+n+'(?:\\r?\\n|$)','i'))[1],16);
  const top=symbol('__HIMEM__'),stack=symbol('__STACKSIZE__');
  const spare=top-stack-symbol('__BSS_RUN__')-symbol('__BSS_SIZE__');
  assert.equal(top,0xd000);assert.equal(stack,2048);assert(spare>0);
  await keys('cls\\x0d');
  assert((await keys('mem\\x0d')).includes(spare.toLocaleString('en-US').padStart(10)+' bytes free'));
  const spBytes=(await command('m 0002 0003')).match(/>C:0002\s+([\da-f]{2}) ([\da-f]{2})/i);
  const sp=parseInt(spBytes[1],16)+256*parseInt(spBytes[2],16);
  assert(sp>=top-stack&&sp<top,'runtime uses the relocated C stack');
  assert(status(await keys('edit\\x0d')).includes('01:01'));
  for(const range of ['07c0 07c0','07c3 07c3','07c6 07e7','dbc0 dbe7']) {
    const response=await command('break store '+range);
    points.push(Number(response.match(/(?:BREAK|WATCH):\s*(\d+)/i)[1]));
  }
  assert(status(await keys('\\x1d'.repeat(9))).includes('01:10'));
  assert(status(await keys('\\x1d'.repeat(30))).includes('01:40'));
  assert(status(await keys('\\x11'.repeat(9))).includes('10:40'));
  assert(status(await keys('\\x11'.repeat(14))).includes('24:40'));
  assert(status(await keys('\\x13')).includes('01:01'));
  assert(status(await keys('abc')).includes('01:04'));
  for(const p of points) await command('delete '+p);points.length=0;
  console.log('PASS fixed status text/color cells receive no writes; only coordinates change');
  await keys('\\x03y');
  await command('warp off');
  const saving=await keys('STATUS-SAVE\\x0d',150);
  assert.equal(status(saving),'Saving . . .');assert.equal(saving.split('\n')[0],'abc');
  await command('warp on');
  for(let i=0;i<10;i++) {
    await command('x');await delay(1000);
    if((await screen()).trim()==='8:>') {
      console.log('PASS Saving . . . appears with document intact, then returns to clean prompt');
      console.log('PASS expanded memory map and MEM: '+spare+' bytes available, full 2 KiB stack');return;
    }
  }
  throw Error('Save did not finish');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
  for(const p of points) await command('delete '+p);
  await command('warp on');
});

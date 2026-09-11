// Checks the 0.4 help/exit changes in a running VICE session. No disk writes.
const assert=require('assert/strict'),fs=require('fs');
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s) {
  await command('keybuf '+s+'\\x0d'); await command('x'); await delay(250);
  return screen();
}
async function dump(address,end,name) {
  await command('bsave "C:/dev/MCS-DOS/build/test-'+name+'.bin" 0 '+address+' '+end);
  return fs.readFileSync('build/test-'+name+'.bin');
}
(async()=>{
  await enter('cls');
  const help=await enter('help');
  assert(help.includes('For more information on a specific\ncommand, type HELP'));
  await enter('cls');
  const color=await enter('color/?');
  assert(color.includes('1  Classic PC'));
  assert(!color.includes('Classic DOS') && !color.includes('Borders:'));
  assert(!color.includes('cyan on black'));
  assert(color.includes('0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15'));
  const chars=await dump('0400','07e7','help-screen');
  const colors=await dump('d800','dbe7','help-colors');
  const start=chars.findIndex((v,i)=>i%40===0&&chars.subarray(i,i+38).every(c=>c===160));
  assert(start>=0,'38 reverse-video spaces form the palette');
  let offset=start;
  for(let i=0;i<16;i++) for(let j=0;j<(i<10?2:3);j++) assert.equal(colors[offset++]&15,i);
  assert(chars.subarray(start+40,start+78).every(v=>v<128),'number labels are not reversed');
  console.log('PASS revised COLOR help, Classic PC, 16 RVS swatches and numeric labels');
  await enter('exit');
  const mode=await dump('d018','d018','exit-mode');
  assert.equal(mode[0]&2,0,'uppercase/graphics ROM character set');
  const clean=await screen();
  assert.equal(clean.trim(),'ready.'); // helper decodes with lowercase ROM conventions
  console.log('PASS clean screen and uppercase BASIC on EXIT');
  assert((await enter('print 2+2')).includes(' 4'));
  await enter('new');
  await enter('10 print 7*6');
  assert((await enter('run')).includes(' 42'));
  console.log('PASS BASIC immediate expressions, NEW, program entry and RUN after EXIT');
})().catch(e=>{console.error(e);process.exitCode=1});

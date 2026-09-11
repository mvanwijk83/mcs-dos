// Run at BASIC READY, on disposable drive 8. Creates binary REL records using
// real 1541 DOS so COPY tests do not depend on hand-built side-sector fixtures.
const {command,screen,delay}=require('../scripts/monitor');
async function enter(s,ms=150) {
  await command('keybuf '+s+'\\x0d'); await command('x'); await delay(ms);
}
(async()=>{
  await enter('new');
  const lines=[
    '10 open 15,8,15',
    '15 print#15,"s0:records"',
    '20 open 2,8,2,"records,l,"+chr$(100)',
    '30 for r=1 to 7',
    '40 print#15,"p"+chr$(98)+chr$(r)+chr$(0)+chr$(1)',
    '50 a$="":for i=1 to 100',
    '60 a$=a$+chr$((r*37+i)and 255)',
    '70 next i:print#2,a$;:next r',
    '80 close 2:close 15',
  ];
  for(const line of lines) await enter(line);
  await enter('run',3000);
  for(let i=0;i<30;i++) {
    const text=await screen();
    if(text.trimEnd().endsWith('ready.')) { console.log('PASS created binary REL fixture'); return; }
    await command('x'); await delay(1000);
  }
  throw Error('REL fixture did not finish');
})().catch(e=>{console.error(e);process.exitCode=1});

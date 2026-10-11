require('./setup');
const assert=require('assert/strict');
const {start,fixture}=require('./cmd-hd-session');
async function main(){
 const image='build/test-cmd-overview.dhd';await fixture(image);
 const s=await start(image,null,true,true);
 try{
  async function list(){await s.enter('cls','8:>');return s.enter('diskpart','8:>');}
  await s.enter('diskpart 3','8:>');
  let report=await list();console.log(report);
  for(const text of ['Bytes free','169,984','339,968','808,960','49,152','CMD','* 3'])assert(report.includes(text),report);
  const rows=report.split('\n').filter(row=>/^[* ] \d/.test(row));
  assert.equal(rows.length,8,report);
  for(const row of rows)assert(row.trimEnd().length<=39,row);
  await s.enter('echo payload > sample','8:>');
  report=await list();assert(report.includes('808,704') && report.includes('* 3'),report);
  await s.enter('del sample /p','8:>');
  report=await list();assert(report.includes('808,960') && report.includes('* 3'),report);
  await s.enter('echo payload > !!','8:>');
  report=await list();assert(report.includes('808,704') && report.includes('* 3'),report);
  await s.enter('del !! /p','8:>');
  report=await list();assert(report.includes('808,960'),report);
  await s.enter('diskpart 4','8:>');
  report=await list();assert(report.includes('* 4') && report.includes('49,152'),report);
  console.log('PASS CMD overview: aligned one-line rows, all emulation free counts, Native free count, file allocation changes and selection preservation');
 }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

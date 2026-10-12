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
  for(const text of ['Capacity','175,104','350,208','819,200','65,536','CMD','* 3'])assert(report.includes(text),report);
  const rows=report.split('\n').filter(row=>/^[* ] \d/.test(row));
  assert.equal(rows.length,8,report);
  for(const row of rows)assert(row.trimEnd().length<=39,row);
  await s.enter('echo payload > sample','8:>');
  report=await list();assert(report.includes('819,200') && report.includes('* 3'),report);
  await s.enter('del sample /p','8:>');
  report=await list();assert(report.includes('819,200') && report.includes('* 3'),report);
  await s.enter('diskpart 4','8:>');
  report=await list();assert(report.includes('* 4') && report.includes('65,536'),report);
  console.log('PASS CMD overview: aligned one-line rows, all emulation capacities, Native capacity, unchanged capacity after file allocation and selection preservation');
 }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

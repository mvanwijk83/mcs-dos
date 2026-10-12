require('./setup');
const assert=require('assert/strict');
const {start,fixture}=require('./cmd-hd-session');
async function main(){
 const image='build/test-cmd-sysinfo.dhd';await fixture(image);
 const s=await start(image,null,true,true);
 try{
  for(let n=0;n<20;n++){
   await s.enter('cls','8:>');const report=await s.enter('sysinfo','8:>');
   assert(report.includes('Drive 8:  CMD HD'),report);
   assert.deepEqual([...report.matchAll(/Drive (\d+):/g)].map(m=>+m[1]),[8],report);
   console.log('PASS CMD-only SYSINFO scan '+(n+1));
  }
  for(const [n,model] of [[1,'1541'],[2,'1571'],[3,'1581']]){
   await s.enter('diskpart '+n,'8:>');
   await s.enter('cls','8:>');
   const report=await s.enter('chkdsk','8:>');
   assert(report.includes('CMD HD ('+model+')'),report);
   console.log('PASS CHKDSK CMD HD ('+model+')');
  }
  await s.enter('cls','8:>');
  const listing=await s.enter('diskpart','8:>');
  assert(listing.includes('Capacity') && listing.includes('* 3') && listing.includes('175,104') && listing.includes('350,208') && listing.includes('819,200') && listing.includes('65,536'),listing);
  console.log('PASS 20 repeated SYSINFO scans with only CMD HD on device 8');
 }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

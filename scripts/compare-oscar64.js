// Compare available RAM, not merely the on-disk program length.
const fs=require('fs'),path=require('path');
const {execFileSync,spawnSync}=require('child_process');
const oscar=path.resolve(process.argv[2]||'tools/oscar64/oscar64','bin/oscar64.exe');
const cc65=path.resolve(process.argv[3]||'tools/cc65');
const out='build/oscar64';fs.mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['scripts/make-hardware.js',cc65],{stdio:'inherit'});
let baseline;
const results=[];
const modes=[['Os-outline','-Os','-Oo'],['Os','-Os'],['O2','-O2']];
if(process.argv.includes('--o3'))modes.push(['O3','-O3']);
for(const [name,...flags] of modes){
 const stem=out+'/MCS-DOS-'+name;
 try{
  const run=spawnSync(oscar,['-n',...flags,'-psci','-o='+stem+'.prg','src/mcsdos.c'],{timeout:120000,windowsHide:true,encoding:'utf8',stdio:'pipe'});
  if(run.error || run.status!==0)throw Object.assign(run.error||Error('Compiler exit '+run.status),{stdout:run.stdout,stderr:run.stderr});
  fs.writeFileSync(stem+'.log',run.stdout+run.stderr);
  const map=fs.readFileSync(stem+'.map','utf8');
  const heap=map.match(/^([\da-f]+) - ([\da-f]+) : HEAP, heap/m);
  const free=parseInt(heap[2],16)-parseInt(heap[1],16);
  if(name==='Os-outline') baseline=free;
  results.push({compiler:'Oscar64 '+flags.join(' '),prgBytes:fs.statSync(stem+'.prg').size,freeRam:free,ramSaved:baseline===undefined?null:free-baseline});
 }catch(error){
  fs.writeFileSync(stem+'.log',String(error.stdout||'')+String(error.stderr||'')+'\n'+error.message);
  results.push({compiler:'Oscar64 '+flags.join(' '),error:error.code==='ETIMEDOUT'?'Compilation exceeded 120 seconds':'Compilation failed; see '+stem+'.log'});
 }
}
fs.writeFileSync(out+'/memory.json',JSON.stringify(results,null,2)+'\n');
console.table(results);
console.log('Free RAM uses the aligned heap start and preserves the 2048-byte stack. MEM may include up to 7 alignment bytes. Compile success alone does not qualify a mode; see OSCAR64.md.');

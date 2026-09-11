// Compare available RAM, not merely the on-disk program length.
const fs=require('fs'),path=require('path');
const {execFileSync,spawnSync}=require('child_process');
const oscar=path.resolve(process.argv[2]||'tools/oscar64/oscar64','bin/oscar64.exe');
const cc65=path.resolve(process.argv[3]||'tools/cc65');
const out='build/oscar64';fs.mkdirSync(out,{recursive:true});
execFileSync(path.join(cc65,'bin/cl65.exe'),['-t','c64','-O','-Wl','-D__HIMEM__=53248','-m',out+'/cc65.map','-o',out+'/cc65.prg','src/mcsdos.c','src/launch.s','src/reu.s','src/charset.s'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/prepare-oscar64.js',cc65],{stdio:'inherit'});
const bss=fs.readFileSync(out+'/cc65.map','utf8').match(/^BSS\s+\w+\s+(\w+)/m);
const baseline=0xc800-parseInt(bss[1],16)-1;
const results=[{compiler:'cc65 -O',prgBytes:fs.statSync(out+'/cc65.prg').size,freeRam:baseline,ramSaved:0}];
const modes=[['Os','-Os'],['O2','-O2'],['Os-outline','-Os','-Oo']];
if(process.argv.includes('--o3'))modes.push(['O3','-O3']);
for(const [name,...flags] of modes){
 const stem=out+'/MCS-DOS-'+name;
 try{
  const run=spawnSync(oscar,['-n',...flags,'-psci','-o='+stem+'.prg',out+'/mcsdos.c'],{timeout:120000,windowsHide:true,encoding:'utf8',stdio:'pipe'});
  if(run.error || run.status!==0)throw Object.assign(run.error||Error('Compiler exit '+run.status),{stdout:run.stdout,stderr:run.stderr});
  fs.writeFileSync(stem+'.log',run.stdout+run.stderr);
  const map=fs.readFileSync(stem+'.map','utf8');
  const heap=map.match(/^([\da-f]+) - ([\da-f]+) : HEAP, heap/m);
  const free=parseInt(heap[2],16)-parseInt(heap[1],16);
  results.push({compiler:'Oscar64 '+flags.join(' '),prgBytes:fs.statSync(stem+'.prg').size,freeRam:free,ramSaved:free-baseline});
 }catch(error){
  fs.writeFileSync(stem+'.log',String(error.stdout||'')+String(error.stderr||'')+'\n'+error.message);
  results.push({compiler:'Oscar64 '+flags.join(' '),error:error.code==='ETIMEDOUT'?'Compilation exceeded 120 seconds':'Compilation failed; see '+stem+'.log'});
 }
}
fs.writeFileSync(out+'/memory.json',JSON.stringify(results,null,2)+'\n');
console.table(results);
console.log('Free RAM uses the aligned heap start and preserves the 2048-byte stack. MEM may include up to 7 alignment bytes. Compile success alone does not qualify a mode; see OSCAR64.md.');

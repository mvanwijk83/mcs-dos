// Authorized live-hardware benchmark. Each build and fixture has its own files.
// Timing uses a benchmark-only cartridge, not injected executable code.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const tag=process.argv.find(s=>s.startsWith('--tag='))?.slice(6)||'before';
const dir='build/ultimate-dir-'+tag,root='http://192.168.178.170';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function prepare(){
    fs.mkdirSync(dir,{recursive:true});
    for(const name of ['src','scripts','disk-content','assets'])fs.cpSync(name,path.join(dir,name),{recursive:true});
    for(const name of ['manual.txt','changelog.txt','license.txt','README.md','package.json'])
        if(fs.existsSync(name))fs.copyFileSync(name,path.join(dir,name));
    function edit(name,fn){const p=dir+'/src/'+name;fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')));}
    edit('core.c',s=>s.replace(/unsigned char page\(void\)\s*\{[\s\S]*?\n\}/,'unsigned char page(void) { return !aborted && !stop(); }'));
    edit('mcsdos.c',s=>s.replace('POKE(1, 0x36);','POKE(1, 0x36); POKE(0xc4b0,0); POKE(0xc4b1,'+(tag==='before'?111:112)+'); POKE(0xc4b2,0);')
        .replace('bootsplash(1);','{ ultimatebase=PEEK(0xde1d)==0xc9?0xde1c:0xdf1c; skipautoexec=1; }')
        .replace('if (!input(line, LINE, 1))','POKE(0xc4b0,1);\n            if (!input(line, LINE, 1))')
        .replace('            if (line[0]) {','            POKE(0xc4b0,0);\n            if (line[0]) {')
        .replace('        nav_finish();','        nav_finish(); POKE(0xc4b2,PEEK(0xc4b2)+1);'));
    edit('bank-gates.c',s=>s.replace(/(__noinline void host_dir\([^)]*\)\s*\{)/,'$1\n    clock_t benchmark_started=clock();')
        .replace(/(bank_host_dir\(flags, filter, recursive\);\s*bank_leave\(previous\);)/,'$1\n    *((volatile unsigned long *)0xc480) = clock()-benchmark_started;'));
    edit('hostdir.c',s=>s.replace('print(SYSOUT_DIR_TOTAL, files, amount); newline();',
        'print(SYSOUT_DIR_TOTAL, files, amount); newline();\n        *((volatile unsigned int *)0xc488)=files; *((volatile unsigned int *)0xc48a)=dirs; *((volatile unsigned long *)0xc48c)=total;'));
    console.log('Prepared '+dir);
}
async function request(p,options={}){
    const r=await fetch(root+p,{...options,signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error(p+' HTTP '+r.status);return r;
}
async function read(a,n){return Buffer.from(await(await request('/v1/machine:readmem?address='+a.toString(16)+'&length='+n)).arrayBuffer());}
async function write(a,b){const r=await(await request('/v1/machine:writemem?address='+a.toString(16)+'&data='+Buffer.from(b).toString('hex'),{method:'PUT'})).json();if(r.errors?.length)throw Error(JSON.stringify(r));}
async function ready(old){
    const until=Date.now()+60000;
    while(Date.now()<until){const b=await read(0xc4b0,3);if(b[0]===1&&b[1]===(tag==='before'?111:112)&&(old===undefined||b[2]!==old))return;await sleep(100);}
    throw Error('Shell did not return to prompt');
}
async function enter(text,limit=60000){
    await ready();const old=(await read(0xc4b2,1))[0],keys=Buffer.from(text.toUpperCase()+'\r','ascii');
    await write(0xc480,Array(16).fill(0));
    for(let p=0;p<keys.length;p+=10){
        while((await read(198,1))[0])await sleep(40);
        await write(631,keys.subarray(p,p+10));await write(198,[Math.min(10,keys.length-p)]);
    }
    const until=Date.now()+limit;let timedOut=false;
    for(;;){
        const b=await read(0xc4b0,3);
        if(b[0]===1&&b[2]!==old)break;
        if(Date.now()>until){timedOut=true;await write(631,[3]);await write(198,[1]);await ready(old);break;}
        await sleep(100);
    }
    const b=await read(0xc480,16),result={command:text,ticks:b.readUInt32LE(),seconds:b.readUInt32LE()/60,timedOut,files:b.readUInt16LE(8),dirs:b.readUInt16LE(10),bytes:b.readUInt32LE(12)};
    if(!result.ticks)throw Error('DIR timing marker was not written: '+text);
    console.log(JSON.stringify(result));return result;
}
async function run(){
    if(!process.argv.includes('--reuse')){
    await write(0xc4b0,[0,0,0]);
    const form=new FormData();form.append('crt',new Blob([fs.readFileSync(dir+'/build/easyflash/MCS-DOS.crt')]),'mcs-dir-benchmark.crt');
    const response=await(await request('/v1/runners:run_crt',{method:'POST',body:form})).json();
    if(response.errors?.length)throw Error(JSON.stringify(response));
    await request('/v1/machine:resume',{method:'PUT'});
    await sleep(1000);await ready();
    }
    if((await read(0xc4b1,1))[0] !== (tag==='before'?111:112))throw Error('Wrong benchmark cartridge');
    const source=process.argv.find(s=>s.startsWith('--path='))?.slice(7)||'11:\\USB1\\GAMES';
    const results=[];
    const limit=Number(process.argv.find(s=>s.startsWith('--limit='))?.slice(8)||60000);
    const only=process.argv.find(s=>s.startsWith('--only='))?.slice(7);
    const suffixes=only===undefined?[' /b','',' /on',' /os',' >11:\\TEMP\\MCSLIST-'+tag]:[only==='plain'?'':' /'+only];
    for(const suffix of suffixes)
    {
        results.push(await enter('dir '+source+suffix,limit));
        fs.writeFileSync(process.argv.find(s=>s.startsWith('--result='))?.slice(9)||'build/ultimate-dir-'+tag+'-timings.json',JSON.stringify(results,null,2));
    }
    const result=process.argv.find(s=>s.startsWith('--result='))?.slice(9)||'build/ultimate-dir-'+tag+'-timings.json';
    fs.writeFileSync(result,JSON.stringify(results,null,2));
}
if(process.argv.includes('--prepare'))prepare();
else run().catch(e=>{console.error(e);process.exitCode=1;});

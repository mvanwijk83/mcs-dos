// Real CMD DOS: failed directory reads preserve the shell, names and stack.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {start,fixture,monitorPath}=require('./cmd-hd-session');
const message=require('./output');
async function main(){
    const good='build/cmd-navigation-good.dhd',bad='build/cmd-navigation-unformatted.dhd';
    const parts=await fixture(good),native=parts.find(p=>p.type===1);
    const source=process.argv.find(a=>a.startsWith('--image='))?.slice(8);
    const b=fs.readFileSync(source||good);
    if(!source)b.fill(0,native.offset,native.offset+native.bytes);
    fs.writeFileSync(bad,b);
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const original=source&&hash(source),before=hash(bad);
    const s=await start(bad,null,true,true);
    function unreadable(report){
        assert([message.SYSOUT_DRIVE_NOT_READY,message.SYSOUT_ERR_READING_BANK_DIR]
            .some(text=>report.includes(text.trim())),report);
    }
    async function run(line,prompt='8:\\>'){
        await s.enter('cls',prompt);
        const report=await s.enter(line,prompt);
        console.log('PASS '+line+' returned to '+prompt);return report;
    }
    try{
        for(const reset of [null,0,1]){
            if(reset!==null){await s.command('reset '+reset);await s.wait('0:>');await s.enter('8:','8:>');}
            let report=await run('chkdsk');
            assert(report.includes(message.SYSOUT_SELECT_EMULATION_PARTITION.trim())&&
                !report.includes(message.SYSOUT_VIRTUAL_ROOT_NO_FILES.trim()),report);
            report=await run('dir \\native');
            unreadable(report);
            await s.enter('cd \\@4','8:\\NATIVE>');
            report=await run('dir','8:\\NATIVE>');
            unreadable(report);
            report=await run('cd','8:\\NATIVE>');assert(report.includes('8:\\NATIVE'),report);
            await s.enter('cd \\','8:\\>');
        }
        await s.enter('0:','0:>');
        let report=await run('dir 8:\\native','0:\\>');
        unreadable(report);
        await s.command('detach 8');assert.equal(hash(bad),before,'failed reads leave image intact');
        await s.command('attach "'+monitorPath(good)+'" 8');
        await s.command('reset 1');await s.wait('0:>');await s.enter('8:','8:>');
        report=await run('dir \\native');
        for(const text of ['Partition type is NATIVE','Directory of 8:\\NATIVE','Disk ID is CT'])
            assert(report.includes(text),report);
        assert(!report.includes('Error'),report);
        await s.enter('cd \\@4','8:\\NATIVE>');
        await s.enter('md docs','8:\\NATIVE>');await s.enter('cd docs','8:\\NATIVE\\DOCS>');
        report=await run('dir','8:\\NATIVE\\DOCS>');
        assert(report.includes('Directory of 8:\\NATIVE\\DOCS'),report);
        await s.enter('cd \\@4','8:\\NATIVE>');
        report=await run('dir \\ /b','8:\\NATIVE>');assert(report.includes('PART13'),report);
        if(source)assert.equal(hash(source),original,'original supplied image untouched');
        console.log('PASS native DIR errors across cold/soft/hard resets, names/aliases, full native listings and temporary selections');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

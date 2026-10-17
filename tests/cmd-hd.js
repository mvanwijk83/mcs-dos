// Integration uses the real purchased boot ROM and HD DOS, with generated media.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup'),{start,fixture,monitorPath}=require('./cmd-hd-session');
const messages=require('./output');
function disk(file,type,label='source'){
    execFileSync(tool('vice','c1541'),['-format',label+',ct',type,file],{stdio:'pipe',windowsHide:true});
}
async function main(){
    const image='build/test-cmd-hd.dhd',stock='build/cmd-stock.d64';
    const parts=await fixture(image);disk(stock,'d64');
    const s=await start(image,stock,true);
    const snapshots=()=>fs.readFileSync(image);
    const part=n=>parts.find(p=>p.number===n);
    function unchangedExcept(before,after,n){
        const p=part(n);assert.deepEqual(after.subarray(0,p.offset),before.subarray(0,p.offset),'prefix outside partition');
        assert.deepEqual(after.subarray(p.offset+p.bytes),before.subarray(p.offset+p.bytes),'suffix outside partition');
    }
    async function attach(){await s.command('attach "'+monitorPath(image)+'" 9');}
    async function flush(){await s.command('detach 9');}
    async function select(n){await s.check('cd \\@'+n,'9:\\@'+n+'>');}
    try{
        let out=await s.check('sysinfo','CMD HD Mass Storage Drive');assert(out.includes('Drive 9:'),out);
        out=await s.check('dir \\ /b','PART13');
        for(const p of parts)assert(out.includes(p.name),out);


        await s.check('cd \\@255',messages.SYSOUT_PARTITION_NOT_FOUND);
        await s.check('cd \\@8',messages.SYSOUT_PARTITION_NOT_FOUND);
        await s.check('cd \\@13','9:\\@13>');
        await s.check('echo thirteen > sentinel','9:>');
        await s.check('type sentinel','thirteen');
        await select(1);await s.check('type sentinel',messages.SYSOUT_FILE_NOT_FOUND);
        await select(13);await s.check('type sentinel','thirteen');
        console.log('PASS partition 13 binary CR query and file-cache invalidation');
        for(const n of [1,2,3]){
            await select(n);
            await s.check('vol','Disk ID is CT');
            await s.check('echo payload'+n+' > sample','9:>');
            await s.check('copy sample 8:sample'+n,messages.SYSOUT_ONE_FILE_COPIED.trim());
            await s.check('type 8:sample'+n,'payload'+n);
            await s.check('ren sample renamed','9:>');
            await s.check('attrib +l renamed','9:>');
            await s.check('attrib renamed','L    RENAMED');
            await s.check('attrib -l renamed','9:>');
            await s.check('label updated',messages.SYSOUT_VOL_LABEL_CHANGED);
            await s.check('diskid xy',messages.SYSOUT_DISK_ID_CHANGED);
            await s.check('vol','Disk ID is XY');
            await s.check('chkdsk /v',messages.SYSOUT_DISK_VALIDATION_COMPLETE);
        }
        console.log('PASS file access, physical-drive copies, labels, IDs, attributes and validation on all emulation formats');
        await select(4);await flush();let before=snapshots();await attach();await select(4);
        for(const cmd of ['format 9:','label rejected','diskid zz','chkdsk /v','diskcopy 9: 8:'])
            await s.check(cmd,messages.SYSOUT_UNSUPPORTED_DISK_FORMAT);
        await flush();assert.deepEqual(snapshots(),before,'native partition rejects writes');await attach();
        console.log('PASS native format rejected before destructive commands');
        for(const [n,model,ext] of [[5,1541,'d64'],[6,1571,'d71'],[7,1581,'d81']]){
            const source='build/cmd-source.'+ext;disk(source,ext);
            const bytes=fs.readFileSync(source);bytes.fill(0x5a,bytes.length-32);fs.writeFileSync(source,bytes);
            await s.command('resourceset "Drive8Type" "'+model+'"');
            await s.command('attach "'+monitorPath(source)+'" 8');
            await select(n);await flush();before=snapshots();await attach();await select(n);
            await s.check('diskcopy 8: 9:',messages.SYSOUT_DISKCOPY_PROCEED.trim());
            await s.enter('y',messages.SYSOUT_COPY_COMPLETE);
            await flush();let after=snapshots();unchangedExcept(before,after,n);
            assert.deepEqual(after.subarray(part(n).offset,part(n).offset+bytes.length),bytes,'physical -> CMD '+model);
            await attach();await select(n);
            const target='build/cmd-target.'+ext;disk(target,ext,'target');
            await s.command('attach "'+monitorPath(target)+'" 8');
            await s.check('diskcopy 9: 8:',messages.SYSOUT_DISKCOPY_PROCEED.trim());
            await s.enter('y',messages.SYSOUT_COPY_COMPLETE);await s.command('detach 8');
            assert.deepEqual(fs.readFileSync(target),bytes,'CMD -> physical '+model);
            console.log('PASS bidirectional '+model+' whole-partition bytes and neighboring partition preservation');
            await flush();before=snapshots();await attach();await select(n);
            await s.check('format 9:',messages.SYSOUT_PROCEED_WITH_FORMAT.trim());
            await s.keys('y');await s.wait(messages.SYSOUT_FORMAT_LABEL_PROMPT.trim());
            await s.enter('formatted',messages.SYSOUT_DISK_ID_PROMPT.trim());
            await s.enter('fm',messages.SYSOUT_FORMAT_COMPLETE);
            await select(n);
            await s.check('vol','Disk ID is FM');
            await flush();after=snapshots();unchangedExcept(before,after,n);await attach();
            console.log('PASS FORMAT '+model+' confined to selected partition');
        }
        // A 1581 source cannot overwrite a 1541 partition.
        disk('build/cmd-mismatch.d81','d81');await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "'+monitorPath('build/cmd-mismatch.d81')+'" 8');
        await select(1);await flush();before=snapshots();await attach();await select(1);
        await s.check('diskcopy 8: 9:',messages.SYSOUT_INCOMPATIBLE_DRIVE);
        await flush();assert.deepEqual(snapshots(),before,'mismatch leaves entire HD unchanged');
        console.log('PASS mismatched partition refused without writes');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

// Disposable images: full 1581 format from a nested path and CMD HD rejection.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process'),{tool}=require('./setup');
const {fixture,start,monitorPath}=require('./cmd-hd-session');
const messages=require('./output');
const monitor=require('./monitor');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
    const hd='build/format-disk.dhd',disk='build/format-disk.d81';
    await fixture(hd);
    execFileSync(tool('vice','c1541'),['-format','before,ct','d81',disk],{stdio:'pipe',windowsHide:true});
    const s=await start(hd,disk,true);
    try{
        await s.enter('cd \\@4','9:\\@4>');
        await s.enter('md child','9:\\@4>');
        await s.enter('cd child','9:\\@4\\CHILD>');
        const before=hash(hd);
        await s.enter('cls','9:\\@4\\CHILD>');
        let out=await s.enter('format 9: /v:denied /id:xx','9:\\@4\\CHILD>');
        assert(out.includes(messages.SYSOUT_FORMAT_CMD_HD_UNSUPPORTED),out);
        assert(!out.includes(messages.SYSOUT_PROCEED_WITH_FORMAT),out);
        assert.equal(hash(hd),before,'HD rejection leaves all disk bytes unchanged');
        await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "'+monitorPath(disk)+'" 8');
        await s.enter('8:','8:\\>');
        await s.enter('md outer /size:400','8:\\>');
        await s.enter('cd outer','8:\\OUTER>');
        await s.enter('md inner /size:120','8:\\OUTER>');
        await s.enter('cd inner','8:\\OUTER\\INNER>');
        await s.enter('echo payload > file','8:\\OUTER\\INNER>');
        // Visiting track 40 flushes the 1581's dirty child-track cache before
        // taking the byte-preservation snapshot for the cancellation check.
        await s.enter('dir \\ /b','8:\\OUTER\\INNER>');
        const populated=hash(disk);
        await s.enter('format 8: /v:cancelled /id:cc',messages.SYSOUT_PROCEED_WITH_FORMAT);
        await s.keys('n');await s.wait('8:\\OUTER\\INNER>');
        assert.equal(hash(disk),populated,'declined format preserves the image');
        await s.enter('cls','8:\\OUTER\\INNER>');
        await s.enter('format /v:"WHOLE DISK" 8: /id:Z9',messages.SYSOUT_PROCEED_WITH_FORMAT);
        await s.keys('y');out=await s.wait('8:\\>',120000);
        assert(out.includes(messages.SYSOUT_FORMAT_COMPLETE),out);
        assert(!out.includes(messages.SYSOUT_FORMAT_LABEL_PROMPT),out);
        assert(!out.includes(messages.SYSOUT_DISK_ID_PROMPT),out);
        await s.enter('cls','8:\\>');out=await s.enter('chkdsk','8:\\>');
        assert(out.includes('Volume WHOLE DISK')&&out.includes('Disk ID is Z9'),out);
        assert(out.includes('0 bytes allocated in 0 files')&&out.includes('3,160 available blocks'),out);
        await s.command('detach 8');
        const bytes=fs.readFileSync(disk),header=(40-1)*40*256;
        assert.equal(bytes.subarray(header+4,header+20).toString('latin1').replace(/\xa0+$/,'').toUpperCase(),'WHOLE DISK');
        assert.equal(bytes.subarray(header+22,header+24).toString().toUpperCase(),'Z9');
        assert.equal(require('./directory-image')(bytes,40,40).size,0,'no surviving root files or partitions');
        console.log('PASS whole-disk 1581 FORMAT from nested directory, quoted switches, confirmation, root recovery and unchanged HD');
        // Protocol probe only: substitute the resident model query and NEW
        // sender, so the final PETSCII cartridge can be checked without FD ROM.
        await s.command('attach "'+monitorPath(disk)+'" 8');
        const labels=fs.readFileSync('build/easyflash/shell.lbl','utf8');
        const address=name=>parseInt(labels.match(new RegExp('^al ([0-9a-f]+) \\.'+name+'$','m'))[1],16);
        const model=address('drivemodel'),sender=address('command'),buffer=address('fmtbuf');
        const savedModel=await monitor.memory(s.command,model,model+4),savedSender=await monitor.memory(s.command,sender,sender+4);
        const patch=(at,values)=>s.command('> '+at.toString(16)+' '+values.map(x=>x.toString(16).padStart(2,'0')).join(' '));
        const unchanged=hash(disk);
        try{
            // Public resident functions return bytes through Oscar64's ACCU.
            const asm=fs.readFileSync('build/easyflash/shell-prg.asm','utf8');
            const accu=parseInt(asm.match(/85 ([0-9a-f]{2}) __ STA ACCU \+ 0/)[1],16);
            await patch(model,[0xa9,7,0x85,accu,0x60]);await patch(sender,[0xa9,1,0x85,accu,0x60]);
            for(const format of ['81','DD8','HD8','ED8','DDN','HDN','EDN','S8','SN']){
                await s.enter('cls','8:\\>');
                await s.enter('format 8: /f:'+format.toLowerCase()+' /v:safe /id:fm',messages.SYSOUT_PROCEED_WITH_FORMAT);
                await s.keys('y');out=await s.wait('8:\\>');
                assert(out.includes(messages.SYSOUT_FORMAT_COMPLETE),out);
                const bytes=await monitor.memory(s.command,buffer,buffer+63);
                const text=Buffer.from(bytes.slice(0,bytes.indexOf(0))).toString('latin1');
                assert.equal(text,'N0:SAFE,FM,'+format,'actual linked PETSCII NEW command bytes');
            }
        }finally{await patch(model,savedModel);await patch(sender,savedSender);}
        await s.command('detach 8');assert.equal(hash(disk),unchanged);
        console.log('PASS nine CMD FD format extensions in the linked cartridge (protocol simulation, no FD hardware)');
        const blank='build/format-disk-blank.d81';
        fs.writeFileSync(blank,Buffer.alloc(819200));
        await s.command('attach "'+monitorPath(blank)+'" 8');
        await s.enter('0:','0:\\>');
        await s.enter('format 8: /v:blank /id:bl',messages.SYSOUT_PROCEED_WITH_FORMAT);
        await s.keys('y');out=await s.wait('0:\\>',120000);
        assert(out.includes(messages.SYSOUT_FORMAT_COMPLETE),out);
        await s.enter('8:','8:\\>');out=await s.enter('chkdsk','8:\\>');
        assert(out.includes('3,160 available blocks')&&out.includes('0 bytes allocated in 0 files'),out);
        console.log('PASS initially unformatted 1581 disk and preservation of a different selected drive');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

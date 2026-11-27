const assert=require('assert/strict'),fs=require('fs'),{execFileSync}=require('child_process');
const {tool}=require('./setup');
const messages=require('./output');
require('./shell')('label-id',async ({disk,command,keys,enter,until})=>{
    const floppy81=disk.replace(/\.d64$/,'.d81');
    execFileSync(tool('vice','c1541'),['-format','test,mc','d81',floppy81],
                 {stdio:'pipe',windowsHide:true});
    for(const [model,file,header,label,id] of [[1541,disk,17*21*256,144,162],
                                            [1581,floppy81,39*40*256,4,22]]){
        if(model===1581){
            await command('detach 8');await command('resourceset "Drive8Type" "1581"');
            await command(`attach "${file}" 8`);await enter('reboot');await enter('8:');
        }
        await enter('cls');let s=await enter('label "KEPT NAME"');
        assert(s.includes(messages.SYSOUT_VOL_LABEL_CHANGED),s);
        s=await enter('label /i ab');assert(s.includes(messages.SYSOUT_DISK_ID_CHANGED),s);
        await enter('cls');s=await enter('vol');
        assert(s.includes('KEPT NAME')&&s.includes('Disk ID is AB'),s);
        await enter('cls');await keys('label 8: /i\\x0d');
        await until(s=>s.includes(messages.SYSOUT_DISK_ID_PROMPT.trim()));
        await keys('z9\\x0d');s=await until(s=>s.endsWith('8:\\>'));
        assert(s.includes(messages.SYSOUT_DISK_ID_CHANGED),s);
        await enter('cls');s=await enter('vol');assert(s.includes('Disk ID is Z9'),s);
        await command('detach 8');
        const bytes=fs.readFileSync(file);
        assert.equal(bytes.subarray(header+label,header+label+9).toString(),'KEPT NAME');
        assert.equal(bytes.subarray(header+id,header+id+2).toString(),'Z9');
        if(model===1581)for(const sector of [1,2])
            assert.equal(bytes.subarray(header+sector*256+4,header+sector*256+6).toString(),'Z9');
        await command(`attach "${file}" 8`);
    }
    await enter('cls');let s=await enter('diskid');assert(s.includes(messages.SYSOUT_BAD_CMD_OR_FILE_NAME),s);
    await enter('cls');s=await enter('label /?');
    assert(s.includes("Changes the disk's two-character ID."),s);
    console.log('PASS cartridge LABEL /I arguments/prompts, unchanged names, 1541/1581 disk bytes, help and removed DISKID');
}).catch(e=>{console.error(e);process.exitCode=1;});

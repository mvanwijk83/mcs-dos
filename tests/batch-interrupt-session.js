const assert=require('assert/strict'),fs=require('fs'),{execFileSync}=require('child_process');
const {tool}=require('./setup');
require('./shell')('batch-interrupt',async ({disk,command,keys,enter,until})=>{
    for(const [name,body] of [['pause','@echo off\rpause waiting\recho continued\rpause second\recho forbidden\r'],
                             ['beep','@echo off\rbeep 60000\recho forbidden\r']]){
        const file='build/interrupt-'+name+'.bat';
        fs.writeFileSync(file,require('../scripts/petscii')(body));
        execFileSync(tool('vice','c1541'),['-attach',disk,'-write',file,name+'.bat,s'],{stdio:'pipe',windowsHide:true});
    }
    await command(`attach "${disk}" 8`);
    await keys('pause.bat\\x0d');await until(s=>s.includes('waiting'));
    await keys('\\x03');await until(s=>s.includes('Terminate batch job (Y/N)?'));
    await keys('n');let s=await until(s=>s.includes('second'));
    assert(s.includes('continued'),s);
    await keys('\\x03');await until(s=>s.trimEnd().endsWith('(Y/N)?'));
    await keys('y');s=await until(s=>s.endsWith('8:\\>'));assert(!s.includes('forbidden'),s);
    await enter('cls');await keys('beep.bat\\x0d');
    await keys('\\x03');await until(s=>s.includes('Terminate batch job (Y/N)?'));
    await keys('y');s=await until(s=>s.endsWith('8:\\>'));assert(!s.includes('forbidden'),s);
    await enter('cls');await keys('\\x03');
    s=await enter('echo interactive');assert(!s.includes('Terminate batch job'),s);
    console.log('PASS real PAUSE/BEEP batch interruption, N continuation, Y termination and interactive RUN/STOP');
}).catch(e=>{console.error(e);process.exitCode=1;});

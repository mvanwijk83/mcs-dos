// Run the compiled host backend against real CMD DOS's compatible file/directory
// commands. Model detection and the legacy absolute-root spelling are adapted:
// this is not SD2IEC emulation.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup'),{fixture,start,monitorPath}=require('./cmd-hd-session');
const decode=require('./directory-image');
const messages=require('./output');
async function main(){
    const sd=process.argv.includes('--sd2iec'),base='build/host-session'+(sd?'-sd':'');
    const hd=base+'.dhd',disk=base+'.d64',parts=await fixture(hd);
    const bytes=fs.readFileSync(hd),first=parts[0],native=parts.find(p=>p.type===1);
    bytes.copy(bytes,first.offset,native.offset,native.offset+native.bytes);
    const table=384*512+65536+32;bytes[table+2]=1;bytes.writeUInt16BE(native.bytes/512,table+30);
    fs.writeFileSync(hd,bytes);
    execFileSync(tool('vice','c1541'),['-format','source,hs','d64',disk],{stdio:'pipe',windowsHide:true});
    const s=await start(hd,disk,true);let prompt='9:\\>';
    async function run(line,expected,next=prompt){
        if(sd){line=line.replaceAll('\\usb1','\\@1\\usb1');if(expected)expected=expected.replaceAll('\\USB1','\\@1\\USB1');if(!next.includes('\\@1'))next=next.replaceAll('\\USB1','\\@1\\USB1');}
        await s.enter('cls',prompt);const out=await s.enter(line,expected||next);await s.wait(next);prompt=next;
        console.log('PASS '+line);return out;
    }
    try{
        await run('cd \\@1',null,'9:\\@1>');await run('md usb1');await run('0:',null,'0:\\>');
        const crt=fs.readFileSync('build/easyflash/MCS-DOS.crt');
        const address=parseInt(fs.readFileSync('build/easyflash/shell.lbl','utf8').match(/^al ([\da-f]+) \.bank_drivemodel$/m)[1],16);
        let patched=false;
        for(let at=64;at<crt.length;at+=crt.readUInt32BE(at+4))
            if(crt.readUInt16BE(at+10)===12&&crt.readUInt16BE(at+12)===0xa000){
                Buffer.from([0xa9,sd?9:8,0x85,0x1b,0x60]).copy(crt,at+16+address-0xa000);patched=true;
            }
        assert(patched);
        if(sd){
            const hidden=crt.indexOf(Buffer.from('$*=H\0'));assert(hidden>=0);
            Buffer.from('$\0\0\0\0').copy(crt,hidden);
        }else{
            const legacyRoot=crt.indexOf(Buffer.from('CD:/\0'));
            assert(legacyRoot>=0,'legacy SoftIEC absolute-root command is present');
            Buffer.from('CD//\0').copy(crt,legacyRoot);
        }
        fs.writeFileSync(base+'.crt',crt);
        await s.command('attach "'+monitorPath(base+'.crt')+'" $20');await s.command('reset 1');await s.wait('0:\\>');
        await run('9:',null,'9:\\>');let out=await run('dir');assert(out.includes(sd?'<FAT>':'USB1'),out);
        await run('md forbidden',messages.SYSOUT_VIRTUAL_ROOT_NO_FILES);
        if(sd)await run('cd \\@1',null,'9:\\@1>');
        await run('cd usb1',null,'9:\\USB1>');await run('echo original > note');
        if(process.argv.includes('--listing')){
            out=await run('dir');assert(out.includes('NOTE')&&!out.includes('~'),out);
            out=await run('dir /on');assert(out.includes('NOTE'),out);
            await run('dir > 0:host-list');await run('type 0:host-list','NOTE');
            await run('md child');await run('cd child',null,'9:\\USB1\\CHILD>');
            await run('cd..',null,'9:\\USB1>');
            console.log('PASS buffered linked host DIR, sorted DIR, redirected DIR and directory lookup');
            return;
        }
        await run('md source');await run('cd source',null,'9:\\USB1\\SOURCE>');
        await run('echo alpha > one.txt');await run('echo beta > two.txt');
        // CMD DOS cannot stand in for the Ultimate UCI rename workaround.
        // Its original DOS-target protocol is covered by softiec-rename.
        const target=sd?'target':'renamed';
        await run('cd..',null,'9:\\USB1>');await run('md '+target);
        await run('copy source\\*.txt '+target+' /p','2 file(s) copied.');
        await run('type '+target+'\\one.txt','alpha');
        if(sd)await run('move target renamed');
        await run('cd renamed',null,'9:\\USB1\\RENAMED>');
        await run('type two.txt','beta');await run('copy \\usb1\\note',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('copy note 0:host-note /p',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('type 0:host-note','original');
        await run('copy 0:host-note copiedback /p',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('type copiedback','original');
        await s.enter('basic','ready.');
        await s.enter('open15,9,15,"cd//":close15','ready.');
        await s.enter('shell',prompt);
        console.log('PASS BASIC return restores host directory after external CD');
        out=await run('dir /on');assert(out.includes('NOTE')&&out.includes('ONE.TXT')&&out.includes('TWO.TXT'),out);
        await run('dir /s > \\usb1\\listing');await run('type \\usb1\\listing','9:\\USB1\\RENAMED\\ONE.TXT');
        await run('type one.txt > \\usb1\\copied');await run('type \\usb1\\copied','alpha');
        await run('dir > 0:host-list');await run('type 0:host-list','ONE.TXT');
        await run('cd..',null,'9:\\USB1>');
        await run('echo image > image.d81');await run('cd image.d81',messages.SYSOUT_DIRECTORY_NOT_FOUND);
        await run('rd renamed',messages.SYSOUT_DIRECTORY_NOT_EMPTY);
        await run('rd renamed /s /p');await run('rd source /s /p');
        await run('del *.txt /p',messages.SYSOUT_FILE_NOT_FOUND);
        await run('chkdsk',messages.SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        await run('diskinit',messages.SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        await run('dir /s');await s.command('detach 9');
        const b=fs.readFileSync(hd).subarray(first.offset,first.offset+native.bytes),root=decode(b,256,1,1);
        const u=root.get('USB1'),files=decode(b,256,u.track,u.sector);
        assert(!files.has('RENAMED')&&!files.has('SOURCE'));
        assert.equal(files.get('NOTE').data.toString(),'ORIGINAL\r');
        assert.equal(files.get('COPIED').data.toString(),'ALPHA\r');
        require('./native-allocation')(b);
        console.log('PASS linked streaming host backend, directory commands, same-device file copies, redirection, root protection and no implicit mounting');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

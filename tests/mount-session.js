// Execute the linked media state against real CMD DOS. A test-only IEC shim
// maps SD2IEC image entry/exit to CMD emulation partitions. This verifies shell
// integration, not SD2IEC firmware; mount-lifecycle covers the actual CD packets.
require('./setup');
const fs=require('fs'),assert=require('assert/strict');
const {start,fixture,monitorPath}=require('./cmd-hd-session');
const messages=require('./output');
const monitor=require('./monitor');
function label(name){const m=fs.readFileSync('build/easyflash/shell.lbl','utf8').match(new RegExp('^al ([0-9a-f]+) \\.'+name+'$','m'));assert(m,name);return parseInt(m[1],16);}
function shim(command,mounts,bypass){
    const bytes=[],labels={},fix=[];const emit=(...b)=>bytes.push(...b);
    const mark=n=>labels[n]=bytes.length;
    const jump=n=>{emit(0x4c,0,0);fix.push([bytes.length-2,n]);};
    const branch=(op,n)=>{emit(op^0x20,3);jump(n);};
    emit(0xa5,0x0d,0x48,0xa5,0x0e,0x48);
    emit(0xa0,2,0xb1,0x23,0xc9,8);branch(0xd0,'forward');
    emit(0xa0,3,0xb1,0x23,0x85,0x0d,0xc8,0xb1,0x23,0x85,0x0e);
    emit(0xa0,0,0xb1,0x0d,0xc9,67);branch(0xd0,'forward');
    emit(0xc8,0xb1,0x0d,0xc9,68);branch(0xd0,'forward');
    emit(0xc8,0xb1,0x0d,0xc9,47);branch(0xf0,'root');
    emit(0xc9,58);branch(0xd0,'forward');
    emit(0xc8,0xb1,0x0d,0x29,0x7f,0xc9,95);branch(0xf0,'host');
    emit(0xc9,71);branch(0xf0,'d64');
    emit(0xc9,78);branch(0xf0,'d81');
    emit(0xc9,66);branch(0xf0,'bad');jump('forward');
    mark('root');emit(0xad,bypass&255,bypass>>8);branch(0xd0,'host');
    emit(0xad,mounts&255,mounts>>8);branch(0xf0,'host');
    emit(0xad,(mounts+3)&255,(mounts+3)>>8,0xc9,3);branch(0xf0,'d81');jump('d64');
    mark('host');emit(0xa9,0);jump('replace');
    mark('d64');emit(0xa9,4);jump('replace');
    mark('d81');emit(0xa9,8);jump('replace');
    mark('bad');emit(0xa9,12);
    mark('replace');emit(0xa0,3,0x91,0x23,0xa9,0xc5,0xc8,0x91,0x23);
    mark('forward');emit(0x68,0x85,0x0e,0x68,0x85,0x0d,0x38,0xa5,0x23,0x4c,(command+3)&255,(command+3)>>8);
    for(const [at,n]of fix){const dest=0xc300+labels[n];bytes[at]=dest&255;bytes[at+1]=dest>>8;}
    assert(bytes.length<0x200);while(bytes.length<0x200)bytes.push(0);
    bytes.push(...Buffer.from('CP4\0CP1\0CP3\0CP8\0'));
    return bytes;
}

async function main(){
    const image='build/mount-session.dhd';await fixture(image);
    const command=label('command'),mounts=label('mounts'),bypass=label('mount_bypass'),crt=fs.readFileSync('build/easyflash/MCS-DOS.crt');
    function patch(bank,address,data){let hit=false;for(let p=64;p<crt.length;p+=crt.readUInt32BE(p+4))
        if(crt.readUInt16BE(p+10)===bank&&address>=crt.readUInt16BE(p+12)&&address+data.length<=crt.readUInt16BE(p+12)+8192){Buffer.from(data).copy(crt,p+16+address-crt.readUInt16BE(p+12));hit=true;}assert(hit,'patch '+bank+':'+address.toString(16));}
    patch(12,label('bank_drivemodel'),[0xa9,9,0x85,0x1b,0x60]);
    const payload=16384+command-0x801,bank=payload>>14,side=payload&0x3fff;
    patch(bank,0x8000+side,[0x4c,0,0xc3]);
    const hidden=crt.indexOf(Buffer.from('$*=H\0'));assert(hidden>=0);Buffer.from('$\0\0\0\0').copy(crt,hidden);
    fs.writeFileSync('build/mount-session.crt',crt);
    const s=await start(image,null,false,true);let prompt='8:\\@4>';
    async function run(line,expected=prompt){
        await s.enter('cls',prompt);const out=await s.enter(line,expected);await s.wait(prompt);console.log('PASS '+line);return out;
    }
    async function replace(name,answer){
        await s.enter('cls',prompt);
        const out=await s.enter('mount '+name,messages.SYSOUT_REPLACE_MOUNT);
        assert(!out.includes('(Y/N) (Y/N)'),out);
        await s.keys(answer);const result=await s.wait(prompt);console.log('PASS mount '+name+' answered '+answer);return result;
    }
    try{
        await s.command('attach "'+monitorPath('build/mount-session.crt')+'" $20');await s.command('reset 1');await s.wait('0:>');
        const program=shim(command,mounts,bypass);
        for(let at=0;at<program.length;at+=32)
            await s.command('> '+(0xc300+at).toString(16)+' '+program.slice(at,at+32).map(b=>b.toString(16).padStart(2,'0')).join(' '));
        console.log('PASS installed image-command stand-in');
        await s.enter('8:','8:>');console.log('PASS selected SD2IEC stand-in');await s.enter('cd \\@4',prompt);
        await run('echo image > game.d64');await run('echo image > next.d81');
        let out=await run('dir game.d64');assert(out.includes('GAME.D64')&&/GAME\.D64\s+D64\s/.test(out),out);
        await run('cd game.d64',messages.SYSOUT_DIRECTORY_NOT_FOUND);await run('rd game.d64',messages.SYSOUT_DIRECTORY_NOT_FOUND);
        await s.enter('cls',prompt);prompt='8:\\>';out=await s.enter('mount game.d64',prompt);assert(out.includes('GAME.D64 mounted to drive 8'),out);
        out=await run('dir');assert(out.includes('Directory of 8:\\'),out);
        await run('echo disk > note');out=await run('chkdsk');assert(out.includes('bytes allocated in 1 files'),out);
        out=await replace('next.d81','n');assert(!out.includes('NEXT.D81 mounted'),out);
        out=await run('type note');assert(out.includes('disk'),out);
        out=await replace('next.d81','y');assert(out.includes('NEXT.D81 mounted to drive 8'),out);
        out=await run('chkdsk');assert(out.includes('809,')||out.includes('blocks on disk'),out);
        out=await replace('bad.d64','y');assert(out.includes('Cannot mount BAD.D64'),out);
        out=await run('dir');assert(out.includes('1581'),out);
        const owned=await monitor.memory(s.command,mounts,mounts+446),host=label('mount_hostdir');
        const hostdir=await monitor.memory(s.command,host,host+127);
        assert.deepEqual(owned.slice(0,4),[8,8,9,3]);
        await s.enter('basic','ready.');await s.enter('open15,8,15,"cp4":close15','ready.');await s.enter('shell',prompt);
        assert.deepEqual(await monitor.memory(s.command,mounts,mounts+446),owned,'saved mount records');
        assert.deepEqual(await monitor.memory(s.command,host,host+127),hostdir,'saved host directory');
        out=await run('dir');assert(out.includes('1581'),out);
        await s.enter('cls',prompt);prompt='8:\\@4>';out=await s.enter('unmount',prompt);assert(out.includes('Drive 8 unmounted'),out);
        out=await run('dir game.d64');assert(/GAME\.D64\s+D64\s/.test(out),out);
        await s.enter('set driveids=dos','A:\\@4>');prompt='A:\\@4>';
        await s.enter('cls',prompt);prompt='A:\\>';out=await s.enter('mount game.d64',prompt);assert(out.includes('mounted to drive A'),out);
        await s.enter('unmount','A:\\@4>');
        console.log('PASS linked mount/unmount, disk roots, DIR image types, CHKDSK, cancellation/replacement/rollback, BASIC restoration and DRIVEIDS');
    }catch(e){
        console.log('CPU',await s.command('r'));
        console.log('IEC',await s.command('m b8 ba'));
        console.log('REGISTERS',await s.command('m 0d 26'));
        console.log('MOUNTS',await s.command('m '+mounts.toString(16)+' '+(mounts+20).toString(16)));
        throw e;
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

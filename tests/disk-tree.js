// Disk-wide commands on disposable nested D81 and mixed CMD HD filesystems.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup'),{fixture,start,monitorPath}=require('./cmd-hd-session');
const decode=require('./directory-image'),messages=require('./output');
const at=(t,s=0)=>((t-1)*40+s)*256;
function reserve81(bytes,header,track,sector){
    const p=at(header,track<=40?1:2)+16+((track-1)%40)*6,bit=1<<(sector%8),q=p+1+(sector>>3);
    assert(bytes[q]&bit,'inject only an orphan free sector');bytes[q]&=~bit;--bytes[p];return {q,bit};
}
async function main(){
    const hd='build/disk-tree.dhd',disk='build/disk-tree.d81',parts=await fixture(hd);
    execFileSync(tool('vice','c1541'),['-format','rootdisk,rt','d81',disk],{stdio:'pipe',windowsHide:true});
    const s=await start(hd,disk,true);
    let prompt='9:\\>';
    async function run(line,expected,next=prompt){
        await s.enter('cls',prompt);
        const out=await s.enter(line,expected||next);await s.wait(next);prompt=next;
        console.log('PASS '+line);return out;
    }
    try{
        await s.command('resourceset "Drive8Type" "1581"');await s.command('attach "'+monitorPath(disk)+'" 8');
        await run('8:',null,'8:\\>');await run('md outer /size:400');await run('cd outer',null,'8:\\OUTER>');
        await run('md inner /size:120');await run('cd inner',null,'8:\\OUTER\\INNER>');await run('echo intact > note');
        let out=await run('dir');
        assert(out.toUpperCase().includes('ROOTDISK')&&out.toUpperCase().includes('DISK ID IS RT'),out);
        await run('dir \\ /b');await s.command('detach 8');
        let bytes=fs.readFileSync(disk),root=decode(bytes,40,40),outer=root.get('OUTER').track;
        const inner=decode(bytes,40,outer).get('INNER').track;
        const checks=[reserve81(bytes,40,80,39),reserve81(bytes,outer,outer+4,39),reserve81(bytes,inner,inner+2,39)];
        fs.writeFileSync(disk,bytes);await s.command('attach "'+monitorPath(disk)+'" 8');
        out=await run('chkdsk /v',messages.SYSOUT_DISK_VALIDATION_COMPLETE);
        assert(!out.includes(messages.SYSOUT_DISK_VALIDATION_FAILED),out);
        await run('type note','intact');await run('dir \\ /b');await s.command('detach 8');
        bytes=fs.readFileSync(disk);for(const {q,bit} of checks)assert(bytes[q]&bit,'all three 1581 BAMs repaired');
        await s.command('attach "'+monitorPath(disk)+'" 8');
        console.log('PASS disk-wide 1581 VALIDATE repairs root and nested BAMs, preserving cwd and files');

        await run('9:',null,'9:\\>');out=await run('dir');assert(!out.includes('Partition type is'),out);
        for(const [number,type] of [[1,'1541'],[2,'1571'],[3,'1581'],[4,'NATIVE']]){
            out=await run('dir \\@'+number);assert(out.includes('Partition type is '+type),out);
        }
        await run('cd \\@4',null,'9:\\@4>');await run('md parent');await run('cd parent',null,'9:\\@4\\PARENT>');
        await run('md old');await run('cd old',null,'9:\\@4\\PARENT\\OLD>');await run('echo native > note');
        out=await run('dir');assert(out.includes('Volume in drive 9: is NATIVE')&&out.includes('Partition type is NATIVE')&&out.includes('Disk ID is CT'),out);
        await run('cd ..',null,'9:\\@4\\PARENT>');await run('ren old new');
        await run('cd new',null,'9:\\@4\\PARENT\\NEW>');await run('type note','native');
        out=await run('diskinit',messages.SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        await run('cd ..',null,'9:\\@4\\PARENT>');await run('rd new',messages.SYSOUT_DIRECTORY_NOT_EMPTY);
        await run('rd new /s /p',messages.SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        await run('md empty');await run('rd empty');
        await run('cd \\@3',null,'9:\\@3>');await run('md slice /size:120');
        await run('cd slice',null,'9:\\@3\\SLICE>');await run('echo emulated > data');
        out=await run('dir');assert(out.includes('Partition type is 1581')&&out.toUpperCase().includes('DISK ID IS CT'),out);
        await run('cd \\@4\\parent\\new',null,'9:\\@4\\PARENT\\NEW>');
        await s.command('detach 9');let image=fs.readFileSync(hd),repairs=[];
        for(const part of parts){
            const b=image.subarray(part.offset,part.offset+part.bytes);
            if(part.type===2||part.type===3){
                let bam=0;for(let t=1;t<18;++t)bam+=(t<=17?21:t<=24?19:t<=30?18:17)*256;
                const q=bam+4+29*4;assert(b[q+1]&1);--b[q];b[q+1]&=~1;repairs.push({q:part.offset+q+1,bit:1});
            }else if(part.type===4){
                const check=reserve81(b,40,60,39);repairs.push({q:part.offset+check.q,bit:check.bit});
                if(part.number===3){
                    const child=decode(b,40,40).get('SLICE').track,c=reserve81(b,child,child+2,39);
                    repairs.push({q:part.offset+c.q,bit:c.bit});
                }
            }else if(part.type===1){
                const q=512+32+25;assert(b[q]&1);b[q]&=~1;repairs.push({q:part.offset+q,bit:1});
                const parent=decode(b,256,1,1).get('PARENT'),newdir=decode(b,256,parent.track,parent.sector).get('NEW');
                const header=((newdir.track-1)*256+newdir.sector)*256;
                assert.equal(b.subarray(header+4,header+20).toString('latin1').replace(/\xa0+$/,''),'NEW','REN also updates native directory header');
            }
        }
        fs.writeFileSync(hd,image);await s.command('attach "'+monitorPath(hd)+'" 9');
        out=await run('chkdsk /v',messages.SYSOUT_DISK_VALIDATION_COMPLETE);
        assert(!out.includes(messages.SYSOUT_DISK_VALIDATION_FAILED),out);
        await run('type note','native');await s.command('detach 9');image=fs.readFileSync(hd);
        for(const {q,bit} of repairs)assert(image[q]&bit,'every CMD partition and nested 1581 BAM repaired');
        const native=parts.find(p=>p.type===1);
        const audit=require('./native-allocation')(image.subarray(native.offset,native.offset+native.bytes));
        assert(audit.files>0,'native allocation audit includes nested file chains');
        console.log('PASS CMD disk-wide validation, native MD/RD/REN, partition headers and DISKINIT rejection');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

// Check actual 40-column screen rows and redirected DIR output through drive ROMs.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup'),{fixture,start,monitorPath}=require('./cmd-hd-session');
const decode=require('./directory-image');
async function main(){
    const hd='build/dir-layout.dhd',disk='build/dir-layout.d81';await fixture(hd);
    execFileSync(tool('vice','c1541'),['-format','layout,ly','d81',disk],{stdio:'pipe',windowsHide:true});
    const s=await start(hd,disk,true);let prompt='9:\\>';
    async function run(line,next=prompt){
        await s.enter('cls',prompt);const out=await s.enter(line,next);prompt=next;
        console.log('PASS '+line);return out;
    }
    function footer(out,directories){
        const rows=out.split('\n'),file=rows.find(s=>/^ *\d+ File\(s\)/.test(s));
        const free=rows.find(s=>/bytes free$/.test(s));assert(file&&free,out);
        assert.equal(file.indexOf('bytes')+5,31,file);assert.equal(free.indexOf('bytes')+5,31,free);
        assert.equal(/Dir\(s\)/.test(free),directories,free);
        assert(!rows.some(s=>/^ *\d+ Dir\(s\) *$/.test(s)),out);
    }
    try{
        await s.command('resourceset "Drive8Type" "1581"');await s.command('attach "'+monitorPath(disk)+'" 8');
        await run('8:','8:\\>');await run('echo example > readme');await run('md child /size:120');
        let out=await run('dir');
        const row='README           SEQ        256 (  1 bl)';
        assert(out.split('\n').includes(row),out);footer(out,true);
        await run('cd child','8:\\CHILD>');out=await run('dir');
        assert(out.split('\n').includes('.                <DIR>'),out);
        assert(out.split('\n').includes('..               <DIR>'),out);footer(out,true);
        await run('cd\\','8:\\>');
        await run('0:','0:\\>');out=await run('dir 8:\\child');
        assert(out.includes('Directory of 8:\\CHILD')&&out.includes('is LAYOUT'),out);
        footer(out,true);
        await run('8:','8:\\>');await run('dir > listing');await s.command('detach 8');
        const listing=Array.from(decode(fs.readFileSync(disk),40,40).get('LISTING').data,
            b=>String.fromCharCode(b>=0xc1&&b<=0xda?b-128:b)).join('').toUpperCase();
        assert(listing.split('\r').includes(row.toUpperCase()),listing);
        assert(!listing.includes(row.toUpperCase()+'\r\r'),listing);
        await s.command('attach "'+monitorPath(disk)+'" 8');
        await run('9:','9:\\>');out=await run('dir');
        for(const [name,type] of [['1541','1541'],['1571','1571'],['1581','1581'],['NATIVE','NATIVE']]){
            const line=name.padEnd(17)+'<DIR>'+('<'+type+'>').padStart(18);
            assert.equal(line.length,40);assert(out.split('\n').includes(line),out);
        }
        assert(out.includes('  8 Dir(s)'),out);
        await run('cd \\@1','9:\\1541>');out=await run('dir');footer(out,true);
        // A plain 1541 has no directory count; its free bytes retain their column.
        await s.command('resourceset "Drive8Type" "1541"');
        execFileSync(tool('vice','c1541'),['-format','flat,fl','d64','build/dir-layout.d64'],{stdio:'pipe',windowsHide:true});
        await s.command('attach "'+monitorPath('build/dir-layout.d64')+'" 8');
        out=await run('dir 8:');footer(out,false);
        console.log('PASS real-ROM DIR rows, CMD root partition types, dot entries, aligned free bytes and redirection');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

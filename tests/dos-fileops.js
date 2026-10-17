// DOS MOVE directory renames and implicit COPY destinations on real drive DOS.
require('./setup');
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup'),{fixture,start,monitorPath}=require('./cmd-hd-session');
const decode=require('./directory-image'),messages=require('./output');
async function main(){
    const hd='build/dos-fileops.dhd',disk='build/dos-fileops.d81',parts=await fixture(hd);
    execFileSync(tool('vice','c1541'),['-format','fileops,fo','d81',disk],{stdio:'pipe',windowsHide:true});
    const s=await start(hd,disk,true);let prompt='9:\\>';
    async function run(line,expected,next=prompt){
        await s.enter('cls',prompt);
        const out=await s.enter(line,expected||next);await s.wait(next);prompt=next;
        console.log('PASS '+line);return out;
    }
    try{
        await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "'+monitorPath(disk)+'" 8');
        await run('8:',null,'8:\\>');await run('md part1 /size:240');
        await run('cd part1',null,'8:\\PART1>');
        await run('echo alpha > one.txt');await run('echo beta > two.txt');
        await run('echo other > skip.dat');await run('cd\\',null,'8:\\>');
        await run('copy 8:\\part1\\*.txt','2 file(s) copied.');
        await run('copy 8:\\part1\\one.txt /p',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('copy one.txt',messages.SYSOUT_FILE_COPY_ON_SELF);
        await run('copy \\part1\\*.missing',messages.SYSOUT_FILE_NOT_FOUND);
        await run('move part1 renamed /p');await run('cd renamed',null,'8:\\RENAMED>');
        await run('type one.txt','alpha');await run('cd\\',null,'8:\\>');
        await run('md occupied /size:120');
        await run('move renamed occupied',messages.SYSOUT_FILE_OR_DIRECTORY_EXISTS);
        await run('move renamed one.txt /p',messages.SYSOUT_FILE_OR_DIRECTORY_EXISTS);
        await run('move renamed 9:\\elsewhere',messages.SYSOUT_CANNOT_RENAME_ACROSS_DRIVES);
        await run('move two.txt occupied',messages.SYSOUT_ONE_FILE_MOVED.trim());
        await run('move one.txt',messages.SYSOUT_SYNTAX_MOVE);
        await run('dir \\ /b');await s.command('detach 8');
        let bytes=fs.readFileSync(disk),root=decode(bytes,40,40);
        assert(!root.has('PART1')&&root.has('RENAMED'));
        assert.equal(root.get('ONE.TXT').data.toString(),'ALPHA\r');
        assert(!root.has('TWO.TXT')&&!root.has('SKIP.DAT'));
        const source=decode(bytes,40,root.get('RENAMED').track);
        assert.equal(source.size,3);assert.deepEqual(root.get('ONE.TXT').data,source.get('ONE.TXT').data);
        assert.equal(decode(bytes,40,root.get('OCCUPIED').track).get('TWO.TXT').data.toString(),'BETA\r');
        await s.command('attach "'+monitorPath(disk)+'" 8');
        await run('9:',null,'9:\\>');await run('cd \\@4',null,'9:\\@4>');
        await run('md old');await run('cd old',null,'9:\\@4\\OLD>');
        await run('echo native > note');await run('cd..',null,'9:\\@4>');
        await run('move old new');await run('cd new',null,'9:\\@4\\NEW>');
        await run('type note','native');
        await run('copy 8:\\one.txt',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('copy 8:\\renamed\\*.txt /p','2 file(s) copied.');
        await run('copy note explicit',messages.SYSOUT_ONE_FILE_COPIED.trim());
        await run('cd..',null,'9:\\@4>');await run('md occupied');
        await run('move new occupied /p',messages.SYSOUT_FILE_OR_DIRECTORY_EXISTS);
        await run('move new occupied\\other',messages.SYSOUT_CANNOT_RENAME_ACROSS_DRIVES);
        await run('dir \\@4 /b');await s.command('detach 9');
        const part=parts.find(p=>p.type===1);
        bytes=fs.readFileSync(hd).subarray(part.offset,part.offset+part.bytes);
        root=decode(bytes,256,1,1);assert(!root.has('OLD')&&root.has('NEW'));
        const entry=root.get('NEW'),header=((entry.track-1)*256+entry.sector)*256;
        assert.equal(bytes.subarray(header+4,header+20).toString('latin1').replace(/\xa0+$/,''),'NEW');
        const files=decode(bytes,256,entry.track,entry.sector);
        assert.equal(files.get('NOTE').data.toString(),'NATIVE\r');
        assert.deepEqual(files.get('EXPLICIT').data,files.get('NOTE').data);
        for(const name of ['ONE.TXT','TWO.TXT'])assert.deepEqual(files.get(name).data,source.get(name).data);
        assert(!files.has('SKIP.DAT'));
        require('./native-allocation')(bytes);
        console.log('PASS byte-exact COPY defaults, unchanged file MOVE and safe 1581/native directory renames');
    }finally{await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

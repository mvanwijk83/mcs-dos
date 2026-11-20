// Probe real 1581 ROM channel ownership before choosing a copy implementation.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const {start, fixture, monitorPath} = require('./cmd-hd-session');
async function main() {
    const image = 'build/partition-channels.dhd', disk = 'build/partition-channels.d81';
    await fixture(image);
    execFileSync(tool('vice', 'c1541'), ['-format', 'probe,ct', 'd81', disk],
                 {stdio: 'pipe', windowsHide: true});
    const s = await start(image, disk);
    try {
        await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "' + monitorPath(disk) + '" 8');
        const lines = [
            '10 open 15,8,15',
            '20 print#15,"/0:src,"+chr$(1)+chr$(0)+chr$(144)+chr$(1)+",c"',
            '30 print#15,"/0:src":print#15,"n:src,ct"',
            '40 open 2,8,2,"data,s,w":for i=0 to 1023:print#2,chr$(i and 255);:next:close 2',
            '50 print#15,"/":print#15,"/0:dst,"+chr$(41)+chr$(0)+chr$(144)+chr$(1)+",c"',
            '60 print#15,"/0:dst":print#15,"n:dst,ct":print#15,"/"',
            '70 print#15,"/0:src":open 2,8,2,"data,s,r"',
            '80 print#15,"/":print#15,"/0:dst":open 3,8,3,"copy,s,w"',
            '90 for j=0 to 7:print#15,"/":print#15,"/0:src":a$=""',
            '100 for i=0 to 127:get#2,b$:if b$="" then b$=chr$(0)',
            '110 a$=a$+b$:next',
            '120 print#15,"/":print#15,"/0:dst":print#3,a$;:next',
            '130 close 3:print#15,"/":print#15,"/0:src":close 2',
            '140 print#15,"/":print#15,"/0:dst":open 3,8,3,"copy,s,r":e=0',
            '150 for i=0 to 1023:get#3,b$:if b$="" then b$=chr$(0)',
            '160 if asc(b$)<>(i and 255) then e=e+1',
            '170 next:close 3:input#15,en,em$,t,se:close 15',
            '180 print "result:";e;en;em$'
        ];
        for (const line of lines) await s.keys(line + '\\x0d');
        await s.keys('\\x93run\\x0d');
        const out = await s.wait('result:', 180000);
        fs.writeFileSync('build/partition-channels.txt', out);
        assert(/result:\s+[1-9][0-9]*\s+60\s+write file open/i.test(out), out);
        console.log('PASS 1581 ROM rejects partition switching with a write file open');
    } finally { await s.stop(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });


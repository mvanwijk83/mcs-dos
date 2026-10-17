// DOS presentation and command syntax on a stock 1581, plus cross-drive CD.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const {start, fixture, monitorPath} = require('./cmd-hd-session');
async function main() {
    const hd = 'build/dos-directories.dhd', disk = 'build/dos-directories.d81';
    await fixture(hd);
    execFileSync(tool('vice', 'c1541'), ['-format', 'dos,ct', 'd81', disk],
                 {stdio: 'pipe', windowsHide: true});
    const s = await start(hd, disk);
    let prompt = '0:\\>';
    async function run(line, next = prompt) {
        await s.enter('cls', prompt);
        const out = await s.enter(line, next);
        prompt = next;
        console.log('PASS ' + line);
        return out;
    }
    try {
        await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "' + monitorPath(disk) + '" 8');
        fs.copyFileSync('build/easyflash/MCS-DOS.crt', 'build/dos-directories.crt');
        await s.command('attach "' + monitorPath('build/dos-directories.crt') + '" $20');
        await s.command('reset 1');
        await s.wait(prompt);
        await run('8:', '8:\\>');
        await run('echo root > root.txt');
        await run('md dir1 /size:400');
        let out = await run('dir');
        assert(/^DIR1\s+<DIR>$/m.test(out), out);
        assert(!/^\.\.?\s+<DIR>$/m.test(out), out);
        assert(/^  1 File\(s\)/m.test(out) && /^  1 Dir\(s\) +[\d,]+ bytes free$/m.test(out), out);
        assert(!out.slice(out.indexOf('File(s)')).includes(' bl)'), out);
        await run('cd\\dir1', '8:\\DIR1>');
        await run('echo one > one.txt');
        await run('md inner /size:120');
        out = await run('dir');
        assert(out.includes('Directory of 8:\\DIR1'), out);
        assert(/^\.\s+<DIR>$/m.test(out) && /^\.\.\s+<DIR>$/m.test(out), out);
        assert(/^  3 Dir\(s\) +[\d,]+ bytes free$/m.test(out), out);
        await run('chdir\\dir1\\inner', '8:\\DIR1\\INNER>');
        await run('echo deep > deep.txt');
        await run('cd..', '8:\\DIR1>');
        await run('chdir..', '8:\\>');
        out = await run('dir /s');
        for (const path of ['8:\\ROOT.TXT', '8:\\DIR1\\ONE.TXT', '8:\\DIR1\\INNER\\DEEP.TXT'])
            assert(out.split('\n').includes(path), out);
        assert(!out.includes('<DIR>') && !out.includes('Directory of') && !out.includes('File(s)'), out);
        out = await run('dir *.txt /s');
        assert(out.includes('8:\\DIR1\\INNER\\DEEP.TXT'), out);
        await run('0:', '0:\\>');
        await run('cd 8:\\dir1');
        out = await run('cd /d 8:\\missing');
        assert(out.includes('Disk error'), out);
        await run('cd /d A:\\dir1', '8:\\DIR1>');
        await run('set driveids=dos', 'A:\\DIR1>');
        await run('set prompt=$i$c$g', 'A:>');
        await run('set prompt=$p$g', 'A:\\DIR1>');
        await run('set driveids=c64', '8:\\DIR1>');
        await run('cd/d 0:', '0:\\>');
        await run('cd/d 8:', '8:\\DIR1>');
        console.log('PASS DOS directory presentation, recursive paths, compact CD, /D and $I/$P');
    } finally { await s.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

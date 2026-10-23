// Exercise the final cartridge against stock 1581 ROM and real CMD HD DOS.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const {start, fixture, monitorPath} = require('./cmd-hd-session');
async function main() {
    const hd = 'build/directories.dhd', disk = 'build/directories.d81';
    const partitions = await fixture(hd);
    execFileSync(tool('vice', 'c1541'), ['-format', 'directories,ct', 'd81', disk],
                 {stdio: 'pipe', windowsHide: true});
    const bytes = Buffer.from(Array.from({length: 2051}, (_, i) => (i * 79 + 3) & 255));
    fs.writeFileSync('build/directory-payload', bytes);
    execFileSync(tool('vice', 'c1541'), ['-attach', disk, '-write', 'build/directory-payload', 'binary'],
                 {stdio: 'pipe', windowsHide: true});
    const s = await start(hd, disk);
    await s.command('resourceset "Drive8Type" "1581"');
    await s.command('attach "' + monitorPath(disk) + '" 8');
    fs.copyFileSync('build/easyflash/MCS-DOS.crt', 'build/directories.crt');
    await s.command('attach "' + monitorPath('build/directories.crt') + '" $20');
    await s.command('reset 1');
    await s.wait('0:>');
    await s.enter('9:');
    const decode = require('./directory-image');
    let prompt = '9:\\>';
    async function run(line, expected, next = prompt) {
        await s.enter('cls', prompt);
        const out = await s.enter(line, expected || next);
        await s.wait(next);
        prompt = next;
        console.log('PASS ' + line);
        return out;
    }
    try {
        let out = await run('dir /b');
        assert(out.includes('NATIVE') && out.includes('PART13'), out);
        await run('echo rejected > illegal', 'Cannot store files in virtual root');
        if (!process.argv.includes('--native')) {
        await s.command('resourceset "Drive8Type" "1581"');
        await s.command('attach "' + monitorPath(disk) + '" 8');
        await run('8:', null, '8:\\>');
        await run('md one /size:400');
        await run('md two /size:400');
        await s.enter('md prompted', 'Specify partition size');
        await s.enter('120', prompt);
        await run('rd prompted');
        out = await run('dir /b');
        assert(out.includes('ONE') && out.includes('TWO'), out);
        await run('copy binary one\\binary', '1 file(s) copied');
        await run('cd one', null, '8:\\ONE>');
        await run('echo hello > text');
        await run('type text', 'hello');
        await run('md inner /size:120');
        await run('cd inner', null, '8:\\ONE\\INNER>');
        await run('echo nested > note');
        await run('cd ..', null, '8:\\ONE>');
        await run('copy binary \\two\\binary', '1 file(s) copied');
        await run('copy text \\two\\text', '1 file(s) copied');
        await run('type binary > \\two\\dump');
        await run('type \\two\\text', 'hello');
        await run('rd \\one /s /p', 'Cannot remove current directory');
        await run('cd \\', null, '8:\\>');
        await run('rd one', 'Directory is not empty');
        await run('del one /p', 'Use RD to remove directories');
        await run('rd one /s /p');
        out = await run('dir /b');
        assert(!out.includes('ONE') && out.includes('TWO'), out);
        await s.command('detach 8');
        const diskBytes = fs.readFileSync(disk), root = decode(diskBytes,40,40);
        const second = decode(diskBytes,40,root.get('TWO').track);
        assert.deepEqual(second.get('BINARY').data,bytes,'exact binary bytes across 1581 sub-partitions');
        assert.deepEqual(second.get('DUMP').data,bytes,'binary TYPE redirection across 1581 sub-partitions');
        await s.command('attach \"' + monitorPath(disk) + '\" 8');
        await run('cd two', null, '8:\\TWO>');
        await run('copy binary 9:\\native\\binary', '1 file(s) copied');
        await run('9:', null, '9:\\>');
        } else {
            await run('copy 8:binary native\\binary', '1 file(s) copied');
        }
        await run('cd native', null, '9:\\NATIVE>');
        await run('md docs');
        await run('cd docs', null, '9:\\NATIVE\\DOCS>');
        await run('echo native > text');
        out = await run('dir');
        assert(out.includes('Volume in drive 9: is NATIVE') && out.includes('Partition type is NATIVE') && out.includes('Disk ID is CT'), out);
        await run('type text', 'native');
        await run('dir \\ /b > listing');
        await run('type listing', 'NATIVE');
        await run('type text > \\@4\\redirect');
        await run('type \\@4\\redirect', 'native');
        await run('copy text \\@4\\moved', '1 file(s) copied');
        await run('move \\@4\\moved moved', '1 file(s) moved');
        await run('attrib +l moved');
        await run('del moved /p', 'File is locked');
        await run('attrib -l moved');
        await run('del moved /p');
        await run('copy \\native\\binary \\@4\\binary /p', 'File cannot be copied onto itself');
        await s.enter('basic', 'ready.');
        await s.enter('shell', prompt);
        await run('type text', 'native');
        await run('copy \\@4\\binary copied', '1 file(s) copied');
        await run('type copied > \\@4\\raw');
        await run('copy \\@4\\binary \\@13\\across', '1 file(s) copied');
        await run('cd \\', null, '9:\\>');
        await run('rd native /s /p', 'Cannot store files in virtual root');
        await run('cd @4', null, '9:\\NATIVE>');
        await run('rd docs', 'Directory is not empty');
        await run('rd docs /s /p', 'Unsupported drive type');
        await run('del docs\\* /p');
        await run('rd docs');
        out = await run('dir /b');
        assert(!out.includes('DOCS') && out.includes('BINARY'), out);
        await s.command('detach 9');
        const nativePart=partitions.find(p=>p.number===4), image=fs.readFileSync(hd);
        const native=decode(image.subarray(nativePart.offset,nativePart.offset+nativePart.bytes),256,1,1);
        assert.deepEqual(native.get('BINARY').data,bytes,'exact binary bytes in CMD native partition');
        assert.deepEqual(native.get('RAW').data,bytes,'binary TYPE redirection across native directories');
        const part13=partitions.find(p=>p.number===13);
        fs.writeFileSync('build/directories-part13.d64',image.subarray(part13.offset,part13.offset+174848));
        assert.deepEqual(require('./disk-image').files('build/directories-part13.d64').get('ACROSS').data,bytes,'binary copy across CMD partitions');
        await s.command('attach "' + monitorPath(hd) + '" 9');
        await run('md gone');
        await run('cd gone', null, '9:\\NATIVE\\GONE>');
        await s.enter('basic', 'ready.');
        await s.enter('open15,9,15,"cd//":print#15,"rd:gone":close15', 'ready.');
        await s.enter('shell', '9:\\>');
        prompt = '9:\\>';
        out = await run('dir /b');
        assert(out.includes('NATIVE'), out);
        await s.command('resourceset "Drive9Type" "0"');
        // The next command (including CLS) may already trigger drive recovery.
        await s.enter('cd', '0:\\>');
        console.log('PASS unavailable selected device recovers to cartridge root');
    } finally { await s.stop(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

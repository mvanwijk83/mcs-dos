// REL files must retain their record length and binary contents on CMD media.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const {start, fixture, monitorPath} = require('./cmd-hd-session');
const {files} = require('./disk-image');
const messages = require('./output');

async function main() {
    const image = 'build/test-cmd-rel.dhd', stock = 'build/cmd-rel-stock.d64';
    const formats = process.argv.includes('--native') ? [1] : [1, 2, 3];
    // CMD DOS rejects growing REL files on the one-track navigation fixture.
    const parts = await fixture(image, 4096);
    execFileSync(tool('vice', 'c1541'), ['-format', 'target,ct', 'd64', stock],
                 {stdio: 'pipe', windowsHide: true});
    const s = await start(image, stock);
    try {
        for (const line of [
            'new', '10 open 15,9,15',
            '15 print#15,"cp4":print#15,"n0:native,ct"',
            '20 for p=1 to ' + formats.length,
            '30 print#15,"cp"+mid$(str$(p),2)',
            '40 open 2,9,2,"records,l,"+chr$(100)', '50 for r=1 to 7',
            '60 print#15,"p"+chr$(98)+chr$(r)+chr$(0)+chr$(1)',
            '70 a$="":for i=1 to 100', '80 a$=a$+chr$((r*37+i)and 255)',
            '90 next i:print#2,a$;:next r', '100 close 2:next p', '110 close 15'
        ])
            await s.keys(line + '\\x0d');
        await s.enter('run', 'ready.');
        fs.copyFileSync('build/easyflash/MCS-DOS.crt', 'build/cmd-rel-shell.crt');
        await s.command('attach "' + monitorPath('build/cmd-rel-shell.crt') + '" $20');
        await s.command('reset 1');
        await s.wait('0:>');
        await s.enter('9:');
        const report = await s.check('sysinfo', 'CMD HD Mass Storage Drive');
        assert(!report.includes('Unknown device') && !report.includes('Drive 10:'), report);
        await s.check('cd \\@13', '9:\\PART13>');
        const listing = await s.check('dir \\ /b', 'PART13');
        assert(listing.includes('PART13'), listing);
        for (const n of formats) {
            await s.check('cd \\@' + n, '9:\\@' + n + '>');
            await s.check('copy records same', messages.SYSOUT_ONE_FILE_COPIED.trim());
            await s.check('copy records 8:across' + n, messages.SYSOUT_ONE_FILE_COPIED.trim());
        }
        await s.check('copy \\@1\\records \\@4\\records', messages.SYSOUT_ONE_FILE_COPIED.trim());
        await s.enter('cd \\@4');
        await s.enter('md docs');
        await s.check('copy records docs\\nested', messages.SYSOUT_ONE_FILE_COPIED.trim());
        await s.check('copy docs\\nested 8:across4', messages.SYSOUT_ONE_FILE_COPIED.trim());
        await s.command('detach 9');
        await s.command('detach 8');
        const hd = fs.readFileSync(image), target = files(stock);
        const expected = Buffer.from(Array.from({length: 700}, (_, i) =>
            ((Math.floor(i / 100) + 1) * 37 + i % 100 + 1) & 255));
        for (const n of formats) {
            const p = parts.find(p => p.number === n);
            const size = n === 1 ? 174848 : n === 2 ? 349696 : 819200;
            const extracted = 'build/cmd-rel-part.' + (n === 1 ? 'd64' : n === 2 ? 'd71' : 'd81');
            fs.writeFileSync(extracted, hd.subarray(p.offset, p.offset + size));
            const entries = files(extracted);
            for (const entry of [entries.get('RECORDS'), entries.get('SAME'), target.get('ACROSS' + n)]) {
                assert(entry, 'persisted REL file');
                assert.equal(entry.type & 7, 4);
                assert.equal(entry.recordLength, 100);
                assert.deepEqual(entry.data, expected);
            }
        }
        const nativePart = parts.find(p => p.number === 4);
        const nativeBytes = hd.subarray(nativePart.offset, nativePart.offset + nativePart.bytes);
        const decode = require('./directory-image');
        const native = decode(nativeBytes, 256, 1, 1);
        const docs = native.get('DOCS');
        const nested = decode(nativeBytes, 256, docs.track, docs.sector).get('NESTED');
        for (const entry of [native.get('RECORDS'), nested, target.get('ACROSS4')]) {
            assert.equal(entry.type & 7, 4);
            assert.equal(entry.recordLength, 100);
            assert.deepEqual(entry.data, expected);
        }
        console.log('PASS CMD emulation/native REL records, cross-directory and physical-drive copies');
        // Exercise FORMAT in the final artifact after verifying the REL bytes.
        await s.command('attach "' + monitorPath(image) + '" 9');
        for (const n of formats) {
            await s.check('cd \\@' + n, '9:\\@' + n + '>');
            await s.check('format 9:', messages.SYSOUT_PROCEED_WITH_FORMAT.trim());
            await s.keys('y');
            await s.wait(messages.SYSOUT_FORMAT_LABEL_PROMPT.trim());
            await s.enter('verified', messages.SYSOUT_DISK_ID_PROMPT.trim());
            await s.enter('vf', messages.SYSOUT_FORMAT_COMPLETE);
            await s.enter('cd \\@'+n);
            await s.check('vol', 'Disk ID is VF');
        }
        console.log('PASS final artifact FORMAT on ' + formats.length + ' CMD emulation format(s)');
    } finally {
        await s.stop();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

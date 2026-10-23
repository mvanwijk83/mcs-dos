require('./setup');
const assert = require('assert/strict');
const {start, fixture} = require('./cmd-hd-session');
async function main() {
    const image = 'build/test-cmd-overview.dhd';
    const partitions = await fixture(image);
    const s = await start(image, null, true, true);
    try {
        if (process.argv.includes('--chkdsk-root')) {
            await s.enter('cls', '8:>');
            const report = await s.enter('chkdsk', '8:>');
            assert(report.includes('Select an emulation partition first') &&
                   !report.includes('Cannot store files in virtual root'), report);
            console.log('PASS CMD-HD virtual-root CHKDSK diagnostic');
            return;
        }
        async function list() {
            await s.enter('cls', '8:>');
            return s.enter('dir \\ /b', '8:>');
        }
        await s.enter('cd \\@3', '8:\\1581>');
        let report = await list();
        for (const p of partitions) assert(report.includes(p.name), report);
        assert(report.trimEnd().endsWith('8:\\1581>'), report);
        await s.enter('echo payload > sample', '8:>');
        report = await list();
        assert(report.includes('NATIVE') && report.trimEnd().endsWith('8:\\1581>'), report);
        await s.enter('del sample /p', '8:>');
        await s.enter('cd \\native', '8:\\NATIVE>');
        report = await list();
        assert(report.includes('PART13') && report.trimEnd().endsWith('8:\\NATIVE>'), report);
        await s.enter('cd \\', '8:\\>');
        await s.enter('cls', '8:>');
        report = await s.enter('echo denied > sample', '8:>');
        assert(report.includes('Cannot store files in virtual root'), report);
        await s.enter('cls', '8:>');
        report = await s.enter('chkdsk', '8:>');
        assert(report.includes('Select an emulation partition first') &&
               !report.includes('Cannot store files in virtual root'), report);
        console.log('PASS CMD virtual partition root, names/aliases, temporary listing and write protection');
    } finally { await s.stop(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

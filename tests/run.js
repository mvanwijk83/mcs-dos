// Sequential execution: suites may reuse disposable images and drive resources.
const {root} = require('./setup');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const groups = require('./suites');
const options = process.argv.slice(2);
const list = options.includes('--list');
const selectors = options.filter(arg => arg !== '--help' && arg !== '--list');
if (options.includes('--help')) {
    console.log('Usage: node tests/run.js [group|suite ...] [--list]\n' +
                'Default: unit. Groups: ' + Object.keys(groups).join(', ') + '\n' +
                'See tests/README.md for prerequisites; unit tests need no application build.');
    process.exit(0);
}
const selected = new Map();
for (const name of selectors.length ? selectors : [list ? 'all' : 'unit']) {
    const tests = groups[name] || groups.all.filter(test => test.id === name);
    if (!tests.length) {
        console.error('Unknown group or suite: ' + name + '. Use --list or --help.');
        process.exit(2);
    }
    for (const test of tests)
        selected.set(test.id, test);
}
if (list) {
    for (const test of selected.values()) {
        const group = Object.keys(groups).find(
            name => name !== 'all' && name !== 'smoke' && groups[name].includes(test));
        console.log(
            group.padEnd(9) + test.id.padEnd(24) + test.file + '.js ' + test.args.join(' '));
    }
    process.exit(0);
}
const standalone = [
    'banked-image', 'drive-compat', 'input-history', 'petscii-completion', 'sample-startup',
    'editor-session', 'copy-wildcards', 'find-vice', 'help-session'
];
if ([...selected.values()].some(
        test => test.file === 'easyflash' || standalone.includes(test.file)) &&
    !fs.existsSync(path.join(root, 'build/easyflash/MCS-DOS.crt'))) {
    console.error('Missing 2.1 cartridge build. Run node scripts/build.js before these suites.');
    process.exit(2);
}
let failures = 0;
try {
    const {executable, viceData} = require('./environment');
    const tests = [...selected.values()];
    if (tests.some(test => groups.unit.includes(test) && test.file !== 'helpers' || [
            'c64-support', 'kernal-models', 'ultimate-models', 'drive-models'
        ].includes(test.file)))
        executable('oscar64', 'oscar64');
    if (tests.some(test => test.file === 'easyflash' ||
                           standalone.includes(test.file) && test.file !== 'banked-image' ||
                           test.file === 'c64-support'))
        executable('vice', 'x64sc');
    if (tests.some(test => test.file === 'easyflash' ||
                           standalone.includes(test.file) && test.file !== 'banked-image'))
        executable('vice', 'c1541');
    if (tests.some(test => test.args.includes('--c128')))
        executable('vice', 'x128');
    if (tests.some(test => test.file === 'kernal-models'))
        viceData('C64');
    if (tests.some(test => test.file === 'drive-models'))
        viceData('DRIVES');
    if (tests.some(test => test.file === 'easyflash') && !process.env.VICE_CHARGEN)
        viceData('C64', 'chargen-901225-01.bin');
} catch (error) {
    console.error(error.message);
    process.exit(2);
}
for (const test of selected.values()) {
    console.log('\nRunning ' + test.id);
    const result =
        spawnSync(process.execPath, [path.join(__dirname, test.file + '.js'), ...test.args],
            {cwd: root, stdio: 'inherit', windowsHide: true});
    if (result.error || result.status !== 0) {
        console.error('FAIL ' + test.id, result.error || 'exit ' + result.status);
        failures++;
    }
}
console.log('\n' + (selected.size - failures) + '/' + selected.size + ' suites passed');
process.exitCode = failures ? 1 : 0;

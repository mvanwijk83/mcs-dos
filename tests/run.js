// Sequential execution: emulator suites deliberately reuse disposable paths.
const {setup} = require('./setup');
const {spawnSync} = require('child_process');
setup();
const unit = ['amount-switches','cache-capacity','concat-limits','dir-sort','editor-lines','find',
    'help-wrap','print','prompt','startup-settings','type-wrap'].map(name => [name]);
const emulator = ['c64-support','oscar64-regression','help-prompt','find-vice',
    'new-commands','copy-wildcards','redirection','editor-session','charset','bootsplash',
    'input-history','help-recovery','sample-startup','petscii-completion'].map(name => [name]);
const drives = [['drive-compat','1541'], ['drive-compat','1571'], ['drive-compat','1581'],
    ['drive-compat','1581','--large'], ['drive-compat','1571','--rel'], ['drive-compat','1581','--rel'],
    ['drive-compat','1571','--format'], ['drive-compat','1581','--format'],
    ['drive-compat','1581','--mismatch'], ['drive-compat','1541','--badformat'], ['drive-compat','1571','--single']];
const groups = {unit, emulator, drives, all: [...unit, ...emulator, ...drives]};
const group = process.argv[2] || 'unit';
if (process.argv.length > 3 || !groups[group]) {
    console.error('Usage: node tests/run.js [unit|emulator|drives|all]');
    process.exit(2);
}
let failures = 0;
for (const [name, ...args] of groups[group]) {
    console.log('\nRunning ' + [name, ...args].join(' '));
    const result = spawnSync(process.execPath, ['tests/' + name + '.js', ...args],
        {stdio: 'inherit', windowsHide: true});
    if (result.error || result.status !== 0) {
        console.error('FAIL ' + name, result.error || 'exit ' + result.status);
        failures++;
    }
}
console.log(`\n${groups[group].length - failures}/${groups[group].length} suites passed (${group})`);
process.exitCode = failures ? 1 : 0;

// Sequential execution: emulator suites deliberately reuse disposable paths.
const {setup} = require('./setup');
const {spawnSync} = require('child_process');
setup();
const unit = ['amount-switches','cache-capacity','concat-limits','delete-wildcards','dir-sort','diskinit','editor-lines','find','find-redirection',
    'help-wrap','print','prompt','startup-settings','type-wrap','type-options','journal-crc','kernal-models','ultimate-models'].map(name => [name]);
const emulator = ['c64-support','oscar64-regression','help-prompt','find-vice',
    'new-commands','copy-wildcards','redirection','editor-session','charset','bootsplash','bootsplash-restore',
    'input-history','help-recovery','sample-startup','petscii-completion'].map(name => [name]);
const drives = [['drive-compat','1541'], ['drive-compat','1571'], ['drive-compat','1581'],
    ['drive-compat','1581','--large'], ['drive-compat','1571','--rel'], ['drive-compat','1581','--rel'],
    ['drive-compat','1571','--format'], ['drive-compat','1581','--format'],
    ['drive-compat','1581','--mismatch'], ['drive-compat','1541','--badformat'], ['drive-compat','1571','--single']];
const easyflash = [['banked-image'], ['easyflash','--commands'], ['easyflash','--find-redirection'], ['easyflash','--delete'], ['easyflash','--diskinit'], ['easyflash','--banked'], ['easyflash','--journal'], ['easyflash','--compact'], ['easyflash','--session'], ['easyflash','--run-return']];
easyflash.push(['easyflash','--drive-info']);
easyflash.push(['drive-models']);
easyflash.push(['easyflash','--sysinfo']);
easyflash.push(['easyflash','--sysinfo','--ntsc']);
easyflash.push(['easyflash','--sysinfo','--c128']);
easyflash.push(['easyflash','--sysinfo','--sx64']);
easyflash.push(['easyflash','--sysinfo','--boot-info']);
easyflash.push(['easyflash','--tape']);
easyflash.push(['easyflash','--tape','--tape-search']);
const groups = {unit, easyflash, emulator, drives, all: [...unit, ...easyflash]};
const group = process.argv[2] || 'unit';
if (process.argv.length > 3 || !groups[group]) {
    console.error('Usage: node tests/run.js [unit|easyflash|emulator|drives|all]');
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

// Build the public disk using only version-controlled inputs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync, spawnSync} = require('child_process');
const {tool, setup} = require('./toolchain');
const petscii = require('./petscii');
setup();
const run = (command, args) => execFileSync(command, args, {stdio: 'inherit', windowsHide: true});
run(process.execPath, ['scripts/make-hardware.js']);
const compile = spawnSync(tool('oscar64', 'oscar64'),
    ['-n', '-Os', '-Oo', '-psci', '-o=build/MCS-DOS.prg', 'src/mcsdos.c'], {encoding: 'utf8', windowsHide: true});
fs.writeFileSync('build/oscar64/build.log', String(compile.stdout || '') + String(compile.stderr || compile.error || ''));
if (compile.error || compile.status !== 0) throw Error('Compilation failed; see build/oscar64/build.log');
run(process.execPath, ['scripts/make-help.js']);
run(process.execPath, ['scripts/make-examples.js']);
const disk = 'build/MCS-DOS.d64';
const version = fs.readFileSync('src/mcsdos.c', 'utf8').match(/^#define VERSION "([^"]+)"/m)[1];
const args = ['-format', `mcs-dos ${version},mc`, 'd64', disk, '-attach', disk,
    '-write', 'build/MCS-DOS.prg', 'mcs-dos',
    '-write', 'build/MANUAL.TXT', 'manual.txt,s',
    '-write', 'build/LICENSE.TXT', 'license.txt,s',
    '-write', 'build/COMMANDS.HLP', 'commands.hlp,s'];
const names = new Set(['MCS-DOS', 'MANUAL.TXT', 'LICENSE.TXT', 'COMMANDS.HLP']);
for (const entry of fs.readdirSync('disk-content', {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) throw Error('disk-content must contain files only: ' + entry.name);
    if (!/^[A-Za-z0-9._-]{1,16}$/.test(entry.name)) throw Error('Invalid C64 disk filename: ' + entry.name);
    if (names.has(entry.name.toUpperCase())) throw Error('Duplicate disk filename: ' + entry.name);
    names.add(entry.name.toUpperCase());
    const input = path.join('disk-content', entry.name), output = path.join('build', entry.name);
    if (/\.(bat|sample|txt)$/i.test(entry.name)) fs.writeFileSync(output, petscii(fs.readFileSync(input, 'utf8')));
    else fs.copyFileSync(input, output);
    args.push('-write', output, entry.name.toLowerCase() + ',s');
}
run(tool('vice', 'c1541'), args);
run(process.execPath, ['scripts/verify-image.js']);
fs.writeFileSync('build/SHA256SUMS.txt', ['MCS-DOS.d64', 'MCS-DOS.prg'].map(name =>
    crypto.createHash('sha256').update(fs.readFileSync('build/' + name)).digest('hex') + '  ' + name).join('\n') + '\n');
fs.writeFileSync('build/BUILD-TYPE.txt', 'Public build from disk-content/; AUTOEXEC.SAMPLE is inactive.\n');
console.log('Built build/MCS-DOS.prg and build/MCS-DOS.d64');

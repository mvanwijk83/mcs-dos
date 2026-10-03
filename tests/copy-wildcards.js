const messages = require('./output');
// Wildcard COPY uses independent disk decoding to verify types and bytes.
const fs = require('fs'), assert = require('assert/strict'),
      {execFileSync} = require('child_process');
const {tool, root} = require('./setup');
const {files} = require('./disk-image');
require('./shell')('copy-wildcards', async ({disk, command, enter, keys, until}) => {
    const names = ['CGA', 'AMIGA', 'ATARIST', 'PET', 'ZXSPECTRUM'];
    const target = root.replaceAll('\\', '/') + '/build/test-copy-target.d64';
    await command('detach 8');
    for (const name of names.slice(1)) {
        fs.copyFileSync('build/CGA.CPI', 'build/' + name + '.CPI');
        execFileSync(tool('vice', 'c1541'),
            ['-attach', disk, '-write', 'build/' + name + '.CPI', name.toLowerCase() + '.cpi,s'],
            {stdio: 'pipe', windowsHide: true});
    }
    execFileSync(tool('vice', 'c1541'), ['-format', 'blank,bb', 'd64', target],
        {stdio: 'pipe', windowsHide: true});
    await command('resourceset "Drive9Type" "1541"');
    await command('attach "' + target + '" 9');
    await command('attach "' + disk + '" 8');
    await enter('dir /b');
    async function check(cmd, text) {
        await enter('cls');
        await keys(cmd + '\\x0d');
        const out = await until(s => s.includes(text));
        assert(out.includes(text), out);
    }
    await check('copy *.cpi 9:', names.length + ' file(s) copied.');
    await check('dir 9:*.cpi', names.length + ' File(s)');
    await check('copy *.missing 9:', messages.SYSOUT_FILE_NOT_FOUND);
    await check('copy *.cpi 8:', messages.SYSOUT_FILE_COPY_ON_SELF);
    await check('copy *.cpi 9:renamed', messages.SYSOUT_WILDCARDS_DEST_DRV);
    await check('copy 8:cga.cpi 9:single', messages.SYSOUT_ONE_FILE_COPIED.trim());
    await check('copy 8:pet.c?i 9:', messages.SYSOUT_OVERWRITE_FILE);
    await enter('n');
    await check('copy 8:pet.cpi 9: /p', messages.SYSOUT_ONE_FILE_COPIED.trim());
    await command('detach 9');
    const entries = files(target);
    for (const name of names) {
        const file = entries.get(name + '.CPI');
        assert.equal(file.type, 0x81);
        assert.equal(file.blocks, file.chainBlocks, name + ' freshly copied allocation');
        assert.deepEqual(file.data, fs.readFileSync('build/' + name + '.CPI'));
    }
    console.log(
        'PASS VICE wildcard COPY, exact COPY, no matches, invalid targets, question-mark matching');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

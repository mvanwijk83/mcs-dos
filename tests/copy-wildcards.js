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
    fs.writeFileSync('build/test-legacy-con.txt', 'ORDINARY FILE\r');
    execFileSync(tool('vice', 'c1541'),
        ['-attach', disk, '-write', 'build/test-legacy-con.txt', 'con,s'],
        {stdio: 'pipe', windowsHide: true});
    for (const name of names.slice(1)) {
        fs.copyFileSync('build/CGA.CPI', 'build/test-copy-' + name + '.CPI');
        execFileSync(tool('vice', 'c1541'),
            ['-attach', disk, '-write', 'build/test-copy-' + name + '.CPI', name.toLowerCase() + '.cpi,s'],
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
        assert.deepEqual(file.data, fs.readFileSync('build/CGA.CPI'));
    }
    console.log(
        'PASS VICE wildcard COPY, exact COPY, no matches, invalid targets, question-mark matching');

    await check('copy con', messages.SYSOUT_SYNTAX_COPY_CON);
    await check('copy con con', messages.SYSOUT_FILE_COPY_ON_SELF);
    await check('copy con 0:prn', messages.SYSOUT_INVALID_FILE_NAME);
    await check('copy 8:con 0:con', messages.SYSOUT_INVALID_FILE_NAME);
    await check('ren 8:con 8:prn', messages.SYSOUT_INVALID_FILE_NAME);
    await check('md 8:prn', messages.SYSOUT_INVALID_FILE_NAME);
    await enter('cls');
    await keys('copy con notes.txt\\x0d');
    await keys('first\\x0d\\x0dlastx\\x14\\x03');
    const created = await until(text => text.includes(messages.SYSOUT_ONE_FILE_COPIED.trim()) &&
        text.endsWith('8:\\>'));
    assert(!created.includes('Type text.'), created);
    await enter('echo keeper >copycon00.tmp');
    await enter('cls');
    await keys('copy con notes.txt\\x0d');
    await keys('discard\\x0d');
    const typing = await until(text => /^discard *$/m.test(text));
    assert(!typing.includes(messages.SYSOUT_OVERWRITE_FILE), typing);
    await keys('\\x03');
    await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
    await keys('n');
    await until(text => text.endsWith('8:\\>'));
    await enter('echo old >replace.txt');
    await enter('cls');
    await keys('copy con replace.txt\\x0d');
    const longLines = Array.from({length: 17}, (_, i) =>
        String.fromCharCode(97 + i).repeat(119));
    // Eight lines including their CRs fill 960 bytes. Exercise two flushes
    // and verify the buffered tail, including the line ended by RUN/STOP.
    for (const text of longLines) {
        await keys(text.slice(0, 60));
        await keys(text.slice(60) + '\\x0d');
    }
    await keys('replacement\\x03');
    await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
    await keys('y');
    await until(text => text.includes(messages.SYSOUT_ONE_FILE_COPIED.trim()) &&
        text.endsWith('8:\\>'));
    await keys('copy con: 0:notes.txt\\x0d');
    await keys('cartridge\\x0d\\x03');
    await until(text => text.endsWith('8:\\>'));
    await check('type 0:notes.txt', 'cartridge');
    await enter('cls');
    await keys('copy con 0:notes.txt\\x0d');
    await keys('discard\\x03');
    await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
    await keys('n');
    await until(text => text.endsWith('8:\\>'));
    await check('type 0:notes.txt', 'cartridge');
    await enter('copy 8:con 0:ordinary');
    await check('type 0:ordinary', 'ordinary file');
    await command('detach 8');
    const diskEntries = files(disk);
    const notes = diskEntries.get('NOTES.TXT');
    assert.equal(notes.type, 0x81);
    assert.deepEqual(diskEntries.get('CON').data, Buffer.from('ORDINARY FILE\r'));
    assert(!diskEntries.has('PRN'));
    assert.deepEqual(notes.data, Buffer.from('FIRST\r\rLAST\r'));
    assert.deepEqual(diskEntries.get('REPLACE.TXT').data,
        Buffer.from(longLines.join('\r').toUpperCase() + '\rREPLACEMENT\r'));
    assert.deepEqual(diskEntries.get('COPYCON00.TMP').data, Buffer.from('KEEPER\r'));
    assert.deepEqual([...diskEntries.keys()].filter(name => /^COPYCON.*\.TMP$/.test(name)),
        ['COPYCON00.TMP']);
    console.log('PASS VICE COPY CON on disk and cartridge, buffered writes, editing and overwrite refusal');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

// Real cartridge locale switching, external paths and DIR option precedence.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
require('./shell')('datetime', async ({enter: rawEnter, command, memory}) => {
    async function enter(text) {
        console.log('Checking ' + text);
        return rawEnter(text);
    }
    async function check(text, expected) {
        const screen = await enter(text);
        assert(screen.includes(expected), screen);
        return screen;
    }
    const map = fs.readFileSync('build/easyflash/shell.map', 'utf8');
    const address = name => parseInt(map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : ' + name + ',', 'm'))[1], 16);
    const format = async () => Array.from(await memory(address('locale'), address('locale') + 5));
    assert.deepEqual(await format(), [2, 0, 46, 45, 58, 1]);
    await enter('nlsfunc US');
    assert.deepEqual(await format(), [0, 44, 46, 47, 58, 0]);
    await enter('cls'); await check('mem', '65,536 bytes total');
    await enter('nlsfunc NL');
    assert.deepEqual(await format(), [1, 46, 44, 45, 58, 1]);
    await enter('cls'); await check('mem', '65.536 bytes total');
    await enter('nlsfunc fr-CA');
    assert.deepEqual(await format(), [2, 32, 44, 45, 58, 1]);
    await enter('copy 0:country.sys 8:country.sys');
    await enter('nlsfunc 8:\\country.sys FI');
    assert.deepEqual(await format(), [1, 32, 44, 46, 46, 1]);
    await enter('cls'); await check('nlsfunc ZZ', 'Invalid locale code');
    assert.deepEqual(await format(), [2, 0, 46, 45, 58, 1]);
    await enter('cls'); await check('nlsfunc NL 8:\\missing.sys', 'COUNTRY.SYS not found');
    await enter('echo broken >8:broken.sys');
    await enter('cls'); await check('nlsfunc NL 8:\\broken.sys', 'Invalid COUNTRY.SYS');
    await enter('cls'); await check('date 8: /t', 'No clock device');
    await enter('cls'); await check('time 8: /t', 'No clock device');
    await enter('cls'); await check('date /d 8:', 'No clock device available');
    await enter('cls'); await check('time /t/d 8:', 'No clock device available');
    await enter('cls');
    let screen = await check('dir 0:country.sys /d', 'COUNTRY.SYS');
    const row = screen.split('\n').find(line => /^COUNTRY.SYS\s+SEQ/.test(line));
    assert(row && !/[0-9]/.test(row), screen);
    await enter('cls'); screen = await check('dir 0:country.sys /d /b', 'COUNTRY.SYS');
    assert(!screen.includes('SEQ'), screen);
    await enter('cls'); screen = await check('dir 0:country.sys /c', 'COUNTRY.SYS');
    assert(/^COUNTRY.SYS\s+S\s+\d+$/m.test(screen), screen);
    await enter('cls'); screen = await check('dir 0:country.sys /c /d', 'COUNTRY.SYS');
    assert(/^COUNTRY.SYS\s+SEQ\s*$/m.test(screen), screen);
    const helpTitle = JSON.parse(fs.readFileSync('src/command-help.json', 'utf8')).NLSFUNC.split('\n')[0];
    await enter('cls'); await check('help nlsfunc', helpTitle.slice(0, 35));
    await enter('echo country=fr-CA,8:country.sys >0:config.sys');
    await enter('echo clock=sd2iec,8 >>0:config.sys');
    await enter('reboot');
    assert.deepEqual(await format(), [2, 32, 44, 45, 58, 1]);
    assert.equal((await memory(address('clockkind')))[0], 2);
    assert.equal((await memory(address('clockdevice')))[0], 8);
    console.log('PASS cartridge locale switching, external country files, fallback errors, no-clock commands and DIR /D precedence');
}).catch(error => { console.error(error); process.exitCode = 1; });

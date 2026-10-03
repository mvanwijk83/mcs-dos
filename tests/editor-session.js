// Editor UI, save/reload and IRQ restoration on the release cartridge.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const messages = require('./output');
require('./shell')('editor-session', async session => {
    const {command, memory} = session;
    const screen = async () => (await session.screen()).split('\n');
    const keys = async (text, ms) => (await session.keys(text, ms)).split('\n');
    const shell = await memory(0xd020, 0xd021), vector = await memory(0x314, 0x315),
          mask = await memory(0xd01a);
    const foreground = (await memory(0x286))[0] & 15;
    function status(row, name, coords = messages.SYSOUT_EDIT_INITIAL_POS.trim()) {
        assert.equal(
            row, (' ' + coords + '  ' + name).padEnd(26) + messages.SYSOUT_RUN_STOP_QUIT.trim());
    }
    status((await keys('edit\\x0d'))[24], messages.SYSOUT_UNTITLED.trim());
    const base = (await memory(0x288))[0] * 256;
    assert.equal((await memory(base + 999))[0], 160, 'one reverse-space of right padding');
    assert.deepEqual(await memory(0xd020, 0xd021), shell);
    assert.deepEqual(await memory(0x314, 0x315), vector);
    assert.deepEqual(await memory(0xd01a), mask);
    assert((await memory(0xdbc0, 0xdbe7)).every(v => (v & 15) === foreground),
        'status retains shell foreground');
    const points = [];
    for (const range of [[base + 960, base + 960], [base + 963, base + 963],
             [base + 966, base + 999], [0xdbc0, 0xdbe7]]
             .map(pair => pair.map(n => n.toString(16)).join(' '))) {
        const result = await command('break store ' + range);
        points.push(result.match(/(?:BREAK|WATCH):\s*(\d+)/i)[1]);
    }
    await keys('abcdefghijklmnopqrstuvwxyz');
    await keys('\\x13' +
               '\\x11'.repeat(23));
    await keys('last row');
    await keys('\\x1d'.repeat(31));
    status((await screen())[24], messages.SYSOUT_UNTITLED.trim(), '24:40');
    for (const p of points)
        await command('delete ' + p);
    await command(
        'screenshot "' + path.resolve('build/editor-status.png').replaceAll('\\', '/') + '" 2');
    await keys('\\x03');
    assert.equal((await screen())[24], 'Save changes (Y/N)?');
    await keys('n');
    status((await keys('edit abcdefghijklmnop\\x0d', 1600))[24], 'ABCDEFGHIJKLMNOP');
    await keys('saved document\\x03y', 2500);
    let out = await keys('edit abcdefghijklmnop\\x0d', 1600);
    assert.equal(out[0], 'saved document');
    status(out[24], 'ABCDEFGHIJKLMNOP');
    await keys('x'); // Make a change before exercising overwrite refusal.
    await keys('\\x03y', 1500);
    assert.equal((await screen())[24], 'Overwrite existing file (Y/N)?');
    await keys('n');
    await keys('edit\\x0d');
    await keys('hello\\x03y');
    out = await keys('bad,name\\x0d');
    assert(out.some(s => s.includes(messages.SYSOUT_INVALID_FILE_NAME.trim())));
    await keys('edit\\x0d');
    await keys('\\x03y');
    await keys('\\x03');
    assert.deepEqual(await memory(0xd020, 0xd021), shell);
    assert.deepEqual(await memory(0x314, 0x315), vector);
    assert.deepEqual(await memory(0xd01a), mask);
    out = await keys('edit /modern\\x0d');
    assert(out.some(s => s.includes(messages.SYSOUT_INVALID_SWITCH.trim())));
    out = await keys('help edit\\x0d');
    assert(!out.some(s => s.includes('/MODERN')));
    console.log(
        'PASS right-aligned status, Untitled and 16-character filename, fixed-cell watchpoints, shell colours/IRQ unchanged, save/reload and cancellation/error paths');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

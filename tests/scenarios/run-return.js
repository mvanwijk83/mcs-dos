// Real 6502/BASIC exits through the warm-start vector, on both launch paths.
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process'), {tool} = require('../setup');
const delay = ms => new Promise(r => setTimeout(r, ms));
module.exports =
    async function({command, memory, screen, keys, enter, check, defaultFont, disk, root}) {
    const map = fs.readFileSync('build/easyflash/shell.map', 'utf8');
    function address(name) {
        const m = map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : ' + name + ',', 'm'));
        assert(m, name);
        return parseInt(m[1], 16);
    }
    async function variable(name, n) {
        const at = address(name);
        return Buffer.from(await memory(at, at + n - 1));
    }
    async function settled(s, predicate) {
        for (let i = 0; i < 40 && !predicate(s); i++) {
            await command('x');
            await delay(500);
            s = await screen();
        }
        assert(predicate(s), s);
        return s;
    }
    function native(id, exit) {
        return Buffer.from([
            1, 8, 11, 8, 10, 0, 0x9e, 50, 48, 54, 49, 0, 0, 0, 0xa9, id, 0x8d, 0xf0, 0xc2, 0xa9, 1,
            0x8d, 0x20, 0xd0, 0x8d, 0x21, 0xd0, ...exit
        ]);
    }
    const fixtures = {
        return: native(0x41, [0x60]),
        warm: native(0x42, [0x4c, 0x74, 0xa4]),
        resetvec: native(0x43, [0x20, 0x53, 0xe4, 0x60]),
        // Spare descriptor RAM belongs to the launched program, not TAPECOPY.
        tapebytes: native(
            0x44, [0xa9, 0x54, 0x8d, 0xee, 0xc1, 0xa9, 1, 0x8d, 0xe8, 0xc1, 0x4c, 0x74, 0xa4]),
        // BASIC division by zero also reaches the prompt hook.
        error: Buffer.from([1, 8, 10, 8, 10, 0, 0x99, 49, 0xad, 48, 0, 0, 0])
    };
    fixtures.absolute = Buffer.concat([Buffer.from([0, 32]), fixtures.warm.subarray(14)]);
    const args = ['-attach', disk];
    for (const [name, data] of Object.entries(fixtures)) {
        const file = root + '/build/easyflash/run-' + name + '.prg';
        fs.writeFileSync(file, data);
        args.push('-write', file, name + ',p');
    }
    execFileSync(tool('vice', 'c1541'), args, {stdio: 'pipe', windowsHide: true});
    await command(`attach "${disk}" 8`);
    for (const name of Object.keys(fixtures))
        await enter('copy 8:' + name + ' 0:' + name);
    await enter('echo set charset=cga >autoexec.bat');
    await enter('reboot', 3500);
    await defaultFont(fs.readFileSync('build/CGA.CPI'));
    await enter('echo set boot=must-not-run >autoexec.bat');
    await enter('set keep=preserved');
    await enter('set color=2,6,7');
    const fields = [['environment', 512], ['prompttext', 33]];
    const expected = [];
    for (const field of fields)
        expected.push(await variable(...field));
    const colors = await memory(0xd020, 0xd021);
    // Check restoration before BASIC's RUN machinery changes the flag again.
    const loader = fs.readFileSync('build/oscar64/launch.asm', 'utf8');
    const savedMessage = parseInt(loader.match(/LDA \$9d[^\n]*\n[^\n]*STA \$([0-9a-f]+)/i)[1], 16);
    const basicEntry = loader.match(/^([0-9a-f]+) :[^\n]*JSR \$a659/m)[1];
    async function restored(s) {
        await settled(s, s => s.endsWith('0:>'));
        for (let i = 0; i < fields.length; i++)
            assert.deepEqual(await variable(...fields[i]), expected[i], fields[i][0]);
        assert.equal((await memory(0xc1e0))[0], 0, 'resume request consumed');
        assert.deepEqual(await memory(0xd020, 0xd021), colors, 'shell colors restored');
        await defaultFont(fs.readFileSync('build/CGA.CPI'));
    }
    for (const [device, prefix] of [[8, 'run '], [0, 'run '], [8, ''], [0, '']])
        for (const name of ['return', 'warm', 'error']) {
            await command('> c2f0 00');
            let point;
            if (device === 8 && name === 'return') {
                point =
                    (await command('break exec ' + basicEntry)).match(/(?:BREAK|WATCH):\s*(\d+)/i);
                assert(point, 'monitor breakpoint for KERNAL message restoration');
            }
            let output = await keys(`${prefix}${device}:${name}\\x0d`, 3500);
            if (point) {
                assert((await command('r')).toLowerCase().includes(basicEntry),
                    'paused after disk LOAD and message restoration');
                assert.equal((await memory(0x9d))[0], (await memory(savedMessage))[0],
                    'RUN must restore the KERNAL message flag before entering BASIC');
                await command('delete ' + point[1]);
                await command('x');
                await delay(3500);
                output += '\n' + await screen();
            }
            await restored(output);
            assert(!/searching for|(?:^|\n)loading\s*(?:\n|$)/i.test(output),
                'RUN must suppress KERNAL load progress: ' + output);
            if (name !== 'error')
                assert.equal((await memory(0xc2f0))[0], name === 'return' ? 0x41 : 0x42,
                    'native code executed');
            const history = await variable('history', 650);
            assert(history.includes(Buffer.from(`${prefix.toUpperCase()}${device}:${name.toUpperCase()}\0`)),
                'launch command retained in history');
        }
    // Absolute entry still jumps directly; a program that JMPs to READY returns.
    for (const device of [8, 0]) {
        await restored(await keys(`run ${device}:tapebytes\\x0d`, 3500));
        assert.equal(
            (await memory(0xc1ee))[0], 0, 'native return clears unrelated tape result marker');
        await command('> c2f0 00');
        await restored(await keys(`run ${device}:absolute /a 8192\\x0d`, 3500));
        assert.equal((await memory(0xc2f0))[0], 0x42, 'absolute native entry executed');
    }
    await enter('8:');
    await settled(await keys('return\\x0d', 3500), s => s.endsWith('8:>'));
    assert.equal((await variable('drive', 1))[0], 8, 'current disk restored');
    await enter('0:');
    console.log(
        'PASS explicit and implicit disk/cartridge SYS-RTS, direct warm-start and BASIC-error returns with saved state');

    // Failed session save: N leaves the shell; Y runs but cannot revive old state.
    const asm = fs.readFileSync('build/easyflash/bridge.asm', 'utf8');
    const at = parseInt(asm.match(/^([0-9a-f]+) : 20 00 80 JSR/m)[1], 16) + 3;
    async function fail(answer) {
        const point =
            (await command('break exec ' + at.toString(16))).match(/(?:BREAK|WATCH):\s*(\d+)/i);
        assert(point);
        await command('keybuf run 0:return\\x0d');
        await command('x');
        await delay(1200);
        // RUN looks up the file before saving; let those driver calls finish first.
        for (let i = 0; i < 60 && (await memory(0x800))[0] !== 14; i++) {
            await command('x');
            await delay(100);
        }
        assert.equal((await memory(0x800))[0], 14);
        await command('> 0804 19');
        await command('delete ' + point[1]);
        await command('x');
        await delay(600);
        const prompt = await screen();
        assert(prompt.replace(/\s/g, '').includes('Runprogramanyway(Y/N)?'), prompt);
        return settled(await keys(answer, 3500), s => s.endsWith('0:>'));
    }
    await command('> c2f0 00');
    await fail('n');
    assert.equal((await memory(0xc2f0))[0], 0);
    await check('set', 'KEEP=preserved');
    const fallback = await fail('y');
    assert(fallback.includes('Using defaults.'), fallback);
    assert.equal((await memory(0xc2f0))[0], 0x41);
    assert.equal((await variable('envused', 2)).readUInt16LE(), 0);
    console.log(
        'PASS failed RUN save cancellation and defaults fallback without older-session restoration');

    // Reinitializing BASIC vectors deliberately removes our optional hook.
    const basic = await settled(await keys('run 0:resetvec\\x0d', 3500), s => s.endsWith('ready.'));
    assert(basic.endsWith('ready.'));
    assert.deepEqual(await memory(0x302, 0x303), [0x83, 0xa4]);
    assert.equal((await memory(0xc2f0))[0], 0x43);
    await command('reset 0');
    await command('x');
    await delay(3500);
    await settled(await screen(), s => s.endsWith('0:>'));
    await check('set', 'BOOT=must-not-run');
    console.log(
        'PASS lost hook leaves BASIC usable; cartridge reset retains ordinary startup behavior');
};

require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process'), {tool} = require('./setup');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
require('./shell')('filename-completion', async ({disk, command, keys, enter, screen, memory}) => {
    const program = Buffer.from([
        1, 8, 11, 8, 10, 0, 0x9e, 50, 48, 54, 49, 0, 0, 0,
        0xa9, 0x41, 0x8d, 0xf0, 0xc2, 0x60
    ]);
    fs.writeFileSync('build/completion-program.prg', program);
    await command('detach 8');
    execFileSync(tool('vice', 'c1541'), [
        '-attach', disk, '-write', 'build/completion-program.prg', 'test d420 mono,p',
        '-write', 'build/completion-program.prg', 'test second mono,p'
    ], {stdio: 'pipe', windowsHide: true});
    await command(`attach "${disk}" 8`);
    await enter('dir /b');
    async function complete(expected) {
        let text;
        for (let i = 0; i < 6; ++i) {
            await command('> 028d 02');
            await command('x');
            await delay(700);
            await command('> 028d 00');
            await command('x');
            await delay(150);
            text = (await screen()).split('\n').at(-1);
            if (expected.test(text)) return text;
        }
        assert.fail('Completion mismatch: ' + text);
    }
    await enter('cls');
    await keys('t');
    await complete(/^8:>"TEST D420 MONO"$/i);
    await complete(/^8:>"TEST SECOND MONO"$/i);
    await complete(/^8:>"TEST D420 MONO"$/i);
    await command('> c2f0 00');
    await enter('');
    assert.equal((await memory(0xc2f0))[0], 0x41, 'completed first-token program executes');
    for (const [prefix, expected] of [
        ['8:t', /^8:>"8:TEST D420 MONO"$/i],
        ['"t', /^8:>"TEST D420 MONO"$/i],
        ['run t', /^8:>RUN "TEST D420 MONO"$/i],
        ['type t', /^8:>TYPE "TEST D420 MONO"$/i],
        ['run', /^8:>RUN "[^"]+"$/i],
        ['type', /^8:>TYPE "[^"]+"$/i]
    ]) {
        await keys(prefix);
        await complete(expected);
        await keys('\\x03');
    }
    console.log('PASS first-token completion, spaced filenames, cycling, program execution, drive prefixes, quotes and built-in argument completion');
}).catch(error => { console.error(error); process.exitCode = 1; });

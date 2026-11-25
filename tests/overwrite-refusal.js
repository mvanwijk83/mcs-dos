// A real cartridge COPY must retain both files when overwrite is declined.
const assert = require('assert/strict');
const messages = require('./output');
require('./shell')('overwrite-refusal', async ({enter, keys, until}) => {
    await enter('set copycmd=');
    async function contents(name, expected) {
        await enter('cls');
        const text = await enter('type ' + name);
        assert(text.includes(expected), text);
    }
    for (const device of ['0:', '8:']) {
        await enter(device);
        await enter('echo source contents >source.txt');
        await enter('echo target contents >target.txt');
        for (const command of ['copy', 'move']) {
            for (const answer of ['n', '\\x03']) {
                await enter('cls');
                await keys(command + ' source.txt target.txt\\x0d');
                await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
                await keys(answer);
                const result = await until(text => text.endsWith(device + '\\>'));
                assert(!result.includes(messages.SYSOUT_ONE_FILE_COPIED.trim()), result);
                assert(!result.includes(messages.SYSOUT_ONE_FILE_MOVED.trim()), result);
                await contents('target.txt', 'target contents');
                await contents('source.txt', 'source contents');
            }
        }
        await enter('set copycmd=/p');
        await enter('cls');
        await keys('copy source.txt target.txt /-p\\x0d');
        await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
        await keys('n');
        await until(text => text.endsWith(device + '\\>'));
        await contents('target.txt', 'target contents');
        await enter('set copycmd=');
        await enter('cls');
        await keys('copy source.txt target.txt\\x0d');
        await until(text => text.includes(messages.SYSOUT_OVERWRITE_FILE));
        await keys('y');
        const accepted = await until(text => text.endsWith(device + '\\>'));
        assert(accepted.includes(messages.SYSOUT_ONE_FILE_COPIED.trim()), accepted);
        await contents('target.txt', 'source contents');
        console.log('PASS overwrite refusal, STOP, /-P and acceptance on ' + device);
    }
    console.log('PASS cartridge/disk COPY and MOVE overwrite refusal, STOP, /-P and acceptance');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

// Interactive wildcard deletion must honor each answer on both media.
const assert = require('assert/strict');
module.exports = async ({command, keys, enter, check, disk}) => {
    let s;
    await command('attach "' + disk + '" 8');
    for (const dev of [0, 8]) {
        await enter(dev + ':');
        for (const name of ['za.txt', 'zb.txt', 'zc.txt'])
            await enter('echo test >' + name, 1800);
        await enter('cls');
        s = await keys('del z?.txt\\x0d', 3000);
        assert(s.includes('Delete ZA.TXT (Y/N)?'), s);
        s = await keys('y', 2000);
        assert(s.includes('Delete ZB.TXT (Y/N)?'), s);
        s = await keys('n');
        assert(s.includes('Delete ZC.TXT (Y/N)?'), s);
        s = await keys('y', 2000);
        assert(s.trimEnd().endsWith(dev + ':>'), s);
        await enter('cls');
        s = await check('dir z* /b', 'ZB.TXT');
        assert(!s.includes('ZA.TXT') && !s.includes('ZC.TXT'), s);
        await enter('del z* /p');
        await enter('cls');
        s = await enter('dir z* /b');
        assert(!s.includes('ZB.TXT'), s);
    }
    console.log('PASS wildcard DEL individual Yes/No choices and /P on cartridge and disk');
    return;
};

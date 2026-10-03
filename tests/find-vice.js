// Verify two real disk cursors and FIND switches on the cartridge.
const fs = require('fs'), assert = require('assert/strict'),
      {execFileSync} = require('child_process');
const {tool} = require('./setup');
require('./shell')('find', async ({disk, command, enter}) => {
    await command('detach 8');
    const bytes = require('../scripts/petscii')('DOS\rdos\rno match\rDOS final');
    fs.writeFileSync('build/find-fixture', bytes);
    execFileSync(tool('vice', 'c1541'),
        ['-attach', disk, '-write', 'build/find-fixture', 'findtest,s'],
        {stdio: 'pipe', windowsHide: true});
    await command('attach "' + disk + '" 8');
    await enter('dir /b');
    async function check(cmd, text) {
        await enter('cls');
        const out = await enter(cmd);
        assert(out.includes(text), cmd + '\n' + out);
    }
    await check('find "DOS" findtest', 'DOS final', 5000);
    await check('find /c "DOS" findtest', '---- FINDTEST: 2', 5000);
    await check('find /i/c "DOS" findtest', '---- FINDTEST: 3', 5000);
    await check('find /v/n "DOS" findtest', '[3]no match', 5000);
    console.log('PASS VICE FIND two disk cursors, case, counts, inversion and numbering');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

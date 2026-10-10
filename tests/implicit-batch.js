require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process'), {tool} = require('./setup');
const messages = require('./output');
require('./shell')('implicit-batch', async ({disk, command, enter}) => {
    const fixtures = {
        'test.bat': '@ECHO OFF\rECHO BATCH-OK\r',
        'two words.bat': '@ECHO OFF\rECHO QUOTED-BATCH-OK\r',
        'parent.bat': '@ECHO OFF\rchild.bat\rECHO PARENT-OK\r',
        'child.bat': '@ECHO OFF\rECHO CHILD-SHOULD-NOT-RUN\r'
    };
    await command('detach 8');
    const args = ['-attach', disk];
    let i = 0;
    for (const [name, text] of Object.entries(fixtures)) {
        const file = 'build/implicit-batch-' + i++;
        fs.writeFileSync(file, require('../scripts/petscii')(text));
        args.push('-write', file, name + ',s');
    }
    execFileSync(tool('vice', 'c1541'), args, {stdio: 'pipe', windowsHide: true});
    await command(`attach "${disk}" 8`);
    await enter('dir /b');
    for (const cmd of ['test.bat', 'run test.bat', '8:test.bat', '8:TEST.BAT']) {
        await enter('cls');
        const text = await enter(cmd);
        assert(text.includes('BATCH-OK'), cmd + '\n' + text);
    }
    await enter('cls');
    assert((await enter('"two words.bat"')).includes('QUOTED-BATCH-OK'));
    await enter('copy test.bat 0:test.bat');
    await enter('cls');
    assert((await enter('0:test.bat')).includes('BATCH-OK'));
    await enter('0:');
    await enter('cls');
    assert((await enter('test.bat')).includes('BATCH-OK'));
    await enter('8:');
    await enter('cls');
    let text = await enter('missing.bat');
    assert(text.includes(messages.SYSOUT_BAD_CMD_OR_FILE_NAME.trim()), text);
    await enter('cls');
    text = await enter('parent.bat');
    assert(text.includes(messages.SYSOUT_NESTED_BATCH.trim()) && text.includes('PARENT-OK'), text);
    assert(!text.includes('CHILD-SHOULD-NOT-RUN'), text);
    await enter('cls');
    text = await enter('run test.bat /a 8192');
    assert(text.includes(messages.SYSOUT_INVALID_SWITCH_BATCH.trim()) && !text.includes('BATCH-OK'), text);
    console.log('PASS implicit SEQ batches on disk/cartridge, quoted names, explicit RUN, missing files and nested-batch protection');
}).catch(error => { console.error(error); process.exitCode = 1; });

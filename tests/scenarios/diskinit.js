const messages = require('../output');
// Disk initialization selects the right device and leaves subsequent reads usable.
const assert = require('assert/strict');
module.exports = async ({command, enter, check, disk}) => {
    let s;
    await check('help diskinit', 'Resets disk drive state and forces a');
    await check('diskinit', messages.SYSOUT_UNSUPPORTED_OP_CRT.trim());
    await check('diskinit 0:', messages.SYSOUT_UNSUPPORTED_OP_CRT.trim());
    await command('attach "' + disk + '" 8');
    await enter('cls');
    s = await enter('diskinit 8:');
    assert.equal(s.trim().replace(/\n+/g, '\n'), '0:>diskinit 8:\n0:>', s);
    await check('dir 8: /b', 'BLOB');
    await enter('8:');
    await enter('cls');
    s = await enter('diskinit');
    assert.equal(s.trim().replace(/\n+/g, '\n'), '8:>diskinit\n8:>', s);
    await check('dir /b', 'BLOB');
    await check('diskinit 0:', messages.SYSOUT_UNSUPPORTED_OP_CRT.trim());
    console.log(
        'PASS DISKINIT help, cartridge rejection, explicit/current disk and subsequent directory reads');
    return;
};

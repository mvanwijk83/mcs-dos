const messages = require('../output');
// Drive probing and identity rendering across supported models and identifier modes.
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('../setup');
module.exports = async ({command, enter, check, root}) => {
    let s;
    s = await check('chkdsk', 'Drive model is EasyFlash');
    assert(s.includes('\n\nDrive model is EasyFlash\nDrive identifier is 0\n'), s);
    s = await check('chkdsk /c', 'already compact');
    assert(!s.includes('Drive model'), s);
    for (const [dev, model, ext] of [[8, 1541, 'd64'], [9, 1571, 'd71'], [10, 1581, 'd81'],
             [8, 1542, 'd64'], [9, 1570, 'd64']]) {
        const shown = model === 1542 ? '1541-II' : String(model);
        const file = root + '/build/easyflash/info-' + model + '.' + ext;
        execFileSync(tool('vice', 'c1541'), ['-format', 'info,mc', ext, file],
            {stdio: 'pipe', windowsHide: true});
        const result = await command(`resourceset "Drive${dev}Type" "${model}"`);
        assert(!result.includes('ERROR'), result);
        await command(`resourceset "Drive${dev}TrueEmulation" "1"`);
        const attached = await command(`attach "${file}" $${dev.toString(16)}`);
        assert(!/error|invalid/i.test(attached), attached);
        await enter('cls');
        s = await check('sysinfo', `Drive ${dev}: ${dev < 10 ? ' ' : ''}${shown} Floppy Drive`);
        assert(s.includes('          ' + (model === 1581      ? '3.5" 800K DS/DD'
                                             : model === 1571 ? '5.25" 340K DS/DD'
                                                              : '5.25" 170K SS/DD')),
            s);
        for (const ids of ['CBM', 'DOS']) {
            await enter('set driveids=' + ids);
            s = await check('chkdsk ' + dev + ':', 'Drive model is ' + shown);
            assert(s.includes('\n\nDrive model is ' + shown + '\nDrive identifier is ' + dev +
                              ' (CBM) / ' + String.fromCharCode(65 + dev - 8) + ' (DOS)\n'),
                s);
        }
    }
    s = await check('chkdsk 8: /v', messages.SYSOUT_DISK_VALIDATION_COMPLETE.trim());
    assert(!s.includes('Drive model'), s);
    console.log(
        'PASS M-R drive models 1541/1541-II/1570/1571/1581, cartridge identity, both DRIVEIDS modes and switch exclusion');
    return;
};

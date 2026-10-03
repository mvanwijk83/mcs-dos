// Machine reports must match the emulated hardware without changing probe registers.
const assert = require('assert/strict');
module.exports = async ({command, memory, enter, check, kernalName}) => {
    let s;
    // A coincidental UCI signature in EasyFlash IO2 RAM must not identify a board
    // or leave the command/register bytes changed.
    const io2 = await memory(0xdf1c, 0xdf1f);
    await command('> df1c 00 c9 aa bb');
    if (process.argv.includes('--c128')) {
        for (const revision of [0, 1, 2]) {
            const result = await command(`resourceset "VDCRevision" "${revision}"`);
            assert(!result.includes('ERROR'), result);
            await enter('cls');
            const before = await memory(0xd600);
            s = await check(
                'sysinfo', `Commodore ${revision === 2 ? '128DCR' : '128'} personal computer`);
            assert(s.includes('128 KB RAM') && s.includes('CPU:      MOS 8502'), s);
            assert.equal(
                (await memory(0xd600))[0] & 7, before[0] & 7, 'VDC revision remains unchanged');
        }
        await command('resourceset "VDCRevision" "0"');
    }
    await enter('cls');
    s = await check('sysinfo', process.argv.includes('--c128') ? 'Commodore 128 personal computer'
                               : process.argv.includes('--sx64')
                                   ? 'Commodore SX-64 portable computer'
                                   : 'Commodore 64 personal computer');
    assert(s.includes(process.argv.includes('--c128') ? '128 KB RAM' : '64 KB RAM'), s);
    assert(s.includes(process.argv.includes('--ntsc') ? 'NTSC display mode (60 Hz)'
                                                      : 'PAL display mode (50 Hz)'),
        s);
    assert(s.includes(process.argv.includes('--c128')   ? 'CPU:      MOS 8502'
                      : process.argv.includes('--sx64') ? 'CPU:      MOS 6510'
                                                        : 'CPU:      MOS 6510/8500'),
        s);
    assert(
        !s.includes('Unknown device') && !s.includes('Drive 10:') && !s.includes('Drive 11:'), s);
    assert(s.includes((kernalName                           ? 'KERNAL:   ' + kernalName
                          : process.argv.includes('--sx64') ? 'KERNAL:   SX-64 (ROM ID 67)'
                                                            : 'KERNAL:   Revision 3') +
                      '\n'),
        s);
    assert.deepEqual(await memory(0xdf1c, 0xdf1f), [0, 0xc9, 0xaa, 0xbb],
        'false UCI signature leaves IO2 RAM intact');
    await command('> df1c ' + io2.map(b => b.toString(16).padStart(2, '0')).join(' '));
    await enter('cls');
    s = await enter('splash');
    assert(!s.includes('KB RAM'), s);
    console.log('PASS SYSINFO machine, RAM, raster standard, CPU, KERNAL and SPLASH exclusion');
    return;
};

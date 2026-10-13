// Machine reports must match the emulated hardware without changing probe registers.
const assert = require('assert/strict');
module.exports = async ({command, memory, enter, check, kernalName, root}) => {
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
    assert(s.includes(process.argv.includes('--ntsc') ? 'Video:    VIC-II (NTSC)'
                                                      : 'Video:    VIC-II (PAL)'),
        s);
    assert(!s.includes('display mode') && !s.includes('Hz'), s);
    assert(s.indexOf('KERNAL:') < s.indexOf('Video:') && s.indexOf('Video:') < s.indexOf('Drive 8:'), s);
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
    await enter('set driveids=dos');
    await enter('cls');
    s = await check('sysinfo', 'Drive A:  ');
    assert(!s.includes('Drive 8:'), s);
    await enter('set driveids=c64');
    // A read-only UCI bus ID is used only after the UCI transport was verified.
    // Inject that verified base to exercise SoftIEC reporting over a real IEC DIR.
    const fs = require('fs');
    const image = root + '/build/easyflash/softiec-report.d64';
    require('child_process').execFileSync(require('../setup').tool('vice', 'c1541'),
        ['-format', 'softiec,mc', 'd64', image], {stdio:'pipe', windowsHide:true});
    const sample = root + '/build/easyflash/softiec-size.prg';
    fs.writeFileSync(sample, Buffer.alloc(254));
    require('child_process').execFileSync(require('../setup').tool('vice', 'c1541'),
        ['-attach', image, '-write', sample, 'approx'], {stdio:'pipe', windowsHide:true});
    await command('attach "' + image + '" $8');
    const labels = fs.readFileSync('build/easyflash/shell-prg.lbl', 'utf8');
    const address = parseInt(labels.match(/al ([0-9a-f]+) \.ultimatebase/i)[1], 16);
    const savedBase = await memory(address, address + 1);
    const savedIo = await memory(0xdf1b, 0xdf1d);
    await command('> ' + address.toString(16) + ' 1c df');
    await command('> df1b 08 00 c9');
    await enter('cls');
    s = await check('dir 8:', 'APPROX');
    assert(/APPROX\s+PRG\s+256/.test(s) && /1 File\(s\)\s+256 bytes/.test(s), s);
    assert(!s.includes('Unsupported drive type') && !s.includes('Disk ID') &&
           !/blocks|bytes free/i.test(s), s);
    await enter('cls');
    s = await check('diskid 8:', 'Unsupported drive type');
    assert(!s.includes('New disk ID'), s);
    await command('> ' + address.toString(16) + ' ' + savedBase.map(b => b.toString(16).padStart(2,'0')).join(' '));
    await command('> df1b ' + savedIo.map(b => b.toString(16).padStart(2,'0')).join(' '));
    await enter('cls');
    s = await enter('splash');
    assert(!s.includes('KB RAM'), s);
    console.log('PASS SYSINFO machine, RAM, raster standard, CPU, KERNAL and SPLASH exclusion');
    return;
};

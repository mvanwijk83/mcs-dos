const messages = require('../output');
// Command options, file attributes and cartridge/disk accounting.
const fs = require('fs');
const assert = require('assert/strict');
module.exports = async ({command, keys, enter, check, disk}) => {
    let s;
    await enter('cls');
    s = await keys('pause Press a key\\x0d');
    assert(s.endsWith('Press a key'), s);
    assert(!s.includes(messages.SYSOUT_PRESS_ANY_KEY), s);
    await keys('x');
    await enter('cls');
    s = await keys('pause\\x0d');
    assert(s.includes(messages.SYSOUT_PRESS_ANY_KEY.trim()), s);
    await keys('x');
    await enter('cls');
    const layout = JSON.parse(fs.readFileSync('build/easyflash/layout.json'));
    const capacity = layout.fileBytes + layout.available;
    s = await check('chkdsk', capacity.toLocaleString('en-US') + ' bytes total disk space');
    assert(s.includes(
               layout.fileBytes.toLocaleString('en-US') + ' bytes allocated in ' +
               require('../easyflash-image').readImage('build/easyflash/MCS-DOS.crt').files.size +
               ' files'),
        s);
    assert(s.includes(layout.available.toLocaleString('en-US') + ' bytes available on disk'), s);
    assert(!s.includes('memory') && !s.includes('blocks') && !s.includes('reserve'), s);
    const total = 65536, stack = 2048;
    const rom = layout.romWindow.end - layout.romWindow.start;
    const report = [
        [total, messages.SYSOUT_MEM_TOTAL],
        [layout.residentBytes, messages.SYSOUT_MEM_SHELL],
        [stack, messages.SYSOUT_MEM_STACK],
        [rom, messages.SYSOUT_MEM_ROM_WINDOW],
        [total - layout.residentBytes - stack - rom - layout.freeRam, messages.SYSOUT_MEM_SYSTEM],
        [layout.freeRam, messages.SYSOUT_MEM_FREE]
    ].map(([value, format]) => {
        const amount = value.toLocaleString('en-US').padStart(10);
        return format.replace('%10s', amount).trimEnd();
    }).join('\n');
    await check('mem', report);
    await check('mem /?', 'Displays the amount of used and free');
    await check('mem /s', messages.SYSOUT_INVALID_PARAM.trim());
    await enter('mem >mem.txt', 2000);
    await check('type mem.txt', report);
    await enter('echo one >lines.txt', 2000);
    await enter('echo two >>lines.txt', 2000);
    await enter('echo three >>lines.txt', 2000);
    await enter('cls');
    s = await check('type lines.txt /h:1', 'one');
    assert(!s.includes('two'), s);
    await enter('cls');
    s = await check('type lines.txt /t:1', 'three');
    assert(!s.includes('one'), s);
    await enter('cls');
    await check('type lines.txt /hex', '000000');
    await enter('type lines.txt /t:1 >tail.txt', 2000);
    await enter('cls');
    s = await check('type tail.txt', 'three');
    assert(!s.includes('one'), s);
    await check('attrib +r lines.txt', messages.SYSOUT_INVALID_PARAM.trim());
    await enter('attrib +l lines.txt');
    s = await check('attrib lines.txt', 'L    LINES.TXT');
    await enter('attrib -l lines.txt');
    await check('move lines.txt tail.txt /p', messages.SYSOUT_ONE_FILE_MOVED.trim());
    await enter('cls');
    await check('type tail.txt /t:2', 'two');
    await command('attach "' + disk + '" 8');
    s = await check('chkdsk 8:', 'total blocks on disk');
    assert(!s.includes('memory'), s);
    console.log('PASS MEM report/help/redirection, CHKDSK totals, TYPE options/redirection, ATTRIB L and MOVE /P');
    return;
};

// Exercise the real parser, bank gates, paths and status reports in VICE.
const assert = require('assert/strict');
require('./shell')('device-settings', async ({enter, keys, until}) => {
    async function fresh(command) {
        await enter('cls');
        return enter(command);
    }
    let out = await fresh('mode');
    assert(out.includes('Status for device CON:\n----------------------\n' +
        '  Character set:     C64 ROM\n  Text color:        15\n' +
        '  Background color:  0\n  Border color:      0\n\n' +
        'Status for device DRV:\n----------------------\n  Identification:    C64'), out);
    await enter('chcp 0:\\cga.cpi');
    out = await fresh('mode con:');
    assert(out.includes('Character set:     CGA.CPI') && !out.includes('Status for device DRV'), out);
    await enter('mode con cp=0:\\vga.cpi');
    assert((await fresh('mode con')).includes('Character set:     VGA.CPI'));
    await enter('chcp');
    assert((await fresh('mode con')).includes('Character set:     C64'));
    await enter('mode con color=2,6,7');
    out = await fresh('mode con');
    assert(out.includes('Text color:        2') && out.includes('Background color:  6') &&
        out.includes('Border color:      7'), out);
    await enter('mode con colors=15,0,0');
    await enter('copy 0:cga.cpi "8:font two.cpi"');
    await enter('mode con "CP=8:\\font two.cpi"');
    out = await fresh('mode con');
    assert(out.includes('Character set:     FONT TWO.CPI'), out);
    out = await fresh('mode con colors=1,2,16');
    assert(out.includes('Invalid color'), out);
    for (const command of ['mode con ids=dos', 'mode drv cp=cga.cpi', 'mode drv ids=bad',
                           'mode printer', 'mode con cp=', 'chcp cga.cpi extra']) {
        out = await fresh(command);
        assert(out.includes('Invalid parameter'), out);
    }
    await enter('set charset=ignored');
    await enter('set color=1,2,3');
    await enter('set prompt=ignored');
    await enter('set driveids=dos');
    out = await fresh('mode');
    assert(out.includes('Character set:     FONT TWO.CPI') && out.includes('Identification:    C64') &&
        out.includes('Text color:        15'), out);
    out = await keys('mode drv: ids=dos\\x0d');
    await until(s => s.endsWith('A:\\>'));
    out = await keys('mode drv\\x0d');
    assert(out.includes('Identification:    DOS'), out);
    await keys('mode drv ids=c64\\x0d');
    await until(s => s.endsWith('8:\\>'));
    await keys('prompt ready $p$g\\x0d');
    await until(s => s.endsWith('ready 8:\\>'));
    await keys('prompt\\x0d');
    await until(s => s.endsWith('8:\\>'));
    await enter('chcp');
    console.log('PASS CHCP, PROMPT, MODE reports, aliases, quoted CPI paths, validation and ordinary SET variables');
}).catch(error => { console.error(error); process.exitCode = 1; });

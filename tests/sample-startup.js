const assert = require('assert/strict');
require('./shell')('sample-startup', async ({enter, keys, until}) => {
    await enter('0:');
    const config = await enter('copy 0:config.sample 0:config.sys');
    assert(config.includes('1 file(s) copied.'), config);
    const copied = await enter('copy autoexec.sample autoexec.bat');
    assert(copied.includes('1 file(s) copied.'), copied);
    await keys('reboot\\x0d');
    // The pound-key slot now displays the DOS backslash.
    const boot = await until(s => s.endsWith('0:\\>'));
    assert(boot.includes('MCS-DOS Version'), boot);
    assert(
        !boot.includes('Bad command') && !boot.includes('Cannot load') && !boot.includes('Invalid'),
        boot);
    await keys('mode\\x0d');
    const settings = await until(s => s.endsWith('0:\\>'));
    for (const line of ['Character set:     CGA.CPI', 'Text color:        15',
                        'Background color:  0', 'Border color:      0', 'Identification:    DOS'])
        assert(settings.includes(line), settings);
    console.log(
        'PASS public config samples copied to active files, startup device, batch settings and prompt applied');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

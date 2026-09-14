const assert = require('assert/strict');
require('./shell')('sample-startup', async ({enter, keys, until}) => {
    const copied = await enter('copy autoexec.sample autoexec.bat');
    assert(copied.includes('1 file(s) copied.'), copied);
    await keys('reboot\\x0d');
    // The backslash glyph uses screen code 96, represented as ` by the harness.
    const boot = await until(s => s.endsWith('A:`>'));
    assert(boot.includes('MCS-DOS Version'), boot);
    assert(!boot.includes('Bad command') && !boot.includes('Cannot load'), boot);
    await keys('set\\x0d');
    const settings = await until(s => s.endsWith('A:`>'));
    for (const line of ['DRIVEIDS=dos', 'CHARSET=cga', 'COLOR=15,0,0', 'PROMPT=$p$c$h$g'])
        assert(settings.includes(line), settings);
    console.log('PASS public AUTOEXEC.SAMPLE copied to AUTOEXEC.BAT, executed on REBOOT, settings and prompt applied');
}).catch(error => { console.error(error); process.exitCode = 1; });

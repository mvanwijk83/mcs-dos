// Compare complete fonts and VIC mapping after boot, splash, reboot and CPI loading.
const fs = require('fs');
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('../setup');
module.exports = async ({command, memory, keys, enter, check, defaultFont, root, disk}) => {
    await check('dir', 'CGA.CPI');
    await defaultFont();
    await enter('splash');
    await defaultFont();
    await enter('reboot');
    await defaultFont();
    await check('dir', 'CGA.CPI');
    await command(`screenshot "${root}/build/easyflash/display-${
        process.argv.includes('--ntsc') ? 'ntsc' : 'pal'}.png" 2`);
    if (process.argv.includes('--display-fonts')) {
        const prompt = await keys('set prompt=live$p$g\\x0d');
        assert(prompt.endsWith('live0:\\>'), prompt);
        await enter('set prompt=');
        await enter('set color=2,6,7');
        assert.deepEqual(await memory(0xd020, 0xd021), [0xf7, 0xf6]);
        assert.equal((await memory(0x286))[0], 2);
        await enter('set color=');
        assert.deepEqual(await memory(0xd020, 0xd021), [0xf0, 0xf0]);
        assert.equal((await memory(0x286))[0], 15);
        await enter('echo set prompt=live$p$g >autoexec.bat', 4000);
        await enter('echo set prompt= >>autoexec.bat', 4000);
        const batch = await enter('reboot', 3500);
        assert(batch.includes('live0:\\>set prompt='), batch);

        const patch = fs.readFileSync('build/CGA.CPI');
        for (const name of ['CGA', 'VGA']) {
            await enter('set charset=' + name.toLowerCase());
            await defaultFont(fs.readFileSync('build/' + name + '.CPI'));
            await command(`screenshot "${root}/build/easyflash/display-${name.toLowerCase()}.png" 2`);
        }
        await check('set charset=missing', 'Cannot load MISSING.CPI');
        await check('set', 'CHARSET=vga');
        await defaultFont(fs.readFileSync('build/VGA.CPI'));
        await enter('set charset=');
        await defaultFont();
        await enter('echo set charset=missing >autoexec.bat', 4000);
        await enter('reboot');
        await defaultFont();

        // A one-glyph CPI must load over the default font, even when another CPI is active.
        const partial = Buffer.from(patch.subarray(0, 15));
        partial[5] = 1;
        const checksum = partial.subarray(6).reduce((sum, byte) => sum + byte, 0);
        const valid = Buffer.concat([partial, Buffer.from([checksum & 255, checksum >> 8])]);
        const invalid = Buffer.concat([partial, Buffer.from([0, 0])]);
        fs.writeFileSync('build/easyflash/partial.cpi', valid);
        fs.writeFileSync('build/easyflash/invalid.cpi', invalid);
        execFileSync(tool('vice', 'c1541'),
            ['-attach', disk, '-write', 'build/easyflash/partial.cpi', 'partial.cpi,s',
                '-write', 'build/easyflash/invalid.cpi', 'invalid.cpi,s'],
            {stdio: 'pipe', windowsHide: true});
        await command(`attach "${disk}" 8`);
        await enter('echo bootdrv=8 >config.sys', 4000);
        await enter('reboot');
        await defaultFont(patch);
        await enter('0:');
        await check('set charset=invalid', 'Cannot load INVALID.CPI');
        await defaultFont(patch);
        await enter('set charset=partial');
        await defaultFont(valid);
        console.log('PASS live and batch display settings, external CPI loading and invalid CPI rollback');
    }
    console.log('PASS default charset after boot, DIR, SPLASH and REBOOT');
    return;
};

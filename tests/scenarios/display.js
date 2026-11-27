// Compare complete fonts and VIC mapping after boot, splash, reboot and CPI loading.
const fs = require('fs');
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('../setup');
module.exports = async ({command, memory, keys, enter, check, defaultFont, root, disk}) => {
    await check('dir', 'CGA.CPI');
    await defaultFont();
    await check('splash', 'Bad command or file name');
    await defaultFont();
    await enter('reboot');
    await defaultFont();
    await check('dir', 'CGA.CPI');
    await command(`screenshot "${root}/build/easyflash/display-${
        process.argv.includes('--ntsc') ? 'ntsc' : 'pal'}.png" 2`);
    if (process.argv.includes('--display-fonts')) {
        const prompt = await keys('prompt live$p$g\\x0d');
        assert(prompt.endsWith('live0:\\>'), prompt);
        await enter('prompt ');
        await enter('mode con color=2,6,7');
        assert.deepEqual(await memory(0xd020, 0xd021), [0xf7, 0xf6]);
        assert.equal((await memory(0x286))[0], 2);
        await enter('mode con color=15,0,0');
        assert.deepEqual(await memory(0xd020, 0xd021), [0xf0, 0xf0]);
        assert.equal((await memory(0x286))[0], 15);
        await enter('echo prompt live$p$g >autoexec.bat', 4000);
        await enter('echo prompt  >>autoexec.bat', 4000);
        const batch = await enter('reboot', 3500);
        assert(batch.includes('live0:\\>prompt'), batch);

        const patch = fs.readFileSync('build/CGA.CPI');
        for (const name of ['CGA', 'VGA']) {
            await enter('chcp ' + name.toLowerCase() + '.cpi');
            await defaultFont(fs.readFileSync('build/' + name + '.CPI'));
            await command(`screenshot "${root}/build/easyflash/display-${name.toLowerCase()}.png" 2`);
        }
        // Check every shipped alternate font, including inverse underscores.
        for (const name of ['PET', 'AMIGA', 'ATARIST', 'ZXSPECTRUM']) {
            const file = name === 'PET' ? 'disk-content/PET.CPI' : 'extras/' + name + '.CPI';
            const font = fs.readFileSync(file);
            execFileSync(tool('vice', 'c1541'),
                ['-attach', disk, '-write', file, name.toLowerCase() + '.cpi,s'],
                {stdio: 'pipe', windowsHide: true});
            await command(`attach "${disk}" 8`);
            await enter('chcp 8:' + name.toLowerCase() + '.cpi');
            await defaultFont(font);
        }
        await enter('chcp vga.cpi');
        await check('chcp missing.cpi', 'Cannot load MISSING.CPI');
        await check('mode con', 'Character set:     VGA.CPI');
        await defaultFont(fs.readFileSync('build/VGA.CPI'));
        await enter('chcp');
        await defaultFont();
        await enter('echo chcp missing.cpi >autoexec.bat', 4000);
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
        await check('chcp 8:invalid.cpi', 'Cannot load INVALID.CPI');
        await defaultFont(patch);
        await enter('chcp 8:partial.cpi');
        await defaultFont(valid);
        console.log('PASS live and batch display settings, external CPI loading and invalid CPI rollback');
    }
    console.log('PASS default charset after boot, DIR, removed SPLASH and REBOOT');
    return;
};

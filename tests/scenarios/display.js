// Compare complete fonts and VIC mapping after boot, splash, reboot and CPI loading.
const fs = require('fs');
module.exports = async ({command, enter, check, defaultFont, root, disk}) => {
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
        const patch = fs.readFileSync('build/CGA.CPI');
        await enter('echo set charset=cga >autoexec.bat', 4000);
        await enter('reboot');
        await defaultFont(patch);
        await enter('echo set charset=missing >autoexec.bat', 4000);
        await enter('reboot');
        await defaultFont();
        await command(`attach "${disk}" 8`);
        await enter('echo bootdrv=8 >config.sys', 4000);
        await enter('reboot');
        await defaultFont(patch);
        console.log('PASS full cartridge/external CPI fonts and missing-file fallback');
    }
    console.log('PASS default charset after boot, DIR, SPLASH and REBOOT');
    return;
};

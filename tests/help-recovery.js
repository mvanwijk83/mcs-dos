const assert = require('assert/strict'), fs = require('fs');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
require('./shell')('help-recovery', async ({disk, command, keys, enter, until}) => {
    const original = fs.readFileSync('build/COMMANDS.HLP');
    const version = Buffer.from(original); version[3]++;
    const count = Buffer.from(original); count[4]--;
    for (const [name, resource] of [['missing', null], ['version', version], ['count', count], ['truncated', original.subarray(0, 8)]]) {
        await command('detach 8');
        fs.copyFileSync('build/MCS-DOS.d64', disk);
        const args = ['-attach', disk, '-delete', 'commands.hlp'];
        if (resource) {
            fs.writeFileSync('build/bad-help', resource);
            args.push('-write', 'build/bad-help', 'commands.hlp,s');
        }
        execFileSync(tool('vice', 'c1541'), args, {stdio: 'pipe'});
        await command(`attach "${disk}" 8`);
        await enter('cls');
        await keys('help reboot\\x0d');
        await until(s => s.replace(/\s/g, '').includes('InsertMCS-DOSdisk'));
        await keys('\\x03');
        await until(s => s.endsWith('8:>'));
        assert((await enter('echo still-working')).includes('still-working'), name);
    }
    await command('detach 8');
    fs.copyFileSync('build/MCS-DOS.d64', disk);
    await command(`attach "${disk}" 8`);
    assert((await enter('help cls')).includes('Clears the screen'), 'valid disk recovers help');
    console.log('PASS missing, incompatible and truncated help, cancellation, subsequent I/O and recovery');
}).catch(error => { console.error(error); process.exitCode = 1; });

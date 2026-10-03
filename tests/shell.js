// An owned emulator for regressions which do not need custom display plumbing.
const {tool, root} = require('./setup');
const fs = require('fs'), net = require('net'), path = require('path');
const assert = require('assert/strict');
const {spawn, execFileSync} = require('child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Own a cartridge/disk session. name selects scratch files; test receives monitor helpers.
 * prepare, when supplied, edits only the disposable CRT before VICE starts. */
module.exports = async function withShell(name, test, prepare) {
    const disk = path.join(root, 'build', 'test-' + name + '.d64').replaceAll('\\', '/');
    // Each test starts with a blank disk and its own writable cartridge.
    const crt = path.join(root, 'build', 'test-' + name + '.crt').replaceAll('\\', '/');
    fs.copyFileSync('build/easyflash/MCS-DOS.crt', crt);
    if (prepare)
        prepare(crt);
    execFileSync(tool('vice', 'c1541'),
        [
            '-format', 'test,mc', 'd64', disk, '-attach', disk, '-write', 'build/AUTOEXEC.SAMPLE',
            'autoexec.sample,s', '-write', 'build/CONFIG.SAMPLE', 'config.sample,s', '-write',
            'build/CGA.CPI', 'cga.cpi,s'
        ],
        {windowsHide: true, stdio: 'pipe'});
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const child = spawn(tool('vice', 'x64sc'),
        [
            '-console', '-default', '-sounddev', 'dummy', '-warp', '-cartcrt', crt, '-8', disk,
            '-remotemonitor', '-remotemonitoraddress', '127.0.0.1:' + port
        ],
        {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let socket, launchError, log = '';
    child.on('error', error => { launchError = error; });
    child.stderr.on('data', data => { log += data; });
    child.stdout.on('data', data => { log += data; });
    const command = require('./vice-command')(() => socket);
    const monitor = require('./monitor');
    async function memory(first, last = first) {
        if (first >= 0xe000)
            await command('bank ram');
        const bytes = await monitor.memory(command, first, last);
        if (first >= 0xe000)
            await command('bank cpu');
        return bytes;
    }
    async function screen() {
        const base = (await memory(0x288))[0] * 256;
        await command('bank ram');
        const bytes = await memory(base, base + 999);
        await command('bank cpu');
        return monitor.rows(bytes).join('\n').trimEnd();
    }

    async function keys(text, wait = 300) {
        await command('keybuf ' + text);
        await command('x');
        await delay(wait);
        return screen();
    }
    async function until(predicate) {
        let text;
        for (let i = 0; i < 80; i++) {
            await command('x');
            await delay(250);
            text = await screen();
            if (predicate(text))
                return text;
        }
        throw Error('Timed out waiting for shell:\n' + text);
    }
    async function enter(text) {
        for (let i = 0; i < text.length; i += 40)
            await keys(text.slice(i, i + 40));
        await keys('\\x0d');
        // Device-selection commands may finish at a different default prompt.
        return until(s => /(?:^|\n)[0-9A-W]+:>$/.test(s));
    }
    try {
        for (let i = 0; i < 300; i++) {
            if (launchError)
                throw launchError;
            if (child.exitCode !== null)
                throw Error('VICE exited with ' + child.exitCode + ': ' + log);
            try {
                socket = net.connect(port, '127.0.0.1');
                await new Promise((resolve, reject) => {
                    socket.once('connect', resolve);
                    socket.once('error', reject);
                });
                break;
            } catch {
                socket.destroy();
                socket = null;
                await delay(100);
            }
        }
        assert(socket, 'VICE monitor unavailable: ' + log);
        socket.on('error', () => {});
        await command('x');
        await delay(2000);
        await until(s => s.endsWith('0:>'));
        await keys('8:\\x0d');
        await until(s => s.endsWith('8:>'));
        await test({disk, crt, command, memory, screen, keys, enter, until});
    } finally {
        socket?.destroy();
        if (child.exitCode === null) {
            child.kill();
            await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
        }
        fs.writeFileSync('build/test-' + name + '.log', log);
    }
};

// An owned emulator for regressions which do not need custom display plumbing.
const {tool, root} = require('./setup');
const fs = require('fs'), net = require('net'), path = require('path');
const assert = require('assert/strict');
const {spawn} = require('child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async function withShell(name, test) {
    const disk = path.join(root, 'build', 'test-' + name + '.d64').replaceAll('\\', '/');
    fs.copyFileSync('build/MCS-DOS.d64', disk);
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const child = spawn(tool('vice', 'x64sc'), ['-default', '-sounddev', 'dummy', '-warp',
        '-8', disk, '-remotemonitor', '-remotemonitoraddress', '127.0.0.1:' + port],
        {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let socket, launchError, log = '';
    child.on('error', error => { launchError = error; });
    child.stderr.on('data', data => { log += data; });
    child.stdout.on('data', data => { log += data; });
    const command = require('./vice-command')(() => socket);
    async function screen(base = 0xe000) {
        const output = await command(`m ${base.toString(16)} ${(base+999).toString(16)}`);
        const bytes = [...output.matchAll(/>C:[\da-f]{4}\s+(.{1,50})/gi)]
            .flatMap(m => m[1].trim().split(/\s+/).filter(v => /^[\da-f]{2}$/i.test(v)).map(v => parseInt(v, 16)));
        assert.equal(bytes.length, 1000, output);
        const text = bytes.map(v => { v &= 127; return String.fromCharCode(v >= 1 && v <= 26 ? v + 96 : v); }).join('');
        return text.match(/.{40}/g).map(row => row.trimEnd()).join('\n').trimEnd();
    }
    async function keys(text, wait = 300) { await command('keybuf ' + text); await command('x'); await delay(wait); return screen(); }
    async function until(predicate) {
        let text;
        for (let i = 0; i < 80; i++) {
            await command('x'); await delay(250); text = await screen();
            if (predicate(text)) return text;
        }
        throw Error('Timed out waiting for shell:\n' + text);
    }
    async function enter(text) {
        for (let i = 0; i < text.length; i += 40) await keys(text.slice(i, i + 40));
        await keys('\\x0d');
        return until(s => s.endsWith('8:>'));
    }
    try {
        for (let i = 0; i < 300; i++) {
            if (launchError) throw launchError;
            if (child.exitCode !== null) throw Error('VICE exited with '+child.exitCode+': '+log);
            try {
                socket = net.connect(port, '127.0.0.1');
                await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
                break;
            } catch { socket.destroy(); socket = null; await delay(100); }
        }
        assert(socket, 'VICE monitor unavailable: ' + log);
        socket.on('error', () => {});
        await command('x'); await delay(2000);
        let basic = await screen(0x400);
        for (let i=0;i<60&&!basic.includes('ready.');i++) {
            await command('x'); await delay(250); basic=await screen(0x400);
        }
        assert(basic.includes('ready.'),'BASIC startup did not finish: '+basic);
        await command(`load "${root.replaceAll('\\', '/')}/build/MCS-DOS.prg" 0`);
        await command('> ba 08'); await command('keybuf run\\x0d');
        await command('bank ram');
        await until(s => s.endsWith('8:>'));
        await test({disk, command, screen, keys, enter, until});
    } finally {
        socket?.destroy();
        if (child.exitCode === null) {
            child.kill();
            await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
        }
        fs.writeFileSync('build/test-' + name + '.log', log);
    }
};

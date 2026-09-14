// Run a small Oscar64 test PRG in its own VICE process, without a disk.
// The PRG writes 2 (pass) or 3 (fail) to $02a7 and then waits.
const fs = require('fs');
const net = require('net');
const path = require('path');
const assert = require('assert/strict');
const {spawn} = require('child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function runTest(prg) {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const child = spawn('tools/vice/GTK3VICE-3.10-win64/bin/x64sc.exe', [
        '-default', '-sounddev', 'dummy', '-warp', '-remotemonitor',
        '-remotemonitoraddress', '127.0.0.1:' + port
    ], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    let log = '';
    child.stderr.on('data', data => { log += data; });
    async function command(text) {
        return new Promise((resolve, reject) => {
            let output = '', timer;
            const socket = net.connect(port, '127.0.0.1', () => socket.write(text + '\n'));
            const finish = () => { clearTimeout(timer); socket.destroy(); resolve(output); };
            socket.on('error', error => { clearTimeout(timer); socket.destroy(); reject(error); });
            socket.on('data', data => {
                output += data;
                clearTimeout(timer);
                timer = setTimeout(finish, 150);
            });
            timer = setTimeout(finish, 3000);
        });
    }
    try {
        let connected = false;
        for (let i = 0; i < 100; ++i) {
            try { await command('x'); connected = true; break; }
            catch { await delay(100); }
        }
        assert(connected, 'VICE monitor unavailable: ' + log);
        await delay(1500);
        await command('load "' + path.resolve(prg).replaceAll('\\', '/') + '" 0');
        await command('> 02a7 00');
        await command('keybuf run\\x0d');
        await command('x');
        for (let i = 0; i < 60; ++i) {
            await delay(300);
            const output = await command('m 02a7 02a9');
            const match = output.match(/>C:02a7\s+([\da-f]{2})\s+([\da-f]{2})\s+([\da-f]{2})/i);
            if (match && ['02', '03'].includes(match[1])) {
                const fixture = parseInt(match[2], 16) + 256 * parseInt(match[3], 16);
                assert.equal(match[1], '02', 'C64 support test failed at fixture ' + fixture);
                return;
            }
            await command('x');
        }
        throw Error('C64 support test timed out');
    } finally {
        fs.writeFileSync(prg + '.vice.log', log);
        if (child.exitCode === null) child.kill();
    }
};

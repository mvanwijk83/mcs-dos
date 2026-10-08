const messages = require('./output');
const {tool} = require('./setup');
const flags = new Set([
    '--commands', '--find-redirection', '--delete', '--diskinit', '--banked', '--journal',
    '--compact', '--session', '--run-return', '--sysinfo', '--ntsc', '--c128', '--sx64',
    '--boot-info', '--drive-info', '--display', '--display-fonts', '--tape', '--tape-search',
    '--ultimate-report', '--large-launch', '--redirection'
]);
if (process.argv.includes('--help')) {
    console.log('Use node tests/run.js --list to discover named cartridge suites.\n' +
                'Direct harness options: ' + [...flags].join(' '));
    process.exit(0);
}
for (const argument of process.argv.slice(2)) {
    if (!flags.has(argument) && !argument.startsWith('--kernal-rom=') &&
        !argument.startsWith('--kernal-name=')) {
        console.error('Unknown cartridge test option: ' + argument);
        process.exit(2);
    }
}
// Owns a disposable cartridge and disk; never modifies the distribution image.
const fs = require('fs'), net = require('net'), path = require('path'),
      assert = require('assert/strict');
const {spawn, execFileSync} = require('child_process');
const root = path.resolve('.').replaceAll('\\', '/'), prg = root + '/build/easyflash/shell.prg';
const kernalRom = process.argv.find(s => s.startsWith('--kernal-rom='))?.slice(13);
const kernalName = process.argv.find(s => s.startsWith('--kernal-name='))?.slice(14);
const delay = ms => new Promise(r => setTimeout(r, ms));
let child, socket, launchError, launchLog = '';
const snapshots = [];
let monitorPort;
async function command(text) {
    if (text === 'x' || text.startsWith('reset ')) {
        socket.write(text + '\n');
        await delay(100);
        return '';
    }
    return new Promise((resolve, reject) => {
        let out = '', timer;
        const data = d => {
            out += d;
            clearTimeout(timer);
            timer = setTimeout(() => {
                socket.off('data', data);
                resolve(out)
            }, 100)
        };
        socket.on('data', data);
        timer = setTimeout(() => {
            socket.off('data', data);
            reject(Error('Monitor timeout: ' + text))
        }, 5000);
        socket.write(text + '\n');
    });
}
// The monitor module validates every requested byte, including partial rows.
const monitor = require('./monitor');
async function memory(first, last = first) {
    return monitor.memory(command, first, last);
}

async function screen() {
    const base = (await memory(0x288))[0] * 256;
    await command('bank ram');
    const bytes = await memory(base, base + 999);
    await command('bank cpu');
    return monitor.rows(bytes).join('\n').trimEnd();
}

async function keys(s, ms = 550) {
    await command('keybuf ' + s);
    await command('x');
    await delay(ms);
    const out = await screen();
    snapshots.push({keys: s, out});
    return out;
}
async function enter(s, ms) {
    let out = await keys(s + '\\x0d', ms);
    if (!/^edit\b/.test(s)) {
        for (let i = 0; i < 60 && !/(?:^|\n)(?:[0-9A-W]+:>|ready\.)$/.test(out); i++) {
            await command('x');
            await delay(500);
            out = await screen();
        }
        assert(/(?:^|\n)(?:[0-9A-W]+:>|ready\.)$/.test(out),
            'Command did not finish: ' + s + '\n' + out);
    }
    snapshots.push({completed: s, out});
    return out;
}
// Decode flushed disk bytes using the same independent reader as drive tests.
function diskFile(file, name) {
    const entry = require('./disk-image').files(file).get(name);
    if (!entry)
        throw Error('Missing disk file ' + name);
    return entry.data;
}

(async () => {
    const bundled = require('./easyflash-image').verifyDistribution('build/easyflash/MCS-DOS.crt');
    const crt = root + '/build/easyflash/test.crt';
    fs.copyFileSync('build/easyflash/MCS-DOS.crt', crt);
    if (process.argv.includes('--ultimate-report')) {
        // Replace only the hardware query in a disposable image. Exercise the
        // actual linked report and resident formatting, not mocked print helpers.
        const bytes = fs.readFileSync(crt),
              map = fs.readFileSync('build/easyflash/shell.map', 'utf8');
        const address = parseInt(map.match(/^([\da-f]+) - [\da-f]+ : bank_ultimate, /m)[1], 16);
        for (let p = 64; p < bytes.length; p += bytes.readUInt32BE(p + 4)) {
            if (bytes.readUInt16BE(p + 10) !== 9 || bytes.readUInt16BE(p + 12) !== 0xa000)
                continue;
            const name = require('../scripts/petscii')('Ultimate 64\0');
            const offset = bytes.subarray(p + 16, p + 16 + 8192).indexOf(name);
            assert(offset >= 0);
            const pointer = 0xa000 + offset;
            Buffer.from([0xa9, pointer & 255, 0x85, 0x1b, 0xa9, pointer >> 8, 0x85, 0x1c, 0x60])
                .copy(bytes, p + 16 + address - 0xa000);
        }
        fs.writeFileSync(crt, bytes);
    }
    if (process.argv.includes('--boot-info')) {
        fs.writeFileSync(
            'build/AUTOEXEC.BAT', require('../scripts/petscii')('@ECHO OFF\rECHO AUTOEXEC-RAN\r'));
        const journal = require('../scripts/journal-image')([
            'AUTOEXEC.SAMPLE', 'CGA.CPI', 'CHANGELOG.TXT', 'CONFIG.SAMPLE', 'LICENSE.TXT',
            'MANUAL.TXT', 'AUTOEXEC.BAT'
        ]).image;
        const bytes = fs.readFileSync(crt);
        for (let p = bytes.readUInt32BE(16); p < bytes.length; p += bytes.readUInt32BE(p + 4)) {
            const bank = bytes.readUInt16BE(p + 10);
            if (bank >= 56 && bank <= 63 && bytes.readUInt16BE(p + 12) === 0x8000)
                journal.copy(bytes, p + 16, (bank - 56) * 8192, (bank - 55) * 8192);
        }
        fs.writeFileSync(crt, bytes);
    }
    const disk = root + '/build/easyflash/test-v2.d64';
    fs.writeFileSync(
        'build/easyflash/external.bat', Buffer.from('SET BOOT=EXTERNAL\rSET CHARSET=CGA\r'));
    const blob = Buffer.from(Array.from({length: 1024}, (_, i) => (i * 37) & 255));
    fs.writeFileSync('build/easyflash/blob', blob);
    fs.writeFileSync('build/easyflash/large', Buffer.alloc(50000, 65));
    const big = Buffer.alloc(53002, 0x5a);
    Buffer.from([1, 8, 0x4c, 1, 8]).copy(big);
    fs.writeFileSync('build/easyflash/big.prg', big);
    execFileSync(tool('vice', 'c1541'),
        [
            '-format', 'test,mc', 'd64', disk, '-attach', disk, '-write',
            'build/easyflash/external.bat', 'autoexec.bat,s', '-write', 'build/CGA.CPI',
            'cga.cpi,s', '-write', 'build/easyflash/blob', 'blob,s', '-write', 'build/DEMO.prg',
            'demo,p', '-write', 'build/easyflash/large', 'large,s', '-write',
            'build/easyflash/big.prg', 'big,p'
        ],
        {stdio: 'pipe', windowsHide: true});
    const server = net.createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    monitorPort = server.address().port;
    await new Promise(r => server.close(r));
    child = spawn(tool('vice', process.argv.includes('--c128') ? 'x128' : 'x64sc'),
        [
            '-logfile', 'build/easyflash/vice-debug.log', '-console', '-default',
            ...(process.argv.includes('--sx64') ? ['-model', 'sx64'] : []),
            ...(kernalRom ? ['-kernal', path.resolve(kernalRom)] : []),
            process.argv.includes('--ntsc') ? '-ntsc' : '-pal', '-sounddev', 'dummy',
            ...(process.argv.includes('--boot-info') ? [] : ['-warp']), '-cartcrt', crt,
            '-easyflashcrtwrite', '-remotemonitoraddress', '127.0.0.1:' + monitorPort,
            '-remotemonitor'
        ],
        {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    child.on('error', error => { launchError = error; });
    child.stderr.on('data', data => {
        launchLog += data;
        fs.appendFileSync('build/easyflash/vice-v2.log', data);
    });
    for (let i = 0; i < 60; i++) {
        if (launchError)
            throw launchError;
        if (child.exitCode !== null)
            throw Error(
                'VICE exited before monitor startup (' + child.exitCode + '):\n' + launchLog);
        try {
            socket = net.connect(monitorPort, '127.0.0.1');
            await new Promise((r, j) => {
                socket.once('connect', r);
                socket.once('error', j)
            });
            break;
        } catch {
            socket.destroy();
            socket = null;
            await delay(100);
        }
    }
    assert(socket, 'VICE monitor did not start:\n' + launchLog);
    socket.on('error', () => {});
    await command('x');
    await delay(3000);
    let s = await screen();
    if (process.argv.includes('--boot-info')) {
        for (let i = 0; i < 80 && !s.includes(messages.SYSOUT_COPYRIGHT); ++i) {
            await command('x');
            await delay(100);
            s = await screen();
        }
        assert(s.includes(messages.SYSOUT_COPYRIGHT), s);
        assert(!s.includes('KB RAM'), s);
        const countdown = s.split('\n')[23];
        assert(/^ {4}Press RESTORE for safe boot \([1-5]\)/i.test(countdown), s);
        const seconds = Number(countdown.match(/\(([1-5])\)/)[1]);
        assert.deepEqual((await memory(0xd800 + 23 * 40 + 4, 0xd800 + 23 * 40 + 34)).map(c => c & 15),
            Array(31).fill(15), 'safe boot countdown uses color 15');
        await command('x');
        await delay(3000);
        s = await screen();
        assert(s.includes(messages.SYSOUT_COPYRIGHT) && !s.includes('KB RAM'), s);
        assert(Number(s.split('\n')[23].match(/\(([1-5])\)/)[1]) < seconds,
            'safe boot countdown updates');
        const map = fs.readFileSync(prg.replace(/\.prg$/, '.map'), 'utf8');
        const address = map.match(/^([0-9a-f]+) - [0-9a-f]+ : bank_sysinfo,/m);
        assert(address, 'SYSINFO entry in link map');
        const point =
            (await command('break exec ' + address[1])).match(/(?:BREAK|WATCH):\s*(\d+)/i);
        assert(point, 'SYSINFO breakpoint installed');
        await command('x');
        await delay(2300);
        s = await screen();
        assert(!s.includes(messages.SYSOUT_COPYRIGHT) && !s.includes('KB RAM'), s);
        assert((await command('r')).toLowerCase().includes(address[1]), 'paused at SYSINFO');
        const vector = await memory(0x318, 0x319), handler = vector[0] + 256 * vector[1];
        const code = await memory(handler, handler + 8);
        assert.deepEqual(
            code.slice(0, 4), [0x48, 0xa9, 1, 0x8d], 'RESTORE latch remains installed during BIOS');
        const flag = code[4] + 256 * code[5];
        await command(`> ${flag.toString(16)} 01`);
        await command('delete ' + point[1]);
        await command('x');
        await delay(500);
        s = await screen();
        assert(
            s.startsWith('Commodore 64 personal computer') && s.includes('Starting MCS-DOS...'), s);
        assert(
            !s.includes('Unknown device') && !s.includes('Drive 10:') && !s.includes('Drive 11:'),
            s);
    }
    for (let i = 0; i < 20 && !s.includes('0:>'); i++) {
        await command('x');
        await delay(500);
        s = await screen();
    }
    console.log('BOOT', s);
    assert(s.includes('0:>'), s);
    if (process.argv.includes('--boot-info')) {
        assert(!s.includes('AUTOEXEC-RAN'), s);
        assert(s.includes('64 KB RAM') && s.includes('Starting MCS-DOS...'), s);
    }
    if (process.argv.includes('--tape')) {
        await require('./scenarios/tape')(
            {command, memory, screen, keys, enter, root, disk, crt, diskFile});
        return;
    }
    if (process.argv.includes('--ultimate-report')) {
        await enter('cls');
        s = await enter('sysinfo');
        assert(s.includes('Commodore 64 personal computer'), s);
        assert(s.includes('CPU:      MOS 6510 (FPGA)\nBoard:    Ultimate 64\nKERNAL:'), s);
        console.log(
            'PASS linked Ultimate report retains detection through real formatting and aligns Board after CPU');
        return;
    }
    assert.deepEqual(
        await memory(0x283, 0x284), [0, 0xa0], 'normal BASIC RAM limit after cartridge boot');
    await defaultFont();
    if (process.argv.includes('--boot-info')) {
        s = await enter('reboot');
        assert(s.includes('0:>') && !s.includes('KB RAM') && !s.includes('Starting MCS-DOS...'), s);
        await defaultFont();
        console.log(
            'PASS five-second splash and centered gray countdown, fresh BIOS screen, preserved startup display, safe boot and REBOOT bypass');
        return;
    }
    if (process.argv.includes('--sysinfo')) {
        await require('./scenarios/sysinfo')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--drive-info')) {
        await require('./scenarios/drive-info')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--run-return')) {
        await require('./scenarios/run-return')(
            {command, memory, screen, keys, enter, check, defaultFont, disk, crt, root});
        return;
    }
    if (process.argv.includes('--journal') || process.argv.includes('--compact')) {
        await require('./scenarios/journal')({
            command,
            memory,
            screen,
            keys,
            enter,
            check,
            defaultFont,
            disk,
            crt,
            root,
            compactOnly: process.argv.includes('--compact')
        });
        return;
    }
    if (process.argv.includes('--session')) {
        await require('./scenarios/basic-session')(
            {command, memory, screen, keys, enter, check, defaultFont, disk, crt, root});
        return;
    }
    if (process.argv.includes('--display')) {
        await require('./scenarios/display')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--banked')) {
        await command('bank ram');
        await command('f a000 bfff ea');
        await command('f c300 c6ff cd');
        const bssEnd = JSON.parse(fs.readFileSync('build/easyflash/layout.json')).bssEnd;
        if (bssEnd <= 0x8000)
            await command('f 8000 9fff ab');
        await command('bank cpu');
        await bankChecks();
        await check('mem', 'bytes cartridge ROM window');
        const free = JSON.parse(fs.readFileSync('build/easyflash/layout.json')).freeRam;
        assert((await screen()).includes(free.toLocaleString('en-US') + ' bytes free'));
    }
    if (process.argv.includes('--find-redirection')) {
        await require('./scenarios/find-redirection')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--delete')) {
        await require('./scenarios/delete')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--diskinit')) {
        await require('./scenarios/diskinit')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--commands')) {
        await require('./scenarios/commands')(
            {command, memory, screen, keys, enter, check, defaultFont, root, disk, kernalName});
        return;
    }
    if (process.argv.includes('--redirection')) {
        await require('./scenarios/redirection')({command, enter, check, disk, crt, root});
        return;
    }
    if (process.argv.includes('--large-launch')) {
        for (const name of bundled.keys())
            await enter('del ' + name + ' /p', 3000);
        await command(`attach "${disk}" 8`);
        await enter('copy 8:big 0:big', 5000);
        await keys('run 0:big /a 2049\\x0d', 2000);
        await command('bank ram');
        assert.deepEqual(Buffer.from(await memory(0x801, 0x803)), Buffer.from([0x4c, 1, 8]));
        assert((await memory(0xd000, 0xd0ff)).every(b => b === 0x5a), 'PRG bytes under I/O');
        assert.equal((await memory(0x801 + 53000 - 1))[0], 0x5a, 'last PRG byte');
        console.log('PASS large cartridge PRG crosses banks and loads RAM under I/O');
        return;
    }
    s = await check('dir', 'CGA.CPI', 2000);
    assert(s.includes(messages.SYSOUT_CRT_VOL.split('\n')[0].slice('Volume '.length)) &&
               s.includes('MC'),
        s);
    s = await check('mem', 'bytes free');
    assert(!s.includes('REU'), s);
    await check('help cls', 'Clears', 1500);
    await check('type autoexec.sample', 'set', 1500);
    await enter('splash');
    await enter('edit edited.txt');
    await keys('edited on cartridge\\x03y', 4000);
    await check('type edited.txt', 'edited on cartridge');
    await enter('echo hello >test.txt', 5000);
    await check('type test.txt', 'hello', 1500);
    await enter('echo second >>test.txt', 4000);
    await check('type test.txt', 'second');
    await enter('copy test.txt copy.txt', 4000);
    await enter('ren copy.txt renamed.txt', 4000);
    await check('type renamed.txt', 'hello');
    await enter('copy test.txt+renamed.txt joined.txt', 4000);
    await check('type joined.txt', 'second');
    await enter('attrib +l renamed.txt', 4000);
    await check('attrib renamed.txt', 'L');
    await enter('echo forbidden >renamed.txt', 4000);
    await check('type renamed.txt', 'hello');
    await enter('attrib -l renamed.txt', 4000);
    await enter('del renamed.txt /p', 4000);
    await check('type renamed.txt', messages.SYSOUT_FILE_NOT_FOUND.trim());
    await command(`attach "${disk}" 8`);
    await enter('copy 8:blob 0:blob', 4000);
    await enter('copy 0:blob 8:roundtrip', 2500);
    await command('detach 8');
    assert.deepEqual(diskFile(disk, 'ROUNDTRIP'), blob);
    console.log('PASS binary roundtrip');
    await command(`attach "${disk}" 8`);
    await enter('copy 8:large 0:large', 4000);
    await check('type large', messages.SYSOUT_FILE_NOT_FOUND.trim());
    await check('format 0:', 'Unsupported');
    if (process.argv.includes('--banked')) {
        await check('chkdsk 8:', 'bytes total');
        await check('find "hello" test.txt', 'hello');
        await enter('reboot');
        await bankChecks();
    }
    await enter('echo set boot=flash >autoexec.bat', 4000);
    await enter('echo set charset=cga >>autoexec.bat', 4000);
    await enter('echo bootdrv=9,0 >config.sys', 4000);
    await command('reset 0');
    await command('x');
    await delay(3500);
    await check('set', 'BOOT=flash');
    await command('bank ram');
    assert.deepEqual(Buffer.from(await memory(0xe800, 0xe807)),
        fs.readFileSync('build/CGA.CPI').subarray(7, 15));
    await command('bank cpu');
    console.log('PASS cartridge startup charset');
    await enter('echo bootdrv=7 >config.sys', 4000);
    await command('reset 0');
    await command('x');
    await delay(3000);
    s = await screen();
    assert(s.includes(messages.SYSOUT_INVALID_DIRECTIVE.trim()), s);
    await check('set', 'BOOT=flash');
    console.log('PASS invalid configuration keeps default');
    await enter('echo bootdrv= 8, 0 >config.sys', 4000);
    await command('reset 0');
    await command('x');
    await delay(3500);
    await check('set', 'BOOT=external');
    await command('bank ram');
    assert.deepEqual(Buffer.from(await memory(0xe800, 0xe807)),
        fs.readFileSync('build/CGA.CPI').subarray(7, 15));
    await command('bank cpu');
    console.log('PASS external startup charset');
    await enter('0:');
    await enter('echo ldautoex=0 >config.sys', 4000);
    await command('reset 0');
    await command('x');
    await delay(3500);
    s = await enter('set');
    assert(!s.includes('BOOT='), s);
    await enter('copy 8:demo 0:demo', 4000);
    await runAndReturn('run 0:demo');
    console.log('PASS cartridge PRG launch');
    await command('reset 0');
    await command('x');
    await delay(3000);
    if (process.argv.includes('--banked')) {
        await runAndReturn('run 8:demo');
        console.log('PASS disk PRG launch from banked RUN');
        await command('reset 0');
        await command('x');
        await delay(3000);
    }
    await check('type test.txt', 'hello', 1500);
    await recoverWrite(crt);
    const saved = require('./easyflash-image').readImage(crt).files;
    assert.deepEqual(saved.get('BLOB').data, blob);
    assert.equal(saved.get('TEST.TXT').data.toString(), 'HELLO\rSECOND\r');
    assert.equal(saved.get('EDITED.TXT').data.toString(), 'EDITED ON CARTRIDGE\r');
    for (const name of ['AUTOEXEC.SAMPLE', 'CONFIG.SAMPLE', 'CGA.CPI', 'CHANGELOG.TXT',
             'LICENSE.TXT', 'MANUAL.TXT'])
        assert.deepEqual(
            saved.get(name).data, fs.readFileSync('build/' + name), name + ' remains intact');
    console.log('PASS persisted file bytes and bundled resources');
})()
    .catch(e => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => {
        fs.writeFileSync('build/easyflash/test-v2.json', JSON.stringify(snapshots, null, 2));
        socket?.destroy();
        if (child && child.exitCode === null)
            child.kill();
    });
async function runAndReturn(cmd) {
    let s = await keys(cmd + '\\x0d', 3500);
    for (let i = 0; i < 40 && !s.endsWith('0:>'); i++) {
        await command('x');
        await delay(500);
        s = await screen();
    }
    assert(s.endsWith('0:>'), s);
}
async function recoverWrite(crt) {
    // Keep the remote connection alive so a breakpoint stays in the remote
    // monitor instead of opening VICE's native interactive monitor window.
    const point = (await command('break exec df80')).match(/(?:BREAK|WATCH):\s*(\d+)/i);
    assert(point, 'flash breakpoint installed');
    await command('keybuf echo interrupted >test.txt\\x0d');
    await command('x');
    await delay(2000);
    const regs = await command('r');
    assert(/df80/i.test(regs), 'interrupted at flash writer: ' + regs);
    await command('delete ' + point[1]);
    await command('reset 0');
    await command('x');
    await delay(3000);
    await check('type test.txt', 'hello');
    console.log('PASS interrupted write recovery');
    // Monitor numbers default to hexadecimal: cartridge device 32 is $20.
    const detached = await command('detach $20');
    assert(!/error|invalid|unknown/i.test(detached), detached);
    const persisted = require('./easyflash-image').readImage(crt);
    assert(persisted.files.has('TEST.TXT'), 'changes reached the host CRT file');
    const attached = await command(`attach "${crt}" $20`);
    assert(!/error|invalid|unknown/i.test(attached), attached);
    await command('reset 1');
    await command('x');
    await delay(3000);
    await check('type test.txt', 'hello');
    console.log('PASS CRT writeback and power-cycle restoration');
}
async function check(cmd, expected, ms = 900) {
    await enter('cls');
    const s = await enter(cmd, ms);
    if (!s.includes(expected)) {
        const map = fs.readFileSync(prg.replace(/\.prg$/, '.map'), 'utf8');
        for (const name of ['count', 'p1', 'files', 'argc', 'args']) {
            const m = map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : ' + name + ',', 'm'));
            if (m)
                console.log(name, await memory(parseInt(m[1], 16), parseInt(m[1], 16) + 19));
        }
    }
    assert(s.includes(expected), cmd + '\n' + s);
    console.log('PASS ' + cmd);
    return s;
}

async function bankChecks() {
    assert.equal((await memory(0x7f5))[0], 5, 'input waits in edit bank with IRQs working');
    assert.equal((await memory(1))[0] & 7, 6, 'ROML hidden, ROMH and KERNAL visible');
    const crt = fs.readFileSync('build/easyflash/MCS-DOS.crt');
    let expected;
    for (let p = 64; p < crt.length; p += crt.readUInt32BE(p + 4))
        if (crt.readUInt16BE(p + 10) === 5 && crt.readUInt16BE(p + 12) === 0xa000)
            expected = crt.subarray(p + 16, p + 32);
    assert(expected);
    assert.deepEqual(
        Buffer.from(await memory(0xa000, 0xa00f)), expected, 'CPU reads actual command ROM');
    if (JSON.parse(fs.readFileSync('build/easyflash/layout.json')).bssEnd <= 0x8000)
        assert((await memory(0x8000, 0x9fff)).every(b => b === 0xab),
            'ROML window is usable RAM while a command bank is visible');
    await command('bank ram');
    assert((await memory(0xa000, 0xbfff)).every(b => b === 0xea),
        'commands never copied to RAM beneath ROM');
    assert(
        (await memory(0xc300, 0xc6ff)).every(b => b === 0xcd), 'upper free RAM remains untouched');
    await command('bank cpu');
    console.log('PASS ROM execution, restored bank, and free RAM guards');
}

async function defaultFont(patch) {
    const rom = fs.readFileSync(process.env.VICE_CHARGEN ||
                                require('./environment').viceData('C64', 'chargen-901225-01.bin'));
    const expected = Buffer.from(rom.subarray(2048, 4096));
    for (let row = 0; row < 8; row++) {
        expected[96 * 8 + row] = rom[77 * 8 + row];
        expected[224 * 8 + row] = rom[77 * 8 + row] ^ 255;
    }
    if (patch)
        for (let i = 0; i < patch[5]; i++) {
            const at = 6 + i * 9, code = patch[at];
            for (let row = 0; row < 8; row++) {
                expected[code * 8 + row] = patch[at + 1 + row];
                expected[(code + 128) * 8 + row] = patch[at + 1 + row] ^ 255;
            }
        }
    await command('bank ram');
    const actual = Buffer.from(await memory(0xe800, 0xefff));
    await command('bank cpu');
    const different = actual.findIndex((byte, i) => byte !== expected[i]);
    if (different >= 0)
        await command(`screenshot "${root}/build/easyflash/charset-failure.png" 2`);
    assert.equal(different, -1,
        'default charset differs from character ROM at byte ' + different + ': actual ' +
            actual[different] + ', expected ' + expected[different]);
    assert.equal((await memory(0xd018))[0] & 0xfe, 0x8a, 'relocated screen/font');
    assert.equal((await memory(0xdd00))[0] & 3, 0, 'VIC bank 3');
    console.log('PASS complete ' + (patch ? 'CPI' : 'default') + ' charset and VIC mapping');
}

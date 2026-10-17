// Measure command entry -> next interactive prompt using resident breakpoints.
// Keep the monitor socket open: checkpoint notifications carry the completion
// timestamp, with no screen polling pauses or timeout overshoot in the result.
require('./setup');
const fs = require('fs'), net = require('net'), path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const {spawn} = require('child_process');
const {tool} = require('./setup');
const monitor = require('./monitor');
const {create, audit} = require('./chkdsk-fixture');
const delay = ms => new Promise(r => setTimeout(r, ms));
const normal = !process.argv.includes('--warp');
const deepCwd = process.argv.includes('--deep-cwd');
const userImage = process.argv.find(x => x.startsWith('--image='))?.slice(8);
const profile = userImage ? 'user' : process.argv.includes('--realistic') ? 'realistic' :
    process.argv.includes('--dense-four') ? 'dense-four' : '';
const label = name => {
    const text = fs.readFileSync('build/easyflash/shell.lbl', 'utf8');
    const match = text.match(new RegExp('^al ([0-9a-f]+) \\.' + name + '$', 'm'));
    assert(match, name);return match[1];
};
async function test(deep) {
    const kind = profile || (deep ? 'deep' : 'flat'), tag = kind + (deepCwd ? '-cwd' : '');
    const disk = userImage || 'build/chkdsk-' + tag + '-full.d81';
    const expected = userImage ? audit(fs.readFileSync(disk)) : create(disk, profile || deep);
    const imageHash = () => crypto.createHash('sha256').update(fs.readFileSync(disk)).digest('hex');
    const beforeHash = imageHash();
    const crt = 'build/chkdsk-' + tag + '-benchmark.crt';
    fs.copyFileSync('build/easyflash/MCS-DOS.crt', crt);
    const server = net.createServer();await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;await new Promise(r => server.close(r));
    const child = spawn(tool('vice', 'x64sc'), ['-console', '-default', '-pal', '-sounddev', 'dummy',
        '-warp', '-drive8type', '1581', '-8', path.resolve(disk), '-cartcrt', path.resolve(crt),
        '-remotemonitor', '-remotemonitoraddress', '127.0.0.1:' + port],
        {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let conn, receive, log = '', trace = '', launchError;
    child.on('error', e => launchError = e);
    child.stdout.on('data', d => log += d);child.stderr.on('data', d => log += d);
    async function request(text) {
        if (text === 'x') {conn.write('x\n');return '';}
        return new Promise((resolve, reject) => {
            let output = '', idle;
            const timer = setTimeout(() => finish(Error('Monitor request timeout: ' + text)), 10000);
            function finish(error) {clearTimeout(timer);clearTimeout(idle);receive = null;error ? reject(error) : resolve(output);}
            receive = data => {output += data;clearTimeout(idle);idle = setTimeout(() => finish(), 100);};
            conn.write(text + '\n');
        });
    }
    async function runTo(address, timeout = 900000) {
        const started = performance.now();
        return new Promise((resolve, reject) => {
            let output = '';
            const timer = setTimeout(() => finish(Error('Checkpoint timeout at ' + address + '\n' + output)), timeout);
            const progress = setInterval(() => console.log(kind + ' CHKDSK running ' + Math.round((performance.now() - started) / 1000) + ' s'), 30000);
            function finish(error) {clearTimeout(timer);clearInterval(progress);receive = null;error ? reject(error) : resolve({wallSeconds: (performance.now() - started) / 1000, notification: output});}
            receive = data => {output += data;if (new RegExp('\\b' + address + '\\b', 'i').test(output)) finish();};
            conn.write('x\n');
        });
    }
    async function screen() {
        const base = (await monitor.memory(request, 0x288))[0] * 256;
        await request('bank ram');const bytes = await monitor.memory(request, base, base + 999);
        await request('bank cpu');return monitor.rows(bytes).join('\n').trimEnd();
    }
    async function wait(prompt) {
        let text;
        for (let i = 0; i < 120; ++i) {
            await request('x');await delay(250);text = await screen();
            if (text.replace(/\n/g, '').endsWith(prompt)) return text;
        }
        throw Error('Waiting for ' + prompt + '\n' + text);
    }
    async function enter(text, prompt = '8:\\>') {
        await request('keybuf ' + text.replaceAll('\\', '\\x5c') + '\\x0d');return wait(prompt);
    }
    try {
        for (let i = 0; i < 200; ++i) {
            if (launchError) throw launchError;
            if (child.exitCode !== null) throw Error(log);
            try {
                conn = net.connect(port, '127.0.0.1');
                await new Promise((r, j) => {conn.once('connect', r);conn.once('error', j);});break;
            } catch {conn?.destroy();conn = null;await delay(100);}
        }
        assert(conn);
        conn.on('error', () => {});
        conn.on('data', d => {const s = d.toString();trace += s;receive?.(s);});
        await request('x');await delay(1000);await wait('0:\\>');await enter('8:');
        const config = {};
        for (const name of ['MachineVideoStandard', 'Drive8Type', 'Drive8TrueEmulation', 'Speed'])
            config[name] = await request('resourceget "' + name + '"');
        assert(config.Drive8TrueEmulation.includes('=1'), config.Drive8TrueEmulation);
        config.stopwatchHelp = await request('help stopwatch');
        let prompt = '8:\\>';
        if (deep && deepCwd) {
            const location = '\\RIGHT' + '\\D'.repeat(36);
            prompt = '8:' + location + '>';
            await enter('cd ' + location, prompt);
            const text = await enter('type f000.txt', prompt);
            assert(/chkdsk full disk fixture d\/f000.txt/i.test(text), text);
        }
        const samples = [];
        for (let run = 0; run < (process.argv.includes('--repeat') ? 3 : 1); ++run) {
            await enter('cls', prompt);
            const startPoint = (await request('break exec ' + label('execute'))).match(/BREAK:\s*(\d+)/i);
            assert(startPoint);
            await request('keybuf chkdsk\\x0d');await runTo(label('execute'), 15000);
            await request('delete ' + startPoint[1]);
            const endPoint = (await request('break exec ' + label('input'))).match(/BREAK:\s*(\d+)/i);
            assert(endPoint);
            await request('resourceset "Speed" "100"');
            await request(normal ? 'warp off' : 'warp on');
            config.measuredWarpState = await request('warp');
            assert(config.measuredWarpState.includes(normal ? 'off' : 'on'), config.measuredWarpState);
            await request('stopwatch reset');
            const timing = await runTo(label('input'));
            timing.stopwatch = await request('stopwatch');
            timing.registers = await request('r');
            timing.screen = await screen();
            assert(timing.screen.includes((expected.fileBlocks * 256).toLocaleString('en-US') + ' bytes allocated in ' + expected.files + ' files'), timing.screen);
            assert(timing.screen.includes((expected.free * 256).toLocaleString('en-US') + ' bytes available on disk'), timing.screen);
            if (expected.partitions)
                assert(timing.screen.includes((expected.reservedBlocks * 256).toLocaleString('en-US') + ' bytes in ' + expected.partitions + ' directories'), timing.screen);
            assert(timing.screen.replace(/\n/g, '').endsWith(prompt), timing.screen);
            const drive = await monitor.memory(request, parseInt(label('drive'), 16));
            const base = parseInt(label('working'), 16) + 128;
            const cwd = await monitor.memory(request, base, base + 127);
            timing.restoredDirectory = Buffer.from(cwd.slice(0, cwd.indexOf(0))).toString('latin1').toUpperCase();
            assert.equal(drive[0], 8);
            assert.equal(timing.restoredDirectory, prompt.slice(3, -1));
            const clock = timing.registers.match(/\.;[0-9a-f]+[^\r\n]*\s(\d+)\s*$/im);
            assert(clock, timing.registers);
            timing.cycles = Number(clock[1]);
            // VICE C64 PAL clock: vice/src/c64/c64.h, C64_PAL_CYCLES_PER_SEC.
            timing.emulatedSeconds = timing.cycles / 985248;
            samples.push(timing);
            console.log(kind, 'PASS', {wallSeconds: timing.wallSeconds, cycles: timing.cycles, emulatedSeconds: timing.emulatedSeconds});
            await request('delete ' + endPoint[1]);await request('warp on');
            await request('x');await delay(100);
        }
        assert.deepEqual(audit(fs.readFileSync(disk)), expected, 'read-only benchmark preserves all file and allocation metadata');
        assert.equal(imageHash(), beforeHash, 'benchmark leaves every image byte unchanged');
        return {kind, normalSpeed: normal, startingPrompt: prompt, expected, imageSHA256: beforeHash, config, samples};
    } finally {
        receive = null;conn?.destroy();
        if (child.exitCode === null) {child.kill();await Promise.race([new Promise(r => child.once('exit', r)), delay(3000)]);}
        fs.writeFileSync('build/chkdsk-' + tag + '-benchmark.vice.log', log);
        fs.writeFileSync('build/chkdsk-' + tag + '-benchmark.monitor.log', trace);
    }
}
(async () => {
    const reports = [];
    for (const deep of profile || process.argv.includes('--deep-only') ? [true] : [false, true]) {
        reports.push(await test(deep));
        fs.writeFileSync('build/chkdsk-timing-' + (normal ? 'normal' : 'warp') + (deepCwd ? '-deepcwd' : '') + (profile ? '-' + profile : '') + '.json', JSON.stringify(reports, null, 2) + '\n');
    }
})().catch(e => {console.error(e);process.exitCode = 1;});

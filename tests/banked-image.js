require('./setup');
// Check the assembled artifact, independently of the builder's linker checks.
const fs = require('fs'), assert = require('assert/strict');
const base = 'build/easyflash/', layout = JSON.parse(fs.readFileSync(base + 'layout.json'));
function packets(file) {
    const b = fs.readFileSync(file), result = new Map();
    for (let p = b.readUInt32BE(16); p < b.length; p += b.readUInt32BE(p + 4)) {
        assert.equal(b.toString('ascii', p, p + 4), 'CHIP');
        result.set(b.readUInt16BE(p + 10) + ':' + b.readUInt16BE(p + 12),
            b.subarray(p + 16, p + 16 + b.readUInt16BE(p + 14)));
    }
    return result;
}
const image = packets(base + 'MCS-DOS.crt'), linked = packets(base + 'shell-crt.crt');
assert.equal(fs.readFileSync(base + 'MCS-DOS.crt')[0x1a], 1,
    'REU-aware EasyFlash subtype must keep Ultimate UCI enabled when loading');
assert(fs.readFileSync(base + 'shell-prg.asm').equals(fs.readFileSync(base + 'shell-crt.asm')));
// MMIO ordering is essential: Oscar64 can move palette accesses across the
// unlock even for volatile pointers. Check the linked probe, not just its C.
const assembly = fs.readFileSync(base + 'shell-prg.asm', 'utf8');
const megaProbe = assembly.split('bank_vicalias:')[1].split('--------------------------------------------------------------------')[0];
const accesses = [...megaProbe.matchAll(/\b(LDA|LDX|LDY|STA|STX|STY) \$(d000|d100|d02f)\b/g)]
    .map(m => (m[1].startsWith('ST') ? 'write ' : 'read ') + m[2]);
assert.deepEqual(accesses, [
    'read d000', 'write d02f', 'write d02f', 'read d100', 'write d100',
    'read d000', 'write d100', 'write d02f', 'write d02f'
], 'MEGA65 probe must unlock before borrowing palette and relock after restoration');
// Execute the actual linked helper against VIC-II/III/IV bus models. This also
// catches a constant-folded C return that an inline assembly block can cause.
const probeStart = parseInt(megaProbe.match(/^09:([\da-f]+) :/m)[1], 16);
const p0 = parseInt(megaProbe.match(/: a5 ([\da-f]{2}) __ LDA P0/)[1], 16);
const p1 = parseInt(megaProbe.match(/: a5 ([\da-f]{2}) __ LDA P1/)[1], 16);
for (const generation of [2, 3, 4]) {
    for (const [first, second] of [[0x47, 0x53], [0xa5, 0x96]]) {
        const ram = new Uint8Array(65536);
        ram.set(image.get('9:40960'), 0xa000);
        ram[p0] = first; ram[p1] = second;
        let pc = probeStart, a = 0, y = 0, zero = false;
        let sprite = 17, palette = 23, key = 0, unlocked = false, returned = false;
        const read = address => address === 0xd000 ? sprite : address === 0xd100
            ? (unlocked ? palette : sprite) : ram[address];
        const write = (address, value) => {
            if (address === 0xd02f) {
                unlocked = generation === 4 && key === 0x47 && value === 0x53 ||
                           generation >= 3 && key === 0xa5 && value === 0x96;
                key = value;
            } else if (address === 0xd100) {
                if (unlocked) palette = value;
                else sprite = value;
            } else ram[address] = value;
        };
        const word = () => { const value = ram[pc] | ram[pc + 1] << 8; pc += 2; return value; };
        for (let steps = 0; steps < 100 && !returned; ++steps) {
            const op = ram[pc++];
            switch (op) {
            case 0xa9: a = ram[pc++]; zero = a === 0; break;
            case 0xa5: a = read(ram[pc++]); zero = a === 0; break;
            case 0xad: a = read(word()); zero = a === 0; break;
            case 0x85: write(ram[pc++], a); break;
            case 0x8d: write(word(), a); break;
            case 0xa0: y = ram[pc++]; zero = y === 0; break;
            case 0x84: write(ram[pc++], y); break;
            case 0x49: a ^= ram[pc++]; zero = a === 0; break;
            case 0xc5: zero = a === read(ram[pc++]); break;
            case 0xcd: zero = a === read(word()); break;
            case 0xf0: case 0xd0: {
                const relative = ram[pc++] << 24 >> 24;
                if (op === 0xf0 ? zero : !zero) pc += relative;
                break;
            }
            case 0x4c: pc = word(); break;
            case 0x60: returned = true; break;
            default: assert.fail('Unexpected VIC probe opcode: ' + op.toString(16));
            }
        }
        const expected = generation === 4 || generation === 3 && first === 0xa5;
        assert(returned, 'VIC helper must return');
        assert.equal(a, +expected, 'compiled VIC alias result');
        assert.equal(sprite, 17, 'sprite restored');
        assert.equal(palette, 23, 'palette restored');
        assert.equal(key, 0, 'C64 I/O restored');
        assert.equal(unlocked, false, 'extended registers hidden again');
    }
}
assert.deepEqual(
    layout.commandBanks.map(b => b.name), ['edit', 'fileutil', 'filemgmt', 'disk', 'boot', 'storage', 'nav', 'transfer', 'volume']);
for (const b of layout.commandBanks) {
    assert(b.used > 0 && b.used <= 8192);
    assert.equal(b.used + b.free, 8192);
    const key = b.bank + ':40960';
    assert(image.has(key) && linked.has(key), key);
    assert.deepEqual(
        image.get(key).subarray(0, b.used), linked.get(key).subarray(0, b.used), b.name);
}
const prg = fs.readFileSync(base + 'shell.prg');
assert.equal(prg.length, layout.payload + 2);
assert.equal(
    layout.executableBytes, prg.length + layout.commandBanks.reduce((n, b) => n + b.used, 0));
assert.deepEqual(
    image.get('10:32768').subarray(0, layout.helpBytes), fs.readFileSync(base + 'help.bin'));
assert.equal(layout.tapeBank, 11);
assert.equal(layout.tapeBufferBytes, 45056);
assert.deepEqual(
    image.get('11:40960').subarray(0, layout.tapeBytes), fs.readFileSync(base + 'tape.bin'));
assert.equal(layout.filesystemVersion, 3);
assert.equal(layout.residentBytes, layout.bssEnd - 0x801);
assert.equal(layout.freeRam, layout.freeRanges.reduce((n, [a, b]) => n + b - a, 0));
// SYSINFO adds a small resident command entry; retain a 3.5 KiB RAM floor after directory state.
assert(layout.freeRam >= 3584, 'banked shell must retain at least 3.5 KiB free RAM');
assert(layout.bssEnd <= 0xa000);
assert.deepEqual(layout.romWindow, {start: 0xa000, end: 0xc000});
assert(layout.wedge > 0 && layout.wedge <= 0x1e0, 'wedge must not overlap resume token');
assert.deepEqual(layout.sessionBanks, [48, 55]);
assert.equal(layout.sessionBytes, 7377);
assert.deepEqual(layout.freeRanges[1], [0xc300, 0xc700]);
for (let bank = 48; bank <= 55; bank++)
    for (const address of [0x8000, 0xa000]) {
        const sector = image.get(bank + ':' + address);
        assert(sector && sector.every(b => b === 255), 'empty session journal');
    }
console.log('PASS linked command banks, resident payload, internal help and RAM accounting');

require('./easyflash-image').verifyDistribution(base + 'MCS-DOS.crt');

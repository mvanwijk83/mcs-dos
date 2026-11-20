// Execute the optimized cartridge code against destructive UCI FIFOs. A C
// callback mock retains side effects that Oscar64 can drop for volatile MMIO.
const assert = require('assert/strict');
module.exports = (image, assembly, prg) => {
    const address = name => {
        const block = assembly.split('\n' + name + ':')[1];
        assert(block, 'linked helper ' + name);
        return parseInt(block.match(/^(?:[\da-f]{2}:)?([\da-f]{4}) :/m)[1], 16);
    };
    const clock = address('clock');
    const probe = assembly.split('\nbank_softiec_target:')[1].split('----')[0];
    const baseAddress = parseInt(probe.match(/LDA \$([\da-f]+) ; \(ultimatebase/)[1], 16);
    const dosProbe = assembly.split('\nsoftiec_reply:')[1].split('----')[0];
    const fixtures = [[48,48,44,79,75], [0], [48,53,44,69,82]].map(status => ({status}));
    fixtures.push(
        {dos:true,status:[48,48,44,79,75],reply:Array.from({length:256},(_,i)=>i)},
        {dos:true,status:[],reply:[16,65,66,67],more:true},
        {dos:true,status:[57,57,44,69,82,82],reply:[],error:true},
        {dos:true,status:[48,48,44,79,75],reply:Array(257).fill(65),overflow:true});
    for (const fixture of fixtures) {
        const {status} = fixture;
        const entry = address(fixture.dos ? 'softiec_reply' : 'bank_softiec_target');
        const ram = new Uint8Array(65536), uci = 0xde1c;
        ram.set(prg.subarray(2), prg.readUInt16LE());
        const bank = fixture.dos ? parseInt(dosProbe.match(/^([\da-f]{2}):[\da-f]{4} :/m)[1],16) : 16;
        ram.set(image.get(bank+':40960'), 0xa000);
        ram[baseAddress] = uci & 255; ram[baseAddress + 1] = uci >> 8;
        ram[0x23] = 0; ram[0x24] = 0x7c;
        const reply = fixture.reply || [...Buffer.from('SOFTWARE IEC TARGET V1.0')];
        if (fixture.dos) {
            const data = parseInt(dosProbe.match(/: a4 ([\da-f]{2}) __ LDY P\d+ ; \(data \+ 0\)/)[1],16);
            const capacity = parseInt(dosProbe.match(/: e4 ([\da-f]{2}) __ CPX P\d+ ; \(capacity \+ 0\)/)[1],16);
            const length = parseInt(dosProbe.match(/: 91 ([\da-f]{2}) __ STA \(P\d+\),y ; \(length \+ 0\)/)[1],16);
            const more = parseInt(dosProbe.match(/: 91 ([\da-f]{2}) __ STA \(P\d+\),y ; \(more \+ 0\)/)[1],16);
            for (const [p,v] of [[data,0x7800],[capacity,256],[length,0x7700],[more,0x7702]]) {
                ram[p]=v&255;ram[p+1]=v>>8;
            }
        }
        let pending = !!fixture.dos, dataAt = 0, statusAt = 0, ack = 0, abort = 0, ticks = 0;
        const request = [], calls = [];
        const read = p => p === uci ? pending ? 0x20 | (fixture.more ? 16 : 0) | (dataAt < reply.length ? 128 : 0) |
            (statusAt < status.length ? 64 : 0) : 0 : p === uci + 1 ? 0xc9 :
            p === uci + 2 ? reply[dataAt++] : p === uci + 3 ? status[statusAt++] : ram[p];
        const write = (p, v) => {
            v &= 255;
            if (p === uci + 1) request.push(v);
            else if (p === uci) {
                if (v === 1) pending = true;
                else if (v === 2) { ++ack; pending = false; }
                else if (v === 4) { ++abort; pending = false; }
            } else ram[p] = v;
        };
        let pc = entry, a = 0, x = 0, y = 0, carry = false, zero = false, negative = false, done = false;
        const flags = v => { v &= 255; zero = v === 0; negative = !!(v & 128); return v; };
        const byte = () => ram[pc++], word = () => byte() | byte() << 8;
        const indirect = () => { const p = byte(); return ((ram[p] | ram[(p + 1) & 255] << 8) + y) & 65535; };
        const compare = (v, w) => { carry = v >= w; flags(v - w); };
        for (let steps = 0; steps < 10000 && !done; ++steps) {
            const op = byte();
            switch (op) {
            case 0xa9: a = flags(byte()); break;
            case 0xa5: a = flags(read(byte())); break;
            case 0xad: a = flags(read(word())); break;
            case 0xb5: a = flags(read((byte() + x) & 255)); break;
            case 0xb1: a = flags(read(indirect())); break;
            case 0xbd: a = flags(read((word() + x) & 65535)); break;
            case 0xb9: a = flags(read((word() + y) & 65535)); break;
            case 0x85: write(byte(), a); break;
            case 0x95: write((byte() + x) & 255, a); break;
            case 0x8d: write(word(), a); break;
            case 0x9d: write((word() + x) & 65535, a); break;
            case 0x91: write(indirect(), a); break;
            case 0xa2: x = flags(byte()); break;
            case 0xa6: x = flags(read(byte())); break;
            case 0xa0: y = flags(byte()); break;
            case 0xa4: y = flags(read(byte())); break;
            case 0x84: write(byte(), y); break;
            case 0x86: write(byte(), x); break;
            case 0x05: a = flags(a | read(byte())); break;
            case 0x29: a = flags(a & byte()); break;
            case 0x25: a = flags(a & read(byte())); break;
            case 0x49: a = flags(a ^ byte()); break;
            case 0xc9: compare(a, byte()); break;
            case 0xc5: compare(a, read(byte())); break;
            case 0xcd: compare(a, read(word())); break;
            case 0xd1: compare(a, read(indirect())); break;
            case 0xdd: compare(a, read((word() + x) & 65535)); break;
            case 0xd9: compare(a, read((word() + y) & 65535)); break;
            case 0xe0: compare(x, byte()); break;
            case 0xe4: compare(x, read(byte())); break;
            case 0xc0: compare(y, byte()); break;
            case 0x38: carry = true; break;
            case 0x18: carry = false; break;
            case 0xe5: case 0xe9: case 0x65: case 0x69: {
                const v = op & 4 ? read(byte()) : byte();
                const result = op & 128 ? a - v - !carry : a + v + carry;
                carry = op & 128 ? result >= 0 : result > 255;
                a = flags(result); break;
            }
            case 0xe6: case 0xc6: { const p = byte(); write(p, flags(read(p) + (op === 0xe6 ? 1 : -1))); break; }
            case 0xc8: y = flags(y + 1); break;
            case 0x88: y = flags(y - 1); break;
            case 0xe8: x = flags(x + 1); break;
            case 0xca: x = flags(x - 1); break;
            case 0xaa: x = flags(a); break;
            case 0xa8: y = flags(a); break;
            case 0x8a: a = flags(x); break;
            case 0x98: a = flags(y); break;
            case 0x0a: carry = !!(a & 128); a = flags(a << 1); break;
            case 0xf0: case 0xd0: case 0x30: case 0x10: case 0x90: case 0xb0: {
                const jump = byte() << 24 >> 24;
                if ({240:zero,208:!zero,48:negative,16:!negative,144:!carry,176:carry}[op]) pc += jump;
                break;
            }
            case 0x4c: pc = word(); break;
            case 0x20: {
                const target = word();
                if (target === clock) {
                    ram[0x1b] = ticks++; ram[0x1c] = ram[0x1d] = ram[0x1e] = 0;
                    a = flags(0);
                } else { calls.push(pc); pc = target; }
                break;
            }
            case 0x60: if (calls.length) pc = calls.pop(); else done = true; break;
            default: assert.fail('Unsupported linked SoftIEC opcode $' + op.toString(16) + ' at $' + (pc - 1).toString(16));
            }
        }
        assert(done, 'linked SoftIEC probe returns');
        if (fixture.overflow) {
            assert.equal(a,0);assert.equal(abort,1);assert.equal(dataAt,256);
            continue;
        }
        assert.deepEqual(request, fixture.dos ? [] : [5,1], 'original target IDENTIFY or existing DOS reply');
        assert.equal(dataAt, reply.length, 'identity FIFO consumed');
        assert.equal(statusAt, status.length, 'every status FIFO byte must actually be read');
        const expected = fixture.dos ? !fixture.error : status[0] === 0 || status[1] === 48;
        assert.equal(a, +expected, 'linked target result');
        if (fixture.dos) {
            assert.equal(ack,1);assert.equal(abort,0);
            assert.deepEqual([...ram.subarray(0x7800,0x7800+reply.length)],reply);
            assert.equal(ram[0x7700] | ram[0x7701]<<8,reply.length);
            assert.equal(!!ram[0x7702],!!fixture.more);
        } else { assert.equal(ack, +expected); assert.equal(abort, +!expected); }
    }
};

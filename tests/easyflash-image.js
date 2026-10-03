require('./setup');
// Independent host-side decoding of the cartridge filesystem, for checking
// actual persisted bytes rather than trusting shell output alone.
const fs = require('fs'), assert = require('assert/strict');
/** Decode a CRT path into committed journal state and exact live-file bytes. */
function readImage(file) {
    const crt = fs.readFileSync(file), sides = [Buffer.alloc(65536, 255), Buffer.alloc(65536, 255)];
    assert.equal(crt.subarray(0, 16).toString(), 'C64 CARTRIDGE   ');
    assert.equal(crt.readUInt16BE(22), 32);
    for (let p = crt.readUInt32BE(16); p < crt.length;) {
        assert.equal(crt.subarray(p, p + 4).toString(), 'CHIP');
        const size = crt.readUInt32BE(p + 4), bank = crt.readUInt16BE(p + 10),
              address = crt.readUInt16BE(p + 12);
        assert.equal(size, 8208);
        assert.equal(crt.readUInt16BE(p + 14), 8192);
        if (bank >= 56 && bank <= 63) {
            assert([0x8000, 0xa000].includes(address));
            crt.copy(sides[address === 0xa000 ? 1 : 0], (bank - 56) * 8192, p + 16, p + size);
        }
        p += size;
        assert(p <= crt.length);
    }

    const valid = [];
    for (let side = 0; side < 2; side++) {
        const b = sides[side];
        if (b.subarray(0, 4).toString('hex') !== '4d464a03' || b[15] !== 165)
            continue;
        const base = b.readUInt16LE(6);
        if (base < 32 || base > 65504 || crc(b.subarray(0, 8)) !== b.readUInt16LE(8))
            continue;
        const slots = new Map(), records = [];
        let end = 32, dirty = false;
        while (end <= 65504 - 32) {
            const h = b.subarray(end, end + 32), span = h.readUInt16LE(24),
                  off = h.readUInt16LE(18), len = h.readUInt16LE(20), kind = h[29], slot = h[23];
            if (h[0] === 255 && h[28] === 255)
                break;
            if (span < 32 || span > 65504 - end || h[28] !== 74 || h[31] !== 165 || slot >= 40 ||
                kind < 1 || kind > 3 || !h[0] || h[16] || h[22] > 1 ||
                (h[30] !== 255 && (h[30] >= 40 || h[30] === slot)) ||
                (kind === 1 && (off !== end + 32 || len !== span - 32)) ||
                (kind !== 1 && span !== 32) || len > 64000 ||
                (kind === 2 && (off < 32 || off > end || len > end - off)) ||
                crc(Buffer.concat(
                    [b.subarray(end + 32, end + span), h.subarray(0, 26), h.subarray(28, 31)])) !==
                    h.readUInt16LE(26)) {
                dirty = true;
                break;
            }
            const name = h.subarray(0, 17).toString('latin1').split('\0')[0];
            if (h[30] < 40)
                slots.delete(h[30]);
            if (kind === 3)
                slots.delete(slot);
            else
                slots.set(slot, {
                    name,
                    data: Buffer.from(b.subarray(off, off + len)),
                    type: h[17],
                    readonly: h[22],
                    offset: off
                });
            records.push({at: end, span, kind, slot, drop: h[30], name, offset: off, length: len});
            end += span;
            if (end > base && end - span < base) {
                end = 0;
                break;
            }
        }
        if (end < base)
            continue;
        const files = new Map([...slots.values()].map(f => [f.name, f]));
        assert.equal(files.size, slots.size, 'unique live filenames');
        valid.push({generation: b.readUInt16LE(4), files, end, base, records, dirty, side, sides});
    }
    assert(valid.length, 'at least one committed journal sector');
    if (valid.length === 2 && ((valid[1].generation - valid[0].generation + 65536) & 65535) < 32768)
        return valid[1];
    return valid[0];
}
/** Compute CRC-16/CCITT for bytes independently of the cartridge implementation. */
function crc(bytes) {
    let c = 0xffff;
    for (const v of bytes) {
        c ^= v * 256;
        for (let i = 0; i < 8; i++)
            c = c & 0x8000 ? ((c * 2) ^ 0x1021) & 65535 : (c * 2) & 65535;
    }
    return c;
}

/** Verify bundled resources in the distribution CRT path; return its live-file map. */
function verifyDistribution(file) {
    const {files} = readImage(file);
    const names = ['CGA.CPI', 'AUTOEXEC.SAMPLE', 'MANUAL.TXT', 'CHANGELOG.TXT', 'LICENSE.TXT'];
    assert.equal(files.size, names.length);
    for (const name of names) {
        assert.deepEqual(files.get(name).data, fs.readFileSync('build/' + name), name);
        assert.equal(files.get(name).readonly, 0);
    }
    console.log('PASS cartridge resource bytes and filesystem structure');
    return files;
}
module.exports = {
    readImage,
    verifyDistribution,
    crc
};
if (require.main === module)
    verifyDistribution(process.argv[2] || 'build/easyflash/MCS-DOS.crt');

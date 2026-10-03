// Independent D64/D71/D81 chain reader for exact persisted-byte assertions.
const fs = require('fs'), assert = require('assert/strict');
/** Read file chains from a generated disk path, preserving bytes, type and REL record length. */
function files(file) {
    const b = fs.readFileSync(file), d81 = b.length === 819200, entries = new Map();
    assert([174848, 349696, 819200].includes(b.length), 'supported generated disk geometry');
    const tracks = d81 ? 80 : b.length === 349696 ? 70 : 35;
    function offset(t, s) {
        assert(t >= 1 && t <= tracks, 'track lies within disk');
        const local = (t - 1) % 35 + 1;
        const sectors = d81 ? 40 : local <= 17 ? 21 : local <= 24 ? 19 : local <= 30 ? 18 : 17;
        assert(s >= 0 && s < sectors, 'sector lies within track');
        let n = 0;
        for (let i = 1; i < t; i++) {
            const k = (i - 1) % 35 + 1;
            n += d81 ? 40 : k <= 17 ? 21 : k <= 24 ? 19 : k <= 30 ? 18 : 17;
        }
        return (n + s) * 256;
    }
    let t = d81 ? 40 : 18, s = d81 ? 3 : 1;
    const directorySeen = new Set();
    while (t) {
        const o = offset(t, s);
        assert(!directorySeen.has(o), 'acyclic directory chain');
        directorySeen.add(o);
        for (let i = 0; i < 256; i += 32) {
            const e = o + i;
            if (!(b[e + 2] & 7))
                continue;
            const name = b.subarray(e + 5, e + 21).toString('latin1').replace(/\xa0+$/, '');
            let tr = b[e + 3], se = b[e + 4];
            const data = [], tracks = [], seen = new Set();
            while (tr) {
                const p = offset(tr, se);
                assert(!seen.has(p), 'acyclic file chain');
                seen.add(p);
                tracks.push(tr);
                assert(b[p] || b[p + 1] >= 1, 'valid final byte count');
                data.push(b.subarray(p + 2, p + (b[p] ? 256 : b[p + 1] + 1)));
                tr = b[p];
                se = b[p + 1];
            }
            assert(!entries.has(name), 'unique disk filenames');
            const blocks = b.readUInt16LE(e + 30);
            // Directory allocation is not a chain-length invariant: REL includes
            // side sectors, and native DOS can retain an inflated count after append.
            entries.set(name, {
                data: Buffer.concat(data),
                tracks,
                blocks,
                chainBlocks: seen.size,
                type: b[e + 2],
                recordLength: b[e + 23]
            });
        }
        t = b[o];
        s = b[o + 1];
    }
    return entries;
}
module.exports = {files};

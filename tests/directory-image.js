// Independent sector decoder for directory and file contents in D81/native media.
const assert = require('assert/strict');
module.exports = function directoryImage(bytes, sectorsPerTrack, headerTrack, headerSector = 0) {
    const offset = (t, s) => {
        const at = ((t - 1) * sectorsPerTrack + s) * 256;
        assert(t && s < sectorsPerTrack && at + 256 <= bytes.length, 'valid sector address');
        return at;
    };
    function chain(t, s) {
        const result = [], seen = new Set();
        while (t) {
            const at = offset(t, s);
            assert(!seen.has(at), 'acyclic file chain');
            seen.add(at);
            const end = bytes[at] ? 256 : bytes[at + 1] + 1;
            assert(end >= 2, 'valid final sector length');
            result.push(bytes.subarray(at + 2, at + end));
            t = bytes[at]; s = bytes[at + 1];
        }
        return Buffer.concat(result);
    }
    const header = offset(headerTrack, headerSector), result = new Map(), seen = new Set();
    let t = bytes[header], s = bytes[header + 1];
    while (t) {
        const at = offset(t, s);
        assert(!seen.has(at), 'acyclic directory chain');
        seen.add(at);
        for (let n = 0; n < 256; n += 32) {
            const e = at + n, type = bytes[e + 2] & 7;
            if (!type) continue;
            const name = bytes.subarray(e + 5, e + 21).toString('latin1').replace(/\xa0+$/, '');
            const track = bytes[e + 3], sector = bytes[e + 4];
            result.set(name, {type, track, sector, recordLength: bytes[e + 23],
                data: type < 5 ? chain(track, sector) : null});
        }
        t = bytes[at]; s = bytes[at + 1];
    }
    return result;
};

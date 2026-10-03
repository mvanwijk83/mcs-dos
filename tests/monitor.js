// Shared decoding keeps monitor transport details out of behavioral scenarios.
const assert = require('assert/strict');

/** Read an inclusive memory range through command, the owned monitor request function. */
async function memory(command, first, last = first) {
    let response;
    // A delayed resume prompt can arrive before the actual memory response.
    // Retry that read once; never retry a failed behavioral assertion.
    for (let attempt = 0; attempt < 2; attempt++) {
        response = await command(`m ${first.toString(16)} ${last.toString(16)}`);
        const bytes = new Array(last - first + 1).fill(undefined);
        for (const line of response.split('\n')) {
            const row = line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);
            if (!row)
                continue;
            const offset = parseInt(row[1], 16) - first;
            const values = row[2].trim().split(/\s+/).filter(v => /^[\da-f]{2}$/i.test(v));
            values.forEach((value, index) => {
                const position = offset + index;
                if (position >= 0 && position < bytes.length)
                    bytes[position] = parseInt(value, 16);
            });
        }
        if (!bytes.includes(undefined))
            return bytes;
    }
    assert.fail('Incomplete monitor memory response:\n' + response);
}

/** Convert 1000 VIC screen cells into 25 readable rows, ignoring reverse-video bits. */
function rows(bytes) {
    assert.equal(bytes.length, 1000, 'complete C64 screen');
    return Array.from({length: 25}, (_, row) => bytes.slice(row * 40, row * 40 + 40)
                                        .map(value => {
                                            const code = value & 127;
                                            if (code === 27 || code === 29)
                                                return String.fromCharCode(code + 64);
                                            return String.fromCharCode(
                                                code >= 1 && code <= 26 ? code + 96 : code);
                                        })
                                        .join('')
                                        .trimEnd());
}
module.exports = {
    memory,
    rows
};

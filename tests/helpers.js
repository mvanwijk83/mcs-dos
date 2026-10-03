// Monitor parsing must reject partial reads and preserve diagnostic screen glyphs.
const assert = require('assert/strict');
require('./setup');
const fs = require('fs');
const {files} = require('./disk-image');
const {memory, rows} = require('./monitor');
(async () => {
    const text = rows([1, 27, 29, 129, 155, 157, ...new Array(994).fill(32)]);
    assert.equal(text[0], 'a[]a[]');
    assert.equal(text.length, 25);
    assert.throws(() => rows([1]), /complete C64 screen/);
    // Offset rows, extra text and unrelated reads must not shift the result.
    const response =
        '(C:$1234)\n>C:1200  ff ff ff\n' +
        '>C:1234  01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10  ................\n' +
        '>C:1244  11 12 13 14 15 16 17 18\n(C:$1234)';
    let reads = 0;
    const bytes = await memory(async command => {
        assert.equal(command, 'm 1234 1247');
        return ++reads === 1 ? '(C:$1234)' : response;
    }, 0x1234, 0x1247);
    assert.equal(reads, 2, 'retry an empty response once');
    assert.deepEqual(bytes, Array.from({length: 20}, (_, i) => i + 1));
    await assert.rejects(memory(async () => '>C:1234  01 02\n>C:1238  05', 0x1234, 0x1238),
        /Incomplete monitor memory response/);
    // Native DOS can retain an inflated allocation after append. Decode the
    // payload from its chain rather than treating that count as an exact length.
    const disk = Buffer.alloc(174848), directory = 358 * 256;
    disk[directory + 2] = 0x81;
    disk[directory + 3] = 1;
    disk.fill(0xa0, directory + 5, directory + 21);
    disk.write('TEST', directory + 5);
    disk.writeUInt16LE(2, directory + 30);
    disk[1] = 2;
    disk[2] = 65;
    const file = 'build/test-disk-reader.d64';
    fs.writeFileSync(file, disk);
    const entry = files(file).get('TEST');
    assert.equal(entry.data.toString(), 'A');
    assert.equal(entry.blocks, 2);
    assert.equal(entry.chainBlocks, 1);
    disk[directory] = 18;
    disk[directory + 1] = 1;
    fs.writeFileSync(file, disk);
    assert.throws(() => files(file), /acyclic directory chain/);
    console.log(
        'PASS monitor offsets, transient prompt, missing-byte rejection and reverse-video glyphs');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require('assert/strict'), fs = require('fs');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
require('./shell')('input-history', async ({disk, command, keys, enter}) => {
    // Interactive input accepts exactly 64 characters. Overflow is discarded.
    const longest = 'echo ' + 'x'.repeat(50) + '>limitout';
    assert.equal(longest.length,64);
    await enter(longest + 'z');
    await keys('\\x91');
    await enter('');
    for (let i = 0; i < 11; i++) await enter('echo history' + String(i).padStart(2, '0'));
    await keys('draft');
    for (let i = 10; i >= 1; i--) {
        const text = await keys('\\x91');
        assert(text.endsWith('8:>echo history' + String(i).padStart(2, '0')), text);
    }
    assert((await keys('\\x91')).endsWith('8:>echo history01'));
    let text;
    for (let i = 0; i < 10; i++) text = await keys('\\x11');
    assert(text.endsWith('8:>draft'), text);
    await keys('\\x03');
    await command('detach 8');
    const files = require('./drive-compat').files(disk);
    assert(!files.has('LIMITOUTZ'), 'overflow character must not enter the filename');
    assert.equal(files.get('LIMITOUT').data.toString(),'X'.repeat(50)+'\r',
        'full-length command and its recalled copy must execute without the overflow character');
    // Unlike interactive input, a batch must reject an overlong line atomically.
    const batch = '@echo off\r' + longest + '\r' + longest + 'z\recho should-not-run\r';
    fs.writeFileSync('build/input-limits.bat', Buffer.from(batch.toUpperCase()));
    execFileSync(tool('vice', 'c1541'), ['-attach', disk, '-write', 'build/input-limits.bat', 'limits.bat,s'], {stdio: 'pipe'});
    await command(`attach "${disk}" 8`);
    await enter('dir /b'); // Refresh the shell cache after the external disk edit.
    await enter('cls');
    text = await enter('run limits.bat');
    assert(text.includes('Batch command too long'), text);
    assert(!text.includes('should-not-run'), text);
    console.log('PASS 64-character input, history wrap/draft restoration, and batch overflow refusal');
}).catch(error => { console.error(error); process.exitCode = 1; });

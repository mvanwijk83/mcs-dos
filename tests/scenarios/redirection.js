// Verify actual disk/cartridge channel bytes, independently of screen output.
const fs = require('fs');
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('../setup');
const {files} = require('../disk-image');
const {readImage} = require('../easyflash-image');
const messages = require('../output');
module.exports = async function({command, enter, check, disk, crt, root}) {
    const raw = Buffer.from(Array.from({length: 1024}, (_, i) => (i * 37) & 255));
    fs.writeFileSync('build/easyflash/redirect-raw', raw);
    fs.writeFileSync('build/easyflash/redirect.bat',
        require('../../scripts/petscii')('@echo off\recho batch>bt\recho append>>bt\r'));
    execFileSync(tool('vice', 'c1541'),
        [
            '-attach', disk, '-write', 'build/easyflash/redirect-raw', 'raw,s', '-write',
            'build/easyflash/redirect.bat', 'redirect.bat,s'
        ],
        {stdio: 'pipe', windowsHide: true});
    await command(`attach "${disk}" 8`);
    for (const device of [0, 8]) {
        await enter(device + ':');
        await enter('echo first >out');
        await enter('echo second >>out');
        await enter('echo joined; >noseparator');
        await enter('echo line;; >semicolon');
        await enter('echo old longer text >replace');
        await enter('echo x >replace');
        await enter('echo new >>new');
        await enter('echo. >blank');
        await enter('echo "a>b" >"quoted name"');
        await enter('type 8:raw >binary');
        await enter('type 8:raw >>binary');
        await check('type binary >binary', messages.SYSOUT_CANNOT_REDIR_TYPE_ON_SELF);
        await check('type binary >>binary', messages.SYSOUT_CANNOT_REDIR_TYPE_ON_SELF);
        await check('echo bad >one >two', messages.SYSOUT_MULTIPLE_REDIR);
        await check('echo bad >lpt1', messages.SYSOUT_PRINTER_REDIR);
        await check('ver >unwanted', messages.SYSOUT_REDIR_NOT_SUPPORTED);
        await check('echo bad >', messages.SYSOUT_INVALID_DEST);
        await check('type missing >replace', messages.SYSOUT_FILE_NOT_FOUND);
        await enter('echo after-error >recovered');
        await enter('run 8:redirect.bat');
    }
    // One free block cannot hold the binary input. The write failure must leave
    // normal output and subsequent file operations usable.
    const full = root + '/build/easyflash/redirect-full.d64';
    fs.writeFileSync('build/easyflash/redirect-fill', Buffer.alloc(663 * 254, 65));
    execFileSync(tool('vice', 'c1541'),
        [
            '-format', 'full,rd', 'd64', full, '-attach', full, '-write',
            'build/easyflash/redirect-fill', 'fill,s'
        ],
        {stdio: 'pipe', windowsHide: true});
    // Reuse the already initialized drive; attach-time power-up of a second
    // drive should not influence this output-channel recovery test.
    await command('detach 8');
    await command(`attach "${full}" 8`);
    // Clear open DOS channels retained from the previous disk before this case.
    await enter('reboot');
    // Tell DOS to reload the new medium's header and allocation map.
    await enter('diskinit 8:');
    const failure = await enter('type 0:binary >8:overflow');
    assert(failure.includes(messages.SYSOUT_WRITE_FAULT_ERR) ||
               failure.includes(messages.SYSOUT_DISK_ERR),
        failure);
    assert((await enter('echo recovered after full disk')).includes('recovered after full disk'));
    // Detaching flushes the emulated drives and writable CRT to their host files.
    await command('detach 8');
    await command('detach $20');
    for (const entries of [files(disk), readImage(crt).files]) {
        const data = name => entries.get(name).data;
        assert.equal(data('OUT').toString(), 'FIRST\rSECOND\r');
        assert.equal(data('NOSEPARATOR').toString(), 'JOINED');
        assert.equal(data('SEMICOLON').toString(), 'LINE;\r');
        assert.equal(data('REPLACE').toString(), 'X\r');
        assert.equal(data('NEW').toString(), 'NEW\r');
        assert.equal(data('BLANK').toString(), '\r');
        assert.equal(data('QUOTED NAME').toString(), '"A>B"\r');
        assert.deepEqual(data('BINARY'), Buffer.concat([raw, raw]));
        assert.equal(data('RECOVERED').toString(), 'AFTER-ERROR\r');
        assert.equal(data('BT').toString(), 'BATCH\rAPPEND\r');
        assert(!entries.has('UNWANTED'), 'rejected redirection must not create a file');
    }
    console.log(
        'PASS overwrite, append/create, quoting, ECHO escapes, binary TYPE and error recovery on both media');
};
